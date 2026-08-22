import { combineRgb } from "@companion-module/base";
import { safeId } from "./main.js";

/**
 * The preset library.
 *
 * Note `setPresetDefinitions` takes TWO arguments in base 2.x — a structure of
 * sections and groups, then a flat object of definitions keyed by id. Grouping
 * comes from that structure. A 1.x-style `category` field on a definition still
 * loads, and the presets simply never appear, which reads as a rendering bug
 * rather than a mistake. `type` is `'simple'` in 2.x, not `'button'`.
 */

const WHITE = combineRgb(255, 255, 255);
const BLACK = combineRgb(0, 0, 0);
const DARK = combineRgb(20, 20, 22);
const RED = combineRgb(224, 58, 58);
const GREEN = combineRgb(60, 160, 90);

export default function UpdatePresets(self) {
  const presets = {};
  const sections = [];

  // Variable references are resolved against the CONNECTION's label, which the
  // user can rename, not against the module id. Hardcoding `$(kestrel:...)`
  // renders as literal text on every install that is not named "kestrel" —
  // including the default, which Companion derives from the product name.
  const v = (id) => `$(${self.label}:${id})`;

  // --- the kill, first, because it is the one button that matters ---------
  presets.outputs_kill = {
    type: "simple",
    name: "Outputs on / off",
    style: {
      text: `OUTPUTS\n${v("outputs_enabled")}`,
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
    type: "simple",
    name: "Input lock tally",
    style: {
      text: `INPUT\n${v("input_size")}`,
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

  sections.push({
    id: "global",
    name: "Global",
    description:
      "The whole-device controls. The kill cuts every output at once — it is the only button here that reaches air.",
    definitions: ["outputs_kill", "input_tally"],
  });

  // --- one crosspoint button per region x output --------------------------
  //
  // Capped, because a machine with eight outputs and a dozen regions produces
  // ninety-six presets and an unusable list. The cap is a config field so a
  // big rig can raise it deliberately.
  const limit = Number(self.config?.presetlimit ?? 200);
  let made = 0;
  const groups = [];

  for (const o of self.state.outputs) {
    const oid = safeId(o.id);
    const members = [];

    for (const r of self.state.rois) {
      if (made >= limit) break;
      made += 1;
      const id = `xpt_${oid}_${safeId(r.id)}`;
      presets[id] = {
        type: "simple",
        name: `${r.name} → ${o.label}`,
        style: {
          text: `${r.name}\n${v(`out_${oid}_scale`)}`,
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
      members.push(id);
    }

    // --- per-output utilities --------------------------------------------
    presets[`clear_${oid}`] = {
      type: "simple",
      name: `Clear ${o.label}`,
      style: {
        text: `CLEAR\n${o.label}`,
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
    members.push(`clear_${oid}`);

    presets[`cycle_${oid}`] = {
      type: "simple",
      name: `Cycle region on ${o.label}`,
      style: {
        text: `${o.label}\n${v(`out_${oid}_roi`)}`,
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
    members.push(`cycle_${oid}`);

    groups.push({
      id: `output_${oid}`,
      type: "simple",
      name: `Take to ${o.label}`,
      presets: members,
    });
  }

  if (groups.length) {
    sections.push({
      id: "outputs",
      name: "Outputs",
      description:
        "One crosspoint per region per output, grouped by output, with a clear and a region cycle for each. Routing a region to an output does not take it to air on its own.",
      definitions: groups,
    });
  }

  self.setPresetDefinitions(sections, presets);
}
