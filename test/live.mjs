// Drives this module against a **real, running Kestrel**.
//
// The smoke test proves the module is self-consistent; it cannot prove the
// fake Kestrel in it still matches the real one. This closes that gap, and it
// is the test to run after either side's shape changes.
//
// Skips cleanly when nothing is listening, so it is safe in a `npm test` chain:
//
//     node test/live.mjs [host:port]      (default 127.0.0.1:9720)

import assert from "node:assert/strict";

const target = process.argv[2] ?? "127.0.0.1:9720";
const [host, port] = target.split(":");

const MOD = new URL("../src/", import.meta.url).pathname;
const api = await import(`${MOD}api.js`);
const { default: ModuleInstance, safeId } = await import(`${MOD}main.js`);
const { refreshVariableValues } = await import(`${MOD}variables.js`);

// Is anything there?
try {
  const res = await fetch(`http://${target}/api/health`, {
    signal: AbortSignal.timeout(1500),
  });
  const health = await res.json();
  assert.equal(health.app, "kestrel", `something else is on ${target}`);
  console.log(`kestrel ${health.version} on ${target}\n`);
} catch (e) {
  console.log(
    `no Kestrel on ${target} — skipping the live test (${e.message})`,
  );
  process.exit(0);
}

function instance() {
  const self = Object.create(ModuleInstance.prototype);
  self.config = { host, port, presetlimit: 200 };
  self.state = {
    rois: [],
    outputs: [],
    outputs_enabled: true,
    input: { live: false, width: 0, height: 0, device: null },
    output_format: { name: "" },
    decklink: "",
  };
  self.variableValues = {};
  self.setActionDefinitions = (d) => (self.actions = d);
  self.setFeedbackDefinitions = (d) => (self.feedbacks = d);
  self.setVariableDefinitions = () => {};
  self.setVariableValues = (v) => Object.assign(self.variableValues, v);
  self.setPresetDefinitions = (p) => (self.presets = p);
  self.checkFeedbacks = () => {};
  self.updateStatus = () => {};
  self.log = (level, msg) => console.log(`    [${level}] ${msg}`);
  return self;
}

const self = instance();

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Wait for Kestrel's own state to satisfy a predicate. */
async function until(predicate, what, ms = 3000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const state = await (await fetch(`http://${target}/api/state`)).json();
    self.applyState(state);
    if (predicate(state)) return state;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const before = await until(() => true, "the first state");
assert.ok(
  before.outputs.length > 0,
  "this Kestrel has no outputs to test against",
);

// Everything is restored at the end, so this is safe to run against a machine
// that is set up — but not against one that is on air.
const restore = before.outputs.map((o) => [o.id, o.assigned]);
const wasEnabled = before.outputs_enabled;

try {
  await check("the WebSocket feed pushes real state", async () => {
    await new Promise((resolve, reject) => {
      const probe = instance();
      const timer = setTimeout(() => {
        api.socket.close();
        reject(new Error("no state pushed within 5s"));
      }, 5000);
      probe.applyState = (s) => {
        ModuleInstance.prototype.applyState.call(probe, s);
        clearTimeout(timer);
        api.socket.close();
        try {
          assert.ok(Array.isArray(s.outputs));
          assert.ok("outputs_enabled" in s);
          assert.ok("input" in s && "live" in s.input);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      api.socket.connect(probe);
    });
  });

  await check(
    "every field the module reads is present in the real state",
    () => {
      for (const o of before.outputs) {
        for (const key of [
          "id",
          "label",
          "assigned",
          "assigned_name",
          "idle",
          "fit",
          "scale_percent",
          "device",
          "on_air",
        ]) {
          assert.ok(
            key in o,
            `output is missing "${key}" — the module reads it`,
          );
        }
      }
      for (const r of before.rois) {
        for (const key of ["id", "name", "rect", "colour", "outputs"]) {
          assert.ok(
            key in r,
            `region is missing "${key}" — the module reads it`,
          );
        }
        assert.equal(r.rect.length, 4, "rect must be [x, y, w, h]");
      }
    },
  );

  if (before.rois.length > 0) {
    const roi = before.rois[0];
    const out = before.outputs[0];

    await check("a take really routes", async () => {
      await api.route(self, out.id, roi.id);
      const s = await until(
        (s) => s.outputs.find((o) => o.id === out.id)?.assigned === roi.id,
        "the take to land",
      );
      const o = s.outputs.find((x) => x.id === out.id);
      assert.equal(o.assigned_name, roi.name);
      assert.ok(o.scale_percent > 0, "a routed output must report a scale");
    });

    await check("the scale variable is populated for a routed output", () => {
      refreshVariableValues(self);
      const v = self.variableValues[`out_${safeId(out.id)}_scale`];
      assert.match(
        v,
        /^\d+%$/,
        `expected a percentage, got ${JSON.stringify(v)}`,
      );
    });

    await check(
      "the global kill mutes every output and keeps the routes",
      async () => {
        await api.setOutputsEnabled(self, false);
        const s = await until((s) => s.outputs_enabled === false, "the mute");
        assert.ok(
          s.outputs.every((o) => o.on_air === "muted"),
          "every output must go to black, not only the routed ones",
        );
        assert.equal(
          s.outputs.find((o) => o.id === out.id).assigned,
          roi.id,
          "the crosspoint must survive a mute",
        );
      },
    );

    await check(
      "a clear leaves the output running on its idle fill",
      async () => {
        await api.setOutputsEnabled(self, true);
        await api.route(self, out.id, null);
        const s = await until(
          (s) => s.outputs.find((o) => o.id === out.id)?.assigned === null,
          "the clear",
        );
        const o = s.outputs.find((x) => x.id === out.id);
        assert.ok(
          ["black", "bars", "full input", "no input"].includes(o.on_air),
          `an unrouted output must still be carrying something; got ${o.on_air}`,
        );
        assert.equal(o.scale_percent, null);
      },
    );

    await check("a refusal comes back with Kestrel's own message", async () => {
      await assert.rejects(
        () => api.route(self, out.id, 999999),
        (e) => {
          assert.ok(e.message.length > 0, "the error must not be empty");
          return true;
        },
      );
    });
  } else {
    console.log("  -   no regions in this show; routing checks skipped");
  }

  await check("the frame path is actually running", async () => {
    const a = (await (await fetch(`http://${target}/api/state`)).json()).frames;
    await new Promise((r) => setTimeout(r, 1000));
    const b = (await (await fetch(`http://${target}/api/state`)).json()).frames;
    assert.ok(b > a, `frame counter did not move: ${a} -> ${b}`);
    console.log(`      ~${b - a} fps`);
  });
} finally {
  for (const [id, assigned] of restore) {
    await api.route(self, id, assigned).catch(() => {});
  }
  await api.setOutputsEnabled(self, wasEnabled).catch(() => {});
  api.socket.close();
}

console.log(`\n${passed} live checks passed`);
