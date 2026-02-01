import fs from "fs/promises";
import path from "path";
import {
  DesktopRecordingEvent,
  DesktopSelectorResult,
  buildDesktopSelectors,
  buildDesktopAssertions,
} from "./candidates/desktop";

export interface SynthesizerOutput {
  selectorsPath: string;
  assertionsPath: string;
}

export async function synthesizeRecording(
  recordingPath: string,
  outputDir: string,
): Promise<SynthesizerOutput> {
  const raw = await fs.readFile(recordingPath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const events = lines.map((line) => JSON.parse(line) as DesktopRecordingEvent);

  const selectorSteps: DesktopSelectorResult[] = events.map((event, index) =>
    buildDesktopSelectors(event, index),
  );
  const assertionSteps = events.map((event, index) =>
    buildDesktopAssertions(event, index),
  );

  const selectorsPayload = {
    version: "v0",
    recording: path.basename(recordingPath),
    steps: selectorSteps,
  };
  const assertionsPayload = {
    version: "v0",
    recording: path.basename(recordingPath),
    steps: assertionSteps,
  };

  await fs.mkdir(outputDir, { recursive: true });
  const selectorsPath = path.join(outputDir, "selectors.json");
  const assertionsPath = path.join(outputDir, "assertions.json");
  await fs.writeFile(selectorsPath, JSON.stringify(selectorsPayload, null, 2), "utf-8");
  await fs.writeFile(assertionsPath, JSON.stringify(assertionsPayload, null, 2), "utf-8");

  return { selectorsPath, assertionsPath };
}
