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
  self.variableDefs = {};
  self.variableValues = {};
  self.presets = {};
  self.presetStructure = [];
  self.logs = [];
  self.status = null;
  // `label` is a getter on InstanceBase backed by a private field, so on a
  // prototype-built instance it throws rather than returning undefined. It has
  // to be defined as an own property — which is also the point of the check
  // below: presets must build their variable references from it.
  Object.defineProperty(self, "label", {
    value: "kestrel-1",
    configurable: true,
  });
  self.setActionDefinitions = (d) => (self.actions = d);
  self.setFeedbackDefinitions = (d) => (self.feedbacks = d);
  self.setVariableDefinitions = (d) => {
    // Mirrors the real implementation, which THROWS on an array. A permissive
    // fixture here is what let the 1.x array shape ship: init() died on every
    // install with no actions, no variables and no presets, and this suite
    // stayed green throughout.
    if (Array.isArray(d))
      throw new Error("Variable definitions should be an object, not an array");
    self.variableDefs = d;
  };
  self.setVariableValues = (v) => Object.assign(self.variableValues, v);
  self.setPresetDefinitions = (structure, presets) => {
    assert.ok(
      Array.isArray(structure),
      "preset structure must be the FIRST argument and an array",
    );
    assert.ok(
      presets && !Array.isArray(presets),
      "preset definitions must be the second argument, an object",
    );
    self.presetStructure = structure;
    self.presets = presets;
  };
  self.checkAllFeedbacks = () => (self.checkedAll = true);
  self.checkFeedbacks = () => {
    // `checkFeedbacks` takes one or more feedback TYPES and forwards them as a
    // filter, so a bare call sends `[undefined]` and re-evaluates nothing. It
    // fails silently: the module loads, routes, and simply never updates a
    // tally again.
    throw new Error(
      "bare checkFeedbacks() checks nothing - use checkAllFeedbacks()",
    );
  };
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

// --- the module surface, against base 2.x ---------------------------------
//
// The traps below either kill init() outright or fail silently at runtime, and
// none of them is visible to a protocol test. Re-registered from the current
// state first, so this reads a consistent snapshot rather than whatever the
// cycle and live-feed checks above happened to leave behind.
UpdateActions(self);
UpdateFeedbacks(self);
UpdateVariables(self);
UpdatePresets(self);
refreshVariableValues(self);

await check(
  "variable definitions are an object keyed by id, not an array",
  () => {
    assert.ok(
      self.variableDefs && !Array.isArray(self.variableDefs),
      "base 2.x throws on an array, which kills init()",
    );
    for (const [id, d] of Object.entries(self.variableDefs)) {
      assert.ok(typeof id === "string" && id.length > 0);
      assert.ok(d.name, `${id} needs a name`);
      assert.ok(
        !("variableId" in d),
        `${id} keeps the 1.x variableId field, which belongs in the key`,
      );
    }
  },
);

await check("every variable set has a definition, and vice versa", () => {
  const defined = new Set(Object.keys(self.variableDefs));
  for (const id of Object.keys(self.variableValues)) {
    assert.ok(
      defined.has(id),
      `${id} is set but never defined, so it renders as raw text`,
    );
  }
  for (const id of defined) {
    assert.ok(
      id in self.variableValues,
      `${id} is defined but never given a value`,
    );
  }
});

await check(
  "every preset referenced in the structure exists, exactly once",
  () => {
    const referenced = [];
    for (const section of self.presetStructure) {
      assert.ok(section.id && section.name, "sections need an id and a name");
      for (const entry of section.definitions) {
        if (typeof entry === "string") referenced.push(entry);
        else {
          assert.equal(entry.type, "simple", "groups must declare their type");
          assert.ok(entry.id && entry.name, "groups need an id and a name");
          referenced.push(...entry.presets);
        }
      }
    }
    for (const id of referenced)
      assert.ok(
        self.presets[id],
        `structure references a missing preset: ${id}`,
      );
    assert.equal(
      referenced.length,
      Object.keys(self.presets).length,
      "every preset should be reachable from the structure",
    );
    assert.equal(
      new Set(referenced).size,
      referenced.length,
      "a preset is referenced twice",
    );
  },
);

await check("no preset carries a 1.x category field or button type", () => {
  for (const [id, p] of Object.entries(self.presets)) {
    assert.ok(
      !("category" in p),
      `${id} uses the 1.x category field, which loads but never appears`,
    );
    assert.equal(
      p.type,
      "simple",
      `${id} should be type 'simple', not 'button'`,
    );
  }
});

await check(
  "preset button text uses real newlines, not an escaped backslash-n",
  () => {
    for (const [id, p] of Object.entries(self.presets)) {
      assert.ok(
        !(p.style?.text ?? "").includes("\\n"),
        `${id} carries a literal backslash-n, which renders as text`,
      );
    }
  },
);

await check(
  "preset variable references use the connection label, not the module id",
  () => {
    let checked = 0;
    for (const [id, p] of Object.entries(self.presets)) {
      const text = p.style?.text ?? "";
      if (!text.includes("$(")) continue;
      checked += 1;
      for (const ref of text.matchAll(/\$\(([^:)]+):/g)) {
        assert.equal(
          ref[1],
          self.label,
          `${id} hardcodes a variable prefix: ${text}`,
        );
      }
    }
    assert.ok(
      checked > 0,
      "no preset references a variable — check is vacuous",
    );
  },
);

await check("every preset variable reference names a defined variable", () => {
  for (const [id, p] of Object.entries(self.presets)) {
    const text = p.style?.text ?? "";
    for (const ref of text.matchAll(/\$\([^:)]+:([^)]+)\)/g)) {
      assert.ok(
        ref[1] in self.variableDefs,
        `${id} references undefined variable ${ref[1]}`,
      );
    }
  }
});

await check(
  "every preset action names a real action, with options it accepts",
  () => {
    for (const [id, p] of Object.entries(self.presets)) {
      for (const step of p.steps) {
        for (const a of step.down) {
          const def = self.actions[a.actionId];
          assert.ok(def, `${id} references unknown action ${a.actionId}`);
          const fields = new Set(def.options.map((o) => o.id));
          for (const key of Object.keys(a.options ?? {}))
            assert.ok(
              fields.has(key),
              `${id} passes option "${key}", which ${a.actionId} does not define`,
            );
        }
      }
    }
  },
);

await check("every preset feedback names a real feedback", () => {
  for (const [id, p] of Object.entries(self.presets)) {
    for (const f of p.feedbacks) {
      assert.ok(
        self.feedbacks[f.feedbackId],
        `${id} references unknown feedback ${f.feedbackId}`,
      );
    }
  }
});

// --- the parseVariablesInString trap ----------------------------------------
// `parseVariablesInString` and `parseVariablesInField` were removed from
// @companion-module/base 2.x. Neither is on the callback context, on
// InstanceBase, or anywhere in the package. Companion expands a `useVariables`
// option itself before invoking the callback, so the option arrives already
// resolved: the call is redundant as well as fatal, throwing "... is not a
// function" the moment that one action or feedback fires. Nothing else catches
// it — the module loads, init() succeeds, every definition registers, and every
// path that does not make the call keeps working, so the suite passes with the
// bug live. This fixture no longer stubs either function, so a reintroduced
// call now throws here too; the grep is the backstop for a path the fixture
// never exercises. It matches the call form only, so prose naming the
// functions stays legal.
const { readdirSync: pvReadDir, readFileSync: pvReadFile } =
  await import("node:fs");
const pvOffenders = () => {
  const dir = new URL("../src/", import.meta.url).pathname;
  const bad = [];
  for (const f of pvReadDir(dir)) {
    if (!/\.(js|ts)$/.test(f)) continue;
    if (/parseVariablesIn(String|Field)\s*\(/.test(pvReadFile(dir + f, "utf8")))
      bad.push(f);
  }
  return bad;
};

await check("no parseVariablesInString/Field call survives in src/", () => {
  assert.deepEqual(
    pvOffenders(),
    [],
    "read the already-resolved event.options value instead",
  );
});

// Companion keys an installed module on id + version and discards a reinstall
// whose pair it already has. If companion/manifest.json lags package.json, every
// release after the manifest's version is silently refused by any Companion that
// already has the module — the update appears to work and changes nothing. These
// two agree today; this keeps them agreeing.
await check(
  "companion/manifest.json version matches package.json",
  async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p) =>
      JSON.parse(readFileSync(new URL(p, import.meta.url).pathname, "utf8"));
    assert.equal(
      read("../companion/manifest.json").version,
      read("../package.json").version,
      "bump both, or the release never reaches an existing install",
    );
  },
);

console.log(`\n${passed} checks passed`);
