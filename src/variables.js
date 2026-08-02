import { safeId } from "./main.js";

export default function UpdateVariableDefinitions(self) {
  const defs = [
    { variableId: "input_live", name: "Input locked (yes/no)" },
    { variableId: "input_size", name: "Input raster" },
    { variableId: "input_device", name: "Input device" },
    { variableId: "output_format", name: "Output format" },
    { variableId: "outputs_enabled", name: "Outputs on (yes/no)" },
    { variableId: "roi_count", name: "Number of regions" },
    { variableId: "output_count", name: "Number of outputs" },
    { variableId: "decklink", name: "DeckLink status" },
  ];

  for (const o of self.state.outputs) {
    const id = safeId(o.id);
    defs.push(
      { variableId: `out_${id}_label`, name: `Output ${o.label}: name` },
      { variableId: `out_${id}_roi`, name: `Output ${o.label}: region` },
      { variableId: `out_${id}_scale`, name: `Output ${o.label}: scale %` },
      { variableId: `out_${id}_on_air`, name: `Output ${o.label}: on air` },
      { variableId: `out_${id}_device`, name: `Output ${o.label}: card` },
    );
  }
  for (const r of self.state.rois) {
    const id = safeId(r.id);
    defs.push(
      { variableId: `roi_${id}_name`, name: `Region ${r.name}: name` },
      {
        variableId: `roi_${id}_outputs`,
        name: `Region ${r.name}: outputs carrying it`,
      },
    );
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
