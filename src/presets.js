import { combineRgb } from "@companion-module/base";
import { safeId } from "./main.js";

const WHITE = combineRgb(255, 255, 255);
const BLACK = combineRgb(0, 0, 0);
const DARK = combineRgb(20, 20, 22);
const RED = combineRgb(224, 58, 58);
const GREEN = combineRgb(60, 160, 90);

export default function UpdatePresets(self) {
  const presets = {};

  // --- the kill, first, because it is the one button that matters ---------
  presets.outputs_kill = {
    type: "button",
    category: "Global",
    name: "Outputs on / off",
    style: {
      text: "OUTPUTS\\n$(kestrel:outputs_enabled)",
      size: "14",
      color: WHITE,
      bgcolor: RED,
    },
    steps: [
      {
        down: [{ actionId: "outputs_enable", options: { mode: "toggle" } }],
        up: [],
      },
    ],
    feedbacks: [
      {
        feedbackId: "outputs_enabled",
        options: {},
        style: { bgcolor: GREEN, color: WHITE },
      },
    ],
  };

  presets.input_tally = {
    type: "button",
    category: "Global",
    name: "Input lock tally",
    style: {
      text: "INPUT\\n$(kestrel:input_size)",
      size: "14",
      color: WHITE,
      bgcolor: RED,
    },
    steps: [{ down: [], up: [] }],
    feedbacks: [
      {
        feedbackId: "input_live",
        options: {},
        // Inverted deliberately: the default style is the *alarm*, and the
        // feedback turns it calm when the input is locked.
        style: { bgcolor: DARK, color: WHITE },
      },
    ],
  };

  // --- one crosspoint button per region x output --------------------------
  //
  // Capped, because a machine with eight outputs and a dozen regions produces
  // ninety-six presets and an unusable list. The cap is a config field so a
  // big rig can raise it deliberately.
  const limit = Number(self.config?.presetlimit ?? 200);
  let made = 0;
  for (const o of self.state.outputs) {
    for (const r of self.state.rois) {
      if (made >= limit) break;
      made += 1;
      presets[`xpt_${safeId(o.id)}_${safeId(r.id)}`] = {
        type: "button",
        category: `Take to ${o.label}`,
        name: `${r.name} → ${o.label}`,
        style: {
          text: `${r.name}\\n$(kestrel:out_${safeId(o.id)}_scale)`,
          size: "14",
          color: WHITE,
          bgcolor: DARK,
        },
        steps: [
          {
            down: [{ actionId: "route", options: { output: o.id, roi: r.id } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: "crosspoint",
            options: { output: o.id, roi: r.id, use_roi_colour: true },
            style: { bgcolor: RED, color: BLACK },
          },
          {
            feedbackId: "scale_over",
            options: { output: o.id, threshold: 200 },
            style: { color: combineRgb(240, 176, 64) },
          },
        ],
      };
    }
  }

  // --- per-output utilities ----------------------------------------------
  for (const o of self.state.outputs) {
    presets[`clear_${safeId(o.id)}`] = {
      type: "button",
      category: `Take to ${o.label}`,
      name: `Clear ${o.label}`,
      style: {
        text: `CLEAR\\n${o.label}`,
        size: "14",
        color: WHITE,
        bgcolor: DARK,
      },
      steps: [
        {
          down: [{ actionId: "clear_output", options: { output: o.id } }],
          up: [],
        },
      ],
      feedbacks: [],
    };
    presets[`cycle_${safeId(o.id)}`] = {
      type: "button",
      category: `Take to ${o.label}`,
      name: `Cycle region on ${o.label}`,
      style: {
        text: `${o.label}\\n$(kestrel:out_${safeId(o.id)}_roi)`,
        size: "14",
        color: WHITE,
        bgcolor: DARK,
      },
      steps: [
        {
          down: [
            {
              actionId: "cycle_roi",
              options: { output: o.id, direction: "next", include_none: true },
            },
          ],
          up: [],
        },
      ],
      feedbacks: [
        {
          feedbackId: "output_on_air",
          options: { output: o.id },
          style: { bgcolor: RED },
        },
      ],
    };
  }

  self.setPresetDefinitions(presets);
}
