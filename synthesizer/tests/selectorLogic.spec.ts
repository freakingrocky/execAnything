import { describe, expect, it } from "vitest";
import { disambiguateDesktopLadder } from "../src/disambiguate/desktop";
import { disambiguateWebCandidates } from "../src/disambiguate/web";
import { minimizeDesktopSelector } from "../src/minimize/greedy";
import { DesktopRecordingEvent, TargetRung } from "../src/candidates/desktop";

describe("desktop disambiguation", () => {
  it("adds container and label fallbacks when available", () => {
    const event: DesktopRecordingEvent = {
      type: "click",
      timestamp: "2026-02-01T03:21:05Z",
      target: {
        uia: { name: "Save", controlType: "Button" },
        ancestry: [
          { controlType: "Button", name: "Save", automationId: "saveButton" },
          { controlType: "ToolBar", name: "Main", automationId: "mainToolbar" },
        ],
        label: { text: "Save", direction: "left" },
      },
    };
    const ladder: TargetRung[] = [
      {
        kind: "uia",
        confidence: 0.86,
        selector: { name: "Save", controlType: "Button" },
      },
    ];

    const result = disambiguateDesktopLadder(event, ladder);
    expect(result.some((rung) => rung.kind === "uia_path")).toBe(true);
    expect(result.some((rung) => rung.kind === "uia_near_label")).toBe(true);
  });
});

describe("web disambiguation", () => {
  it("adds within-css scoped fallback for ambiguous matches", () => {
    const candidates = [
      {
        kind: "web_css" as const,
        confidence: 0.5,
        selector: { css: "button" },
        matched_count: 3,
      },
    ];

    const result = disambiguateWebCandidates(candidates, {
      within_css: "#panel",
    });

    expect(result).toHaveLength(2);
    expect(result[1].selector).toEqual({ css: "#panel button" });
  });
});

describe("desktop minimization", () => {
  it("removes redundant predicates while preserving validity", () => {
    const selector = {
      automationId: "saveButton",
      controlType: "Button",
      className: "Button",
    };

    const minimized = minimizeDesktopSelector(selector);
    expect(minimized).toEqual({ automationId: "saveButton" });
  });

  it("keeps selectors that cannot be minimized", () => {
    const selector = { name: "Save", controlType: "Button" };
    const minimized = minimizeDesktopSelector(selector);
    expect(minimized).toEqual(selector);
  });
});
