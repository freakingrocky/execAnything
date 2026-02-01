import { DesktopRecordingEvent, TargetRung, UiaAncestryNode } from "../candidates/desktop";

function hasStableId(node: UiaAncestryNode): boolean {
  return Boolean(node.automationId || node.name || node.className);
}

function buildStablePath(ancestry: UiaAncestryNode[]): UiaAncestryNode[] {
  return ancestry.filter((node) => node.controlType && hasStableId(node));
}

export function disambiguateDesktopLadder(
  event: DesktopRecordingEvent,
  ladder: TargetRung[],
): TargetRung[] {
  const output: TargetRung[] = [...ladder];
  const ancestry = event.target?.ancestry ?? [];
  const stablePath = buildStablePath(ancestry);
  const hasPath = output.some((rung) => rung.kind === "uia_path");
  if (!hasPath && stablePath.length > 0) {
    output.push({
      kind: "uia_path",
      confidence: 0.6,
      selector: {
        path: stablePath.map((node) => ({
          controlType: node.controlType,
          name: node.name,
          automationId: node.automationId,
          className: node.className,
          index: node.index,
        })),
      },
      notes: "Scoped by stable container ancestry.",
    });
  }

  const label = event.target?.label;
  const controlType = event.target?.uia?.controlType;
  const hasLabelRung = output.some((rung) => rung.kind === "uia_near_label");
  if (label?.text && controlType && !hasLabelRung) {
    output.push({
      kind: "uia_near_label",
      confidence: 0.55,
      selector: {
        label: label.text,
        controlType,
        direction: label.direction ?? "any",
        maxDistancePx: label.distance_px ?? 200,
      },
      notes: "Label proximity fallback from recording.",
    });
  }

  return output;
}
