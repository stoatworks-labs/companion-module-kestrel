import { safeId } from "./main.js";

// Variable definitions are an OBJECT keyed by variable id in base 2.x, not the
// 1.x array of `{ variableId, name }`. The real implementation THROWS on an
// array, which fails init() and leaves a dead connection with no actions and no
// visible cause — and, because rebuild() defines variables before presets, it
// also takes the preset library down with it.
export default function UpdateVariableDefinitions(self) {
  const defs = {
    input_live: { name: "Input locked (yes/no)" },
    input_size: { name: "Input raster" },
    input_device: { name: "Input device" },
    output_format: { name: "Output format" },
    outputs_enabled: { name: "Outputs on (yes/no)" },
    roi_count: { name: "Number of regions" },
    output_count: { name: "Number of outputs" },
    decklink: { name: "DeckLink status" },
  };

  for (const o of self.state.outputs) {
    const id = safeId(o.id);
    defs[`out_${id}_label`] = { name: `Output ${o.label}: name` };
    defs[`out_${id}_roi`] = { name: `Output ${o.label}: region` };
    defs[`out_${id}_scale`] = { name: `Output ${o.label}: scale %` };
    defs[`out_${id}_on_air`] = { name: `Output ${o.label}: on air` };
    defs[`out_${id}_device`] = { name: `Output ${o.label}: card` };
  }
  for (const r of self.state.rois) {
    const id = safeId(r.id);
    defs[`roi_${id}_name`] = { name: `Region ${r.name}: name` };
    defs[`roi_${id}_outputs`] = {
      name: `Region ${r.name}: outputs carrying it`,
    };
  }

  self.setVariableDefinitions(defs);
}

export function refreshVariableValues(self) {
  const s = self.state;
  const values = {
    input_live: s.input?.live ? "yes" : "no",
    input_size: `${s.input?.width ?? 0}x${s.input?.height ?? 0}`,
    input_device: s.input?.device ?? "none",
    output_format: s.output_format?.name ?? "",
    outputs_enabled: s.outputs_enabled ? "yes" : "no",
    roi_count: s.rois.length,
    output_count: s.outputs.length,
    decklink: s.decklink ?? "",
  };

  for (const o of s.outputs) {
    const id = safeId(o.id);
    values[`out_${id}_label`] = o.label;
    values[`out_${id}_roi`] = o.assigned_name ?? "";
    // Rounded, with the sign a human reads. An empty string rather than "0%"
    // for an unrouted output, so a button showing it is blank instead of
    // claiming a scale it does not have.
    values[`out_${id}_scale`] =
      o.scale_percent == null ? "" : `${Math.round(o.scale_percent)}%`;
    values[`out_${id}_on_air`] = o.on_air ?? "";
    values[`out_${id}_device`] = o.device ?? "none";
  }
  for (const r of s.rois) {
    const id = safeId(r.id);
    values[`roi_${id}_name`] = r.name;
    values[`roi_${id}_outputs`] = r.outputs
      .map((oid) => s.outputs.find((o) => o.id === oid)?.label ?? oid)
      .join(", ");
  }

  self.setVariableValues(values);
}
