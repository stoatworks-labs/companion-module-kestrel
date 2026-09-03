import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// Two channels, carrying different things:
//
//   /ws          the whole state, pushed. Kestrel re-snapshots at 5 Hz and
//                sends only when its revision moved, so this covers routing
//                AND membership — a region created by dragging in the app's
//                own window shows up here with no polling.
//   HTTP         commands.
//
// Kestrel answers a refused command with **HTTP 200 and `ok: false`**, not a
// 4xx, so checking the status code alone would report every refusal as a
// success. Unlike some of its siblings it always populates `error`, so this
// module never has to invent the message.

const RECONNECT_MS = 3000;

function baseUrl(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

async function post(self, path, body) {
  const res = await fetch(`${baseUrl(self)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok || reply.ok === false) {
    throw new Error(reply.error || `${path} refused (HTTP ${res.status})`);
  }
  return reply;
}

/** Take a region to an output, or pass null to clear the crosspoint. */
export async function route(self, output, roi) {
  return post(self, "/api/route", { output, roi: roi ?? null });
}

/** The global output kill. Blacks every output; the signals keep running. */
export async function setOutputsEnabled(self, enabled) {
  return post(self, "/api/output/enable", { enabled });
}

export async function toggleOutputs(self) {
  return post(self, "/api/output/enable", { toggle: true });
}

export async function setIdle(self, output, idle) {
  return post(self, `/api/output/${output}`, { idle });
}

export async function nudgeRoi(self, roiId, rect) {
  return post(self, `/api/roi/${roiId}`, { rect });
}

export const socket = {
  ws: null,
  timer: null,

  connect(self) {
    this.close();
    const url = `ws://${self.config.host}:${self.config.port}/ws`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
      this.retry(self);
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("debug", `connected to ${url}`);
      self.updateStatus(InstanceStatus.Ok);
    });

    ws.on("message", (data) => {
      try {
        self.applyState(JSON.parse(data.toString()));
      } catch (e) {
        self.log("warn", `unreadable state: ${e.message}`);
      }
    });

    ws.on("error", (e) => {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
    });

    ws.on("close", () => {
      // Kestrel is a show-critical process that gets restarted between
      // rehearsals; reconnecting quietly forever is the right behaviour, and
      // the status field is where an operator looks to see it has not.
      self.updateStatus(InstanceStatus.Disconnected);
      this.retry(self);
    });
  },

  retry(self) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect(self);
    }, RECONNECT_MS);
  },

  close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.removeAllListeners();
      // close() on a socket still in CONNECTING calls abortHandshake(), which
      // defers the failure: `process.nextTick(emitErrorAndClose, ...)`. That
      // 'error' therefore lands after this function has returned and after the
      // catch below has gone out of scope, on a socket whose listeners we just
      // removed — and Node throws on an unlistened 'error', killing the module
      // process. A no-op listener that outlives close() is what absorbs it.
      ws.on("error", () => {});
      try {
        ws.close();
      } catch {
        // Already gone; nothing to do.
      }
    }
  },
};
