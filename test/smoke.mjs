// Drives the module's real source against a fake Kestrel: a real HTTP server
// for the command endpoints and a real WebSocket pushing state. Checks the
// definition shapes, the generated crosspoint presets, the tally feedbacks, the
// cycle arithmetic, and — the one that matters most — that a 200-with-ok:false
// is treated as a failure rather than as a successful take.
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const { refreshVariableValues } = await import(`${MOD}variables.js`);
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const api = await import(`${MOD}api.js`);
const { safeId, default: ModuleInstance } = await import(`${MOD}main.js`);

// --- a fake Kestrel -------------------------------------------------------

const state = {
  revision: 1,
  outputs_enabled: true,
  output_format: { name: "1080p50", width: 1920, height: 1080 },
  scaling: "bicubic",
  input: { live: true, width: 1920, height: 1080, device: "DeckLink Duo (1)" },
  decklink: "DeckLink: 4 sub-devices, 2 active in the current profile",
  frames: 1234,
  rois: [
    {
      id: 1,
      name: "Lectern",
      rect: [0.1, 0.3, 0.2, 0.2],
      colour: [255, 92, 92],
      outputs: [2],
    },
    {
      id: 2,
      name: "Drums",
      rect: [0.6, 0.4, 0.3, 0.3],
      colour: [92, 200, 255],
      outputs: [],
    },
  ],
  outputs: [
    {
      id: 1,
      label: "SDI 1",
      assigned: null,
      assigned_name: null,
      idle: "black",
      fit: "fit",
      scale_percent: null,
      quality: null,
      device: "DeckLink Duo (2)",
      on_air: "black",
      buffered: 6,
    },
    {
      id: 2,
      label: "SDI 2",
      assigned: 1,
      assigned_name: "Lectern",
      idle: "bars",
      fit: "fit",
      scale_percent: 500,
      quality: "heavy",
      device: "DeckLink Duo (3)",
      on_air: "region",
      buffered: 6,
    },
  ],
};

const calls = [];
const body = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const payload =
    req.method === "POST" ? JSON.parse((await body(req)) || "{}") : {};
  calls.push({ path: url.pathname, body: payload });

  if (url.pathname === "/api/state") return send(200, state);
  if (url.pathname === "/api/route") {
    // Kestrel's real refusal shape: 200, ok:false, and a populated message.
    if (payload.roi === 99) {
      return send(200, { ok: false, error: "no region with id roi99" });
    }
    return send(200, { ok: true });
  }
  if (url.pathname === "/api/output/enable") return send(200, { ok: true });
  if (url.pathname.startsWith("/api/output/")) return send(200, { ok: true });
  if (url.pathname.startsWith("/api/roi/")) return send(200, { ok: true });
  return send(404, { ok: false, error: "not found" });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => ws.send(JSON.stringify(state)));

// --- a stand-in for Companion's host -------------------------------------

// `InstanceBase`'s constructor refuses to be called outside Companion's own
// host, so the instance is built from the real prototype instead of being
// constructed. That matters: subclassing and re-implementing the methods — or
// hand-rolling a plain object with the same shape — would test a copy of the
// logic rather than the logic, and `applyState`, `nextRoi` and `command` are
// exactly the parts worth testing.
function FakeInstance() {
  const self = Object.create(ModuleInstance.prototype);
  self.config = { host: "127.0.0.1", port: String(port), presetlimit: 200 };
  self.state = {
    rois: [],
    outputs: [],
    outputs_enabled: true,
    input: { live: false, width: 0, height: 0, device: null },
    output_format: { name: "" },
    decklink: "",
  };
  self.actions = {};
  self.feedbacks = {};
  self.variableDefs = [];
  self.variableValues = {};
  self.presets = {};
  self.logs = [];
  self.status = null;
  self.setActionDefinitions = (d) => (self.actions = d);
  self.setFeedbackDefinitions = (d) => (self.feedbacks = d);
  self.setVariableDefinitions = (d) => (self.variableDefs = d);
  self.setVariableValues = (v) => Object.assign(self.variableValues, v);
  self.setPresetDefinitions = (p) => (self.presets = p);
  self.checkFeedbacks = () => {};
  self.updateStatus = (s, msg) => (self.status = [s, msg]);
  self.log = (level, msg) => self.logs.push([level, msg]);
  return self;
}

const self = FakeInstance();
self.applyState(state);

let passed = 0;
// Awaited, always. Several of these checks are async, and a non-awaiting
// harness runs them out of order against shared state — which shows up as
// every check passing and then a stray failure after the summary line.
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("companion-module-kestrel smoke test\n");

// --- definitions ----------------------------------------------------------

await check("every action is registered", () => {
  for (const id of [
    "route",
    "clear_output",
    "cycle_roi",
    "salvo",
    "outputs_enable",
    "set_idle",
    "nudge_roi",
  ]) {
    assert.ok(self.actions[id], `missing action ${id}`);
  }
});

await check("every feedback is registered", () => {
  for (const id of [
    "crosspoint",
    "output_on_air",
    "outputs_enabled",
    "input_live",
    "scale_over",
  ]) {
    assert.ok(self.feedbacks[id], `missing feedback ${id}`);
  }
});

await check(
  "the route action offers a clear entry as well as every region",
  () => {
    const choices = self.actions.route.options.find(
      (o) => o.id === "roi",
    ).choices;
    assert.equal(choices.length, 3, "two regions plus a clear");
    assert.ok(choices.some((c) => c.id === -1));
  },
);

await check(
  "output choices name the card, because eight ports all look alike",
  () => {
    const choices = self.actions.route.options.find(
      (o) => o.id === "output",
    ).choices;
    assert.match(choices[0].label, /SDI 1 \(DeckLink Duo \(2\)\)/);
  },
);

// --- feedbacks ------------------------------------------------------------

const fb = (id, options) => self.feedbacks[id].callback({ options });

await check("crosspoint tally follows the routing", () => {
  assert.equal(fb("crosspoint", { output: 2, roi: 1 }), true);
  assert.equal(fb("crosspoint", { output: 1, roi: 1 }), false);
  assert.equal(fb("crosspoint", { output: 2, roi: 2 }), false);
});

await check("a muted crosspoint does not look on air", () => {
  const lit = self.feedbacks.crosspoint.style({
    options: { output: 2, roi: 1, use_roi_colour: true },
  });
  self.state.outputs_enabled = false;
  const muted = self.feedbacks.crosspoint.style({
    options: { output: 2, roi: 1, use_roi_colour: true },
  });
  self.state.outputs_enabled = true;
  assert.notEqual(
    lit.bgcolor,
    muted.bgcolor,
    "the global kill must be visible on the surface",
  );
});

await check("on-air is not the same question as routed", () => {
  assert.equal(fb("output_on_air", { output: 2 }), true);
  // Same routing, but the output is muted: not on air.
  const saved = self.state.outputs[1].on_air;
  self.state.outputs[1].on_air = "muted";
  assert.equal(fb("output_on_air", { output: 2 }), false);
  self.state.outputs[1].on_air = saved;
});

await check("an unrouted output never trips the scale warning", () => {
  assert.equal(
    fb("scale_over", { output: 2, threshold: 200 }),
    true,
    "500% > 200%",
  );
  assert.equal(fb("scale_over", { output: 2, threshold: 600 }), false);
  assert.equal(
    fb("scale_over", { output: 1, threshold: 200 }),
    false,
    "a null scale must not read as a warning",
  );
});

await check("input lock is reported", () => {
  assert.equal(fb("input_live", {}), true);
});

// --- variables ------------------------------------------------------------

await check("variables carry the scale badge and the region name", () => {
  refreshVariableValues(self);
  const v = self.variableValues;
  assert.equal(v[`out_${safeId(2)}_roi`], "Lectern");
  assert.equal(v[`out_${safeId(2)}_scale`], "500%");
  assert.equal(
    v[`out_${safeId(1)}_scale`],
    "",
    "an unrouted output has no scale",
  );
  assert.equal(v.outputs_enabled, "yes");
  assert.equal(v.input_live, "yes");
  assert.equal(v.output_format, "1080p50");
  assert.equal(v[`roi_${safeId(1)}_outputs`], "SDI 2");
});

// --- presets --------------------------------------------------------------

await check(
  "one crosspoint preset per region per output, plus the utilities",
  () => {
    assert.ok(
      self.presets.outputs_kill,
      "the kill button is the one that matters",
    );
    assert.ok(self.presets.input_tally);
    for (const o of [1, 2]) {
      for (const r of [1, 2]) {
        assert.ok(
          self.presets[`xpt_${safeId(o)}_${safeId(r)}`],
          `missing xpt ${o}/${r}`,
        );
      }
      assert.ok(self.presets[`clear_${safeId(o)}`]);
      assert.ok(self.presets[`cycle_${safeId(o)}`]);
    }
  },
);

await check("the preset cap is honoured", () => {
  self.config.presetlimit = 1;
  UpdatePresets(self);
  const xpts = Object.keys(self.presets).filter((k) => k.startsWith("xpt_"));
  assert.equal(
    xpts.length,
    1,
    `cap ignored: ${xpts.length} crosspoint presets`,
  );
  self.config.presetlimit = 200;
  UpdatePresets(self);
});

// --- the cycle ------------------------------------------------------------

await check(
  "cycling steps through the regions and through 'nothing routed'",
  () => {
    // Output 2 currently carries region 1.
    assert.equal(
      self.nextRoi(2, 1, true),
      2,
      "next after region 1 is region 2",
    );
    assert.equal(
      self.nextRoi(2, -1, true),
      null,
      "previous is 'nothing routed'",
    );
    // Output 1 carries nothing.
    assert.equal(self.nextRoi(1, 1, true), 1);
    assert.equal(
      self.nextRoi(1, 1, false),
      1,
      "without none, start at the first region",
    );
  },
);

await check("cycling an output whose region was deleted does not throw", () => {
  self.state.outputs[1].assigned = 999;
  assert.doesNotThrow(() => self.nextRoi(2, 1, true));
  self.state.outputs[1].assigned = 1;
});

// --- commands -------------------------------------------------------------

await check(
  "a take reaches the right endpoint with the right body",
  async () => {
    await self.actions.route.callback({ options: { output: 1, roi: 2 } });
    const last = calls.at(-1);
    assert.equal(last.path, "/api/route");
    assert.deepEqual(last.body, { output: 1, roi: 2 });
  },
);

await check(
  "clearing sends an explicit null rather than omitting the field",
  async () => {
    await self.actions.route.callback({ options: { output: 1, roi: -1 } });
    assert.deepEqual(calls.at(-1).body, { output: 1, roi: null });
  },
);

await check("a salvo takes one region to every output", async () => {
  const before = calls.length;
  await self.actions.salvo.callback({ options: { roi: 1 } });
  const routes = calls.slice(before).filter((c) => c.path === "/api/route");
  assert.equal(routes.length, 2, "one take per output");
  assert.deepEqual(
    routes.map((r) => r.body.output),
    [1, 2],
  );
});

await check("a 200-with-ok:false is a failure, not a success", async () => {
  const before = self.logs.length;
  await self.actions.route.callback({ options: { output: 1, roi: 99 } });
  const logged = self.logs.slice(before);
  assert.ok(
    logged.some(([lvl, msg]) => lvl === "error" && msg.includes("roi99")),
    `a refusal must be logged with Kestrel's own message; got ${JSON.stringify(logged)}`,
  );
});

await check("the global kill toggles", async () => {
  await self.actions.outputs_enable.callback({ options: { mode: "toggle" } });
  assert.deepEqual(calls.at(-1), {
    path: "/api/output/enable",
    body: { toggle: true },
  });
  await self.actions.outputs_enable.callback({ options: { mode: "off" } });
  assert.deepEqual(calls.at(-1), {
    path: "/api/output/enable",
    body: { enabled: false },
  });
});

await check("a nudge moves the region and leaves its size alone", async () => {
  await self.actions.nudge_roi.callback({
    options: { roi: 1, direction: "right", step: 5 },
  });
  const last = calls.at(-1);
  assert.equal(last.path, "/api/roi/1");
  assert.deepEqual(
    last.body.rect.map((n) => Number(n.toFixed(4))),
    [0.15, 0.3, 0.2, 0.2],
  );
});

// --- the live feed --------------------------------------------------------

await new Promise((resolve, reject) => {
  const probe = FakeInstance();
  const original = probe.applyState.bind(probe);
  probe.applyState = (s) => {
    original(s);
    try {
      assert.equal(probe.state.rois.length, 2);
      assert.equal(probe.state.outputs.length, 2);
      assert.equal(probe.state.outputs[1].assigned, 1);
      passed += 1;
      console.log(
        "  ok  the WebSocket feed populates state without any polling",
      );
      api.socket.close();
      resolve();
    } catch (e) {
      api.socket.close();
      reject(e);
    }
  };
  api.socket.connect(probe);
});

wss.close();
server.close();
clearTimeout(watchdog);
console.log(`\n${passed} checks passed`);
