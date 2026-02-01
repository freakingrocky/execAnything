import { disambiguateDesktopLadder } from "../disambiguate/desktop";
import { minimizeDesktopSelector } from "../minimize/greedy";

export interface UiaSnapshot {
  name?: string;
  automationId?: string;
  className?: string;
  controlType?: string;
}

export interface UiaAncestryNode {
  controlType?: string;
  name?: string;
  automationId?: string;
  className?: string;
  index?: number;
}

export interface DesktopRecordingEvent {
  type: string;
  timestamp: string;
  window?: {
    title?: string;
    class?: string;
    process_name?: string;
  };
  target?: {
    uia?: UiaSnapshot;
    ancestry?: UiaAncestryNode[];
    label?: {
      text?: string;
      direction?: string;
      distance_px?: number;
    };
  };
}

export interface TargetRung {
  kind: "uia" | "uia_path" | "uia_near_label";
  confidence: number;
  selector: Record<string, unknown>;
  notes?: string;
}

export interface DesktopSelectorResult {
  event_index: number;
  event_type: string;
  ladder: TargetRung[];
  ambiguous: boolean;
}

export interface DesktopAssertionsResult {
  event_index: number;
  event_type: string;
  pre_assert: Array<Record<string, unknown>>;
  post_assert: Array<Record<string, unknown>>;
}

function addRung(
  ladder: TargetRung[],
  kind: TargetRung["kind"],
  confidence: number,
  selector: Record<string, unknown>,
  notes?: string,
): void {
  ladder.push({ kind, confidence, selector, notes });
}

function hasValue(value?: string): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function buildDesktopSelectors(
  event: DesktopRecordingEvent,
  index: number,
): DesktopSelectorResult {
  const ladder: TargetRung[] = [];
  const uia = event.target?.uia ?? {};
  if (uia.automationId && uia.controlType) {
    addRung(ladder, "uia", 0.92, {
      automationId: uia.automationId,
      controlType: uia.controlType,
    });
  }
  if (uia.name && uia.controlType) {
    addRung(ladder, "uia", 0.86, {
      name: uia.name,
      controlType: uia.controlType,
    });
  }
  if (uia.automationId) {
    addRung(ladder, "uia", 0.8, { automationId: uia.automationId });
  }
  if (uia.name) {
    addRung(ladder, "uia", 0.75, { name: uia.name });
  }

  const disambiguated = disambiguateDesktopLadder(event, ladder);
  const minimized = disambiguated.map((rung) => {
    if (rung.kind !== "uia") {
      return rung;
    }
    return {
      ...rung,
      selector: minimizeDesktopSelector(rung.selector),
    };
  });

  const ambiguous =
    minimized.length === 0 ||
    minimized.every((rung) => {
      if (rung.kind !== "uia") {
        return true;
      }
      const selector = rung.selector as Record<string, unknown>;
      const hasAutomationId = hasValue(selector.automationId as string | undefined);
      const hasName = hasValue(selector.name as string | undefined);
      const hasControlType = hasValue(selector.controlType as string | undefined);
      return !(hasAutomationId || (hasName && hasControlType));
    });

  return {
    event_index: index,
    event_type: event.type,
    ladder: minimized,
    ambiguous,
  };
}

export function buildDesktopAssertions(
  event: DesktopRecordingEvent,
  index: number,
): DesktopAssertionsResult {
  const windowScope = event.window
    ? {
        scope: {
          window_title_contains: event.window.title,
          window_class: event.window.class,
          process_name: event.window.process_name,
        },
      }
    : undefined;

  const pre_assert = [
    {
      kind: "desktop_window_active",
      target: windowScope,
    },
  ];

  const post_assert = event.target
    ? [
        {
          kind: "desktop_element_exists",
          target: {
            ladder: buildDesktopSelectors(event, index).ladder,
          },
        },
      ]
    : [];

  return {
    event_index: index,
    event_type: event.type,
    pre_assert,
    post_assert,
  };
}
