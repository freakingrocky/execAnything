import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import { StepTrace } from "../src/rpc/desktopClient";
import { WorkflowDefinition } from "../src/types/workflow";

class FakeDesktopClient {
  executedSteps: string[] = [];

  private createTrace(stepId: string): StepTrace {
    return {
      run_id: "run-1",
      step_id: stepId,
      started_at: "2024-01-01T00:00:00Z",
      ended_at: "2024-01-01T00:00:01Z",
      ok: true,
      match_attempts: [],
    };
  }

  async assertCheck(params: { step_id: string }): Promise<StepTrace> {
    this.executedSteps.push(`assert:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async click(params: { step_id: string }): Promise<StepTrace> {
    this.executedSteps.push(`click:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async pasteText(params: { step_id: string }): Promise<StepTrace> {
    this.executedSteps.push(`paste:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async setValue(params: { step_id: string }): Promise<StepTrace> {
    this.executedSteps.push(`set:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async extractGetValue(params: { step_id: string }): Promise<StepTrace> {
    this.executedSteps.push(`extract:${params.step_id}`);
    return {
      ...this.createTrace(params.step_id),
      value: "hello",
    };
  }
}

describe("RuntimeEngine", () => {
  it("runs a desktop workflow and writes step traces", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-run-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder("flow-1");
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-1",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "click",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
          pre_assert: [{ kind: "desktop_window_active" }],
          post_assert: [{ kind: "desktop_window_active" }],
        },
        {
          id: "step-2",
          driver: "desktop",
          action: "extract",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
        },
      ],
    };

    const client = new FakeDesktopClient();
    await engine.runWorkflow(workflow, {}, client as never);

    const tracePath = path.join(artifacts.logsDir, "step_traces.jsonl");
    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("resumes from the last successful step", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-resume-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder("flow-2");
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);

    await checkpointStore.recordRunStart(artifacts.runId, new Date().toISOString());
    await checkpointStore.recordStepEnd(artifacts.runId, "step-1", new Date().toISOString(), true);

    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
      resume: true,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-2",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "click",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
        },
        {
          id: "step-2",
          driver: "desktop",
          action: "click",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
        },
      ],
    };

    const client = new FakeDesktopClient();
    await engine.runWorkflow(workflow, {}, client as never);

    expect(client.executedSteps).toContain("click:step-2");
    expect(client.executedSteps).not.toContain("click:step-1");
  });
});
