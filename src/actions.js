import * as api from "./api.js";

/** Dropdown choices, rebuilt whenever Kestrel's membership changes. */
function roiChoices(self, { includeClear = false } = {}) {
  const list = self.state.rois.map((r) => ({ id: r.id, label: r.name }));
  return includeClear ? [{ id: -1, label: "— clear —" }, ...list] : list;
}

function outputChoices(self) {
  return self.state.outputs.map((o) => ({
    id: o.id,
    // The port matters as much as the label when there are eight of them.
    label: o.device ? `${o.label} (${o.device})` : `${o.label} (no card)`,
  }));
}

export default function UpdateActions(self) {
  const rois = roiChoices(self);
  const outputs = outputChoices(self);
  const firstRoi = rois[0]?.id ?? 1;
  const firstOutput = outputs[0]?.id ?? 1;

  self.setActionDefinitions({
    route: {
      name: "Take region to output",
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
        {
          type: "dropdown",
          id: "roi",
          label: "Region",
          default: firstRoi,
          choices: roiChoices(self, { includeClear: true }),
        },
      ],
      callback: async (event) => {
        const roi = Number(event.options.roi);
        await self.command(() =>
          api.route(self, Number(event.options.output), roi < 0 ? null : roi),
        );
      },
    },

    clear_output: {
      name: "Clear an output",
      description:
        "Drops the crosspoint. The output keeps running and shows its idle fill — it does not stop.",
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
      ],
      callback: async (event) => {
        await self.command(() =>
          api.route(self, Number(event.options.output), null),
        );
      },
    },

    cycle_roi: {
      name: "Cycle the region on an output",
      description:
        "Steps through the regions on one output. Useful on a surface with fewer buttons than regions.",
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
        {
          type: "dropdown",
          id: "direction",
          label: "Direction",
          default: "next",
          choices: [
            { id: "next", label: "Next" },
            { id: "prev", label: "Previous" },
          ],
        },
        {
          type: "checkbox",
          id: "include_none",
          label: "Include 'nothing routed' in the cycle",
          default: true,
        },
      ],
      callback: async (event) => {
        const output = Number(event.options.output);
        const next = self.nextRoi(
          output,
          event.options.direction === "prev" ? -1 : 1,
          !!event.options.include_none,
        );
        await self.command(() => api.route(self, output, next));
      },
    },

    salvo: {
      name: "Salvo — take one region to every output",
      description:
        "Every output takes the same region at once. The usual 'everything to the wide shot' panic button.",
      options: [
        {
          type: "dropdown",
          id: "roi",
          label: "Region",
          default: firstRoi,
          choices: roiChoices(self, { includeClear: true }),
        },
      ],
      callback: async (event) => {
        const roi = Number(event.options.roi);
        // Sequential rather than Promise.all: a refusal part-way through should
        // stop the salvo and be reported, not race three other takes.
        await self.command(async () => {
          for (const o of self.state.outputs) {
            await api.route(self, o.id, roi < 0 ? null : roi);
          }
        });
      },
    },

    outputs_enable: {
      name: "Outputs on / off",
      description:
        "The global kill. Blacks every output at once. The signals keep running, so nothing downstream has to re-lock when you bring them back.",
      options: [
        {
          type: "dropdown",
          id: "mode",
          label: "Action",
          default: "toggle",
          choices: [
            { id: "toggle", label: "Toggle" },
            { id: "on", label: "On" },
            { id: "off", label: "Off" },
          ],
        },
      ],
      callback: async (event) => {
        const mode = event.options.mode;
        await self.command(() =>
          mode === "toggle"
            ? api.toggleOutputs(self)
            : api.setOutputsEnabled(self, mode === "on"),
        );
      },
    },

    set_idle: {
      name: "Set an output's idle fill",
      description: "What that output carries when nothing is routed to it.",
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
        {
          type: "dropdown",
          id: "idle",
          label: "Idle fill",
          default: "black",
          choices: [
            { id: "black", label: "Black" },
            { id: "fullinput", label: "Full input" },
            { id: "bars", label: "Bars" },
          ],
        },
      ],
      callback: async (event) => {
        await self.command(() =>
          api.setIdle(self, Number(event.options.output), event.options.idle),
        );
      },
    },

    nudge_roi: {
      name: "Nudge a region",
      description:
        "Move a region by a percentage of the frame. Kestrel clamps it at the edge rather than refusing, so holding a nudge button is safe.",
      options: [
        {
          type: "dropdown",
          id: "roi",
          label: "Region",
          default: firstRoi,
          choices: rois,
        },
        {
          type: "dropdown",
          id: "direction",
          label: "Direction",
          default: "left",
          choices: [
            { id: "left", label: "Left" },
            { id: "right", label: "Right" },
            { id: "up", label: "Up" },
            { id: "down", label: "Down" },
          ],
        },
        {
          type: "number",
          id: "step",
          label: "Step (% of frame)",
          default: 1,
          min: 0.1,
          max: 25,
        },
      ],
      callback: async (event) => {
        const roi = self.state.rois.find(
          (r) => r.id === Number(event.options.roi),
        );
        if (!roi) throw new Error("that region no longer exists");
        const step = Number(event.options.step) / 100;
        const [x, y, w, h] = roi.rect;
        const moved = {
          left: [x - step, y],
          right: [x + step, y],
          up: [x, y - step],
          down: [x, y + step],
        }[event.options.direction];
        await self.command(() =>
          api.nudgeRoi(self, roi.id, [moved[0], moved[1], w, h]),
        );
      },
    },
  });
}
