import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { findWorkflowFiles, loadWorkflows } from "../src/workflows";

function setupFixture(structure: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-server-"));
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
  return root;
}

describe("workflow discovery", () => {
  it("finds workflow.json files recursively", async () => {
    const root = setupFixture({
      "workflows/a/workflow.json": JSON.stringify({ id: "a", steps: [] }),
      "workflows/b/workflow.json": JSON.stringify({ id: "b", steps: [] }),
      "workflows/b/inputs.json": JSON.stringify({}),
    });

    const files = await findWorkflowFiles(path.join(root, "workflows"));
    expect(files).toHaveLength(2);
    expect(files.some((entry) => entry.endsWith(path.join("a", "workflow.json")))).toBe(true);
    expect(files.some((entry) => entry.endsWith(path.join("b", "workflow.json")))).toBe(true);
  });

  it("throws on invalid workflow JSON", async () => {
    const root = setupFixture({
      "workflows/bad/workflow.json": "{not-json}",
    });

    await expect(loadWorkflows(path.join(root, "workflows"), root)).rejects.toThrow(
      "Failed to parse workflow",
    );
  });
});
