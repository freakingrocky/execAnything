import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { synthesizeRecording } from "../src";

describe("synthesizeRecording", () => {
  it("emits selectors and assertions with deterministic rungs", async () => {
    const fixture = path.join(__dirname, "fixtures", "recording.jsonl");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "synth-"));
    const { selectorsPath, assertionsPath } = await synthesizeRecording(
      fixture,
      outDir,
    );

    const selectors = JSON.parse(fs.readFileSync(selectorsPath, "utf-8"));
    const assertions = JSON.parse(fs.readFileSync(assertionsPath, "utf-8"));

    expect(selectors.steps).toHaveLength(2);
    expect(selectors.steps[0].ladder.length).toBeGreaterThanOrEqual(2);
    expect(selectors.steps[0].ladder[0].kind).toBe("uia");
    expect(selectors.steps[0]).toHaveProperty("ambiguous");

    expect(assertions.steps).toHaveLength(2);
    expect(assertions.steps[0].pre_assert[0].kind).toBe(
      "desktop_window_active",
    );
    expect(assertions.steps[0].post_assert[0].kind).toBe(
      "desktop_element_exists",
    );
  });
});
