import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import { WebClient } from "../src/rpc/webClient";
import { WorkflowDefinition } from "../src/types/workflow";

describe("sample workflow smoke", () => {
  it("runs workflows/samples/web_basic in CI", async () => {
    const workflowPath = path.join(
      __dirname,
      "..",
      "..",
      "workflows",
      "samples",
      "web_basic",
      "workflow.json",
    );
    const inputsPath = path.join(
      __dirname,
      "..",
      "..",
      "workflows",
      "samples",
      "web_basic",
      "inputs.json",
    );
    const workflow = JSON.parse(
      fs.readFileSync(workflowPath, "utf-8"),
    ) as WorkflowDefinition;
    const inputs = JSON.parse(fs.readFileSync(inputsPath, "utf-8")) as Record<
      string,
      unknown
    >;

    const appUrl = pathToFileURL(
      path.join(__dirname, "..", "..", "web-runner", "test-app", "index.html"),
    ).toString();
    workflow.steps = workflow.steps.map((step) =>
      step.id === "navigate"
        ? { ...step, params: { ...(step.params ?? {}), url: appUrl } }
        : step,
    );

    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sample-"));
    const artifacts = await new ArtifactManager(artifactsDir).createRunFolder(
      workflow.id,
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });
    const webClient = new WebClient({
      headless: true,
      artifactDir: artifacts.evidenceDir,
    });
    await webClient.start();
    await webClient.ping();

    try {
      await engine.runWorkflow(workflow, inputs, { web: webClient });
    } finally {
      await webClient.stop();
    }

    const tracePath = path.join(artifacts.logsDir, "step_traces.jsonl");
    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
  });
});
