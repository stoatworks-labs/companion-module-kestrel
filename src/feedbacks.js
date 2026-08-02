import { combineRgb } from "@companion-module/base";

const WHITE = combineRgb(255, 255, 255);
const BLACK = combineRgb(0, 0, 0);
const RED = combineRgb(224, 58, 58);
const AMBER = combineRgb(240, 176, 64);
const GREEN = combineRgb(60, 160, 90);

export default function UpdateFeedbacks(self) {
  const outputs = self.state.outputs.map((o) => ({ id: o.id, label: o.label }));
  const rois = self.state.rois.map((r) => ({ id: r.id, label: r.name }));
  const firstOutput = outputs[0]?.id ?? 1;
  const firstRoi = rois[0]?.id ?? 1;

  self.setFeedbackDefinitions({
    crosspoint: {
      name: "Crosspoint is taken",
      description:
        "This region is routed to this output. Defaults to the region's own colour from Kestrel, so a wall of buttons matches the overlays in the app.",
      type: "boolean",
      defaultStyle: { bgcolor: RED, color: WHITE },
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
          choices: rois,
        },
        {
          type: "checkbox",
          id: "use_roi_colour",
          label: "Use the region's colour",
          default: true,
        },
      ],
      callback: (feedback) => {
        const o = self.state.outputs.find(
          (x) => x.id === Number(feedback.options.output),
        );
        return !!o && o.assigned === Number(feedback.options.roi);
      },
      // A taken crosspoint that is muted must not look the same as one that is
      // on air, or the global kill becomes invisible from the surface.
      style: (feedback) => {
        const roi = self.state.rois.find(
          (r) => r.id === Number(feedback.options.roi),
        );
        if (!feedback.options.use_roi_colour || !roi) return {};
        const bg = combineRgb(roi.colour[0], roi.colour[1], roi.colour[2]);
        return self.state.outputs_enabled
          ? { bgcolor: bg, color: BLACK }
          : { bgcolor: dim(roi.colour), color: combineRgb(120, 120, 120) };
      },
    },

    output_on_air: {
      name: "Output is carrying a region",
      description:
        "True only when the output really is on air with a region — false when it is muted, has no input, or is showing an idle fill.",
      type: "boolean",
      defaultStyle: { bgcolor: RED, color: WHITE },
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
      ],
      callback: (feedback) => {
        const o = self.state.outputs.find(
          (x) => x.id === Number(feedback.options.output),
        );
        return !!o && (o.on_air === "region" || o.on_air === "full input");
      },
    },

    outputs_enabled: {
      name: "Outputs are on",
      description: "The global kill. Put this on the kill button itself.",
      type: "boolean",
      defaultStyle: { bgcolor: GREEN, color: WHITE },
      options: [],
      callback: () => self.state.outputs_enabled,
    },

    input_live: {
      name: "Input is locked",
      description:
        "False when nothing is arriving. Every routed output is carrying black at that point, so this is worth a button of its own.",
      type: "boolean",
      defaultStyle: { bgcolor: RED, color: WHITE },
      options: [],
      callback: () => !!self.state.input?.live,
    },

    scale_over: {
      name: "Output is scaling too far",
      description:
        "The region on this output is being blown up past a threshold. Past 200% a 1080p source is visibly upscaled on a big screen, and the fix is a tighter camera rather than a better scaler.",
      type: "boolean",
      defaultStyle: { bgcolor: AMBER, color: BLACK },
      options: [
        {
          type: "dropdown",
          id: "output",
          label: "Output",
          default: firstOutput,
          choices: outputs,
        },
        {
          type: "number",
          id: "threshold",
          label: "Warn above (%)",
          default: 200,
          min: 100,
          max: 2000,
        },
      ],
      callback: (feedback) => {
        const o = self.state.outputs.find(
          (x) => x.id === Number(feedback.options.output),
        );
        // An output carrying nothing has no scale, and must not read as a
        // warning — `null > 200` is false in JS, but only by luck, so it is
        // checked explicitly.
        if (!o || o.scale_percent == null) return false;
        return o.scale_percent > Number(feedback.options.threshold);
      },
    },
  });
}

/** The region's colour at a third, for a crosspoint that is taken but muted. */
function dim([r, g, b]) {
  return combineRgb(Math.round(r / 3), Math.round(g / 3), Math.round(b / 3));
}
