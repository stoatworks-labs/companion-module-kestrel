import { InstanceBase, Regex, InstanceStatus } from "@companion-module/base";
import { UpgradeScripts } from "./upgrades.js";
import UpdateActions from "./actions.js";
import UpdateFeedbacks from "./feedbacks.js";
import UpdateVariableDefinitions, {
  refreshVariableValues,
} from "./variables.js";
import UpdatePresets from "./presets.js";
import { socket } from "./api.js";

/** Companion variable ids allow only `[a-zA-Z0-9_]`. Kestrel's ids are plain
 *  integers, so this is belt and braces rather than load-bearing — but it costs
 *  nothing and stops a future string id from silently producing an unreadable
 *  variable. */
export function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

function defaultState() {
  return {
    rois: [],
    outputs: [],
    outputs_enabled: true,
    input: { live: false, width: 0, height: 0, device: null },
    output_format: { name: "" },
    decklink: "",
  };
}

export default class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.state = defaultState();
  }

  async init(config) {
    this.config = config;
    this.state = defaultState();
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
  }

  async destroy() {
    socket.close();
  }

  async configUpdated(config) {
    this.config = config;
    socket.close();
    this.state = defaultState();
    this.updateStatus(InstanceStatus.Connecting);
    socket.connect(this);
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Connection",
        value:
          "Point this at Kestrel's control API — the address shown along the bottom of its window, <code>127.0.0.1:9720</code> by default. <b>There is no authentication</b>: anyone who can reach the port can re-route every output and kill them all. Keep it on a management interface.",
      },
      {
        type: "textinput",
        id: "host",
        label: "Kestrel host",
        width: 8,
        default: "127.0.0.1",
        regex: Regex.HOSTNAME,
      },
      {
        type: "textinput",
        id: "port",
        label: "Port",
        width: 4,
        default: "9720",
        regex: Regex.PORT,
      },
      {
        type: "static-text",
        id: "presetinfo",
        width: 12,
        label: "Presets",
        value:
          "One crosspoint preset is generated per region per output, grouped by output. Eight outputs and a dozen regions is ninety-six buttons, so the list is capped — raise it if you really want them all.",
      },
      {
        type: "number",
        id: "presetlimit",
        label: "Max crosspoint presets",
        width: 6,
        min: 0,
        max: 2000,
        default: 200,
      },
    ];
  }

  /**
   * Take a pushed state object and fan the consequences out.
   *
   * Membership changes — a region created or deleted, an output added — have to
   * re-register actions, feedbacks, variables and presets, because all four are
   * built from the live lists. A routing change does not, and routing changes
   * are far more frequent; distinguishing them keeps a busy show from
   * rebuilding every definition several times a second.
   */
  applyState(state) {
    const next = {
      rois: Array.isArray(state?.rois) ? state.rois : [],
      outputs: Array.isArray(state?.outputs) ? state.outputs : [],
      outputs_enabled: state?.outputs_enabled ?? true,
      input: state?.input ?? defaultState().input,
      output_format: state?.output_format ?? { name: "" },
      decklink: state?.decklink ?? "",
    };

    const membershipChanged =
      JSON.stringify(next.rois.map((r) => [r.id, r.name, r.colour])) !==
        JSON.stringify(this.state.rois.map((r) => [r.id, r.name, r.colour])) ||
      JSON.stringify(next.outputs.map((o) => [o.id, o.label, o.device])) !==
        JSON.stringify(
          this.state.outputs.map((o) => [o.id, o.label, o.device]),
        );

    this.state = next;
    this.updateStatus(InstanceStatus.Ok);

    if (membershipChanged) {
      this.rebuild();
    } else {
      refreshVariableValues(this);
      this.checkFeedbacks();
    }
  }

  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariableDefinitions(this);
    UpdatePresets(this);
    refreshVariableValues(this);
    this.checkFeedbacks();
  }

  /**
   * Run a command and turn a refusal into a log line the operator can act on.
   *
   * Kestrel answers a refused command with HTTP 200 and `ok:false`; `api.js`
   * already turns that into a throw. What this adds is that a failed take must
   * not leave the surface showing the old tally as though it had worked — so
   * the state is re-read on the next push either way, and the operator gets
   * told rather than left guessing.
   */
  async command(fn) {
    try {
      await fn();
    } catch (e) {
      this.log("error", e.message);
      this.updateStatus(InstanceStatus.UnknownWarning, e.message);
      // Cleared by the next good state push.
    }
  }

  /**
   * The next region in the cycle for one output.
   *
   * Returns `null` for "nothing routed", which is a real position in the cycle
   * rather than a failure — an output with no crosspoint is a normal state in
   * Kestrel, and being able to step into it from a surface matters.
   */
  nextRoi(output, step, includeNone) {
    const o = this.state.outputs.find((x) => x.id === output);
    const ids = this.state.rois.map((r) => r.id);
    const ring = includeNone ? [null, ...ids] : ids;
    if (ring.length === 0) return null;
    const current = o?.assigned ?? null;
    const at = ring.findIndex((v) => v === current);
    if (at < 0) {
      // The current position is not in the ring: the output carries nothing and
      // "nothing" was excluded from the cycle, or the region it carried has
      // been deleted. Step in from *outside* the ring rather than pretending we
      // were at index 0 and stepping again — doing that skips the first region
      // entirely, so the first press of a Next button silently misses it.
      return step >= 0 ? ring[0] : ring[ring.length - 1];
    }
    const next = (at + step + ring.length) % ring.length;
    return ring[next];
  }
}

// `@companion-module/base` 2.x drops `runEntrypoint`: Companion imports the
// default export and the upgrade scripts itself. Calling it here is what an
// older module did, and it fails at import time with a bare SyntaxError that
// names the export rather than the version.
export { UpgradeScripts };
