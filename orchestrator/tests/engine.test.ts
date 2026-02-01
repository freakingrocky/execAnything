import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import { StepTrace } from "../src/rpc/desktopClient";
import { DesktopRpcMethods } from "../src/rpc/contracts";
import { WorkflowDefinition } from "../src/types/workflow";

class FakeDesktopClient {
  executedSteps: string[] = [];
  calls: Array<{ method: string; params: any }> = [];

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
    this.calls.push({ method: DesktopRpcMethods.assertCheck, params });
    this.executedSteps.push(`assert:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async click(params: { step_id: string }): Promise<StepTrace> {
    this.calls.push({ method: DesktopRpcMethods.actionClick, params });
    this.executedSteps.push(`click:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async pasteText(params: { step_id: string }): Promise<StepTrace> {
    this.calls.push({ method: DesktopRpcMethods.actionPasteText, params });
    this.executedSteps.push(`paste:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async setValue(params: { step_id: string }): Promise<StepTrace> {
    this.calls.push({ method: DesktopRpcMethods.actionSetValue, params });
    this.executedSteps.push(`set:${params.step_id}`);
    return this.createTrace(params.step_id);
  }

  async focusWindow(params: { step_id: string }): Promise<{ trace: StepTrace; window: Record<string, unknown> }> {
    this.calls.push({ method: DesktopRpcMethods.windowFocus, params });
    this.executedSteps.push(`focus:${params.step_id}`);
    return { trace: this.createTrace(params.step_id), window: { title: "Notepad" } };
  }

  async extractGetValue(params: { step_id: string }): Promise<StepTrace> {
    this.calls.push({ method: DesktopRpcMethods.extractGetValue, params });
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
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-1",
    );
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
          id: "step-0",
          driver: "desktop",
          action: "focus_window",
          target: {
            ladder: [{ kind: "uia", confidence: 1, selector: {} }],
            scope: { window_title_contains: "Notepad" },
          },
          pre_assert: [{ kind: "desktop_window_active" }],
          post_assert: [{ kind: "desktop_window_active" }],
        },
        {
          id: "step-1",
          driver: "desktop",
          action: "click",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
          pre_assert: [
            {
              kind: "desktop_window_active",
              target: {
                ladder: [{ kind: "uia", confidence: 0.8, selector: {} }],
              },
            },
          ],
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
    await engine.runWorkflow(workflow, {}, { desktop: client as never });
    // Engine must run pre_assert for step-1 (assert.check)
    expect(
      client.calls.some(
        (c) =>
          c.method === DesktopRpcMethods.assertCheck &&
          c.params.step_id === "step-1",
      ),
    ).toBe(true);
    const preAssert = client.calls.find(
      (c) =>
        c.method === DesktopRpcMethods.assertCheck &&
        c.params.step_id === "step-1",
    );
    expect(preAssert?.params.assertions?.[0]?.kind).toBe(
      "desktop_window_active",
    );
    expect(preAssert?.params.assertions?.[0]?.target?.ladder?.[0]?.kind).toBe(
      "uia",
    );

    // Engine must call click for step-1 with a target ladder
    const click1 = client.calls.find(
      (c) =>
        c.method === DesktopRpcMethods.actionClick &&
        c.params.step_id === "step-1",
    );
    expect(click1).toBeTruthy();
    expect(click1!.params.target?.ladder?.[0]?.kind).toBe("uia");

    // Engine must call extract for step-2 with a target ladder
    const extract2 = client.calls.find(
      (c) =>
        c.method === DesktopRpcMethods.extractGetValue &&
        c.params.step_id === "step-2",
    );
    expect(extract2).toBeTruthy();
    expect(extract2!.params.target?.ladder?.[0]?.kind).toBe("uia");

    expect(client.executedSteps).toContain("assert:step-1");

    const tracePath = path.join(artifacts.logsDir, "step_traces.jsonl");
    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");

    // For step-0: pre_assert + focus + post_assert = 3 traces
    // For step-1: pre_assert + click + post_assert = 3 traces
    // For step-2: extract = 1 trace
    expect(lines).toHaveLength(7);

    const traces = lines.map((l: string) => JSON.parse(l));
    for (const t of traces) {
      expect(t.run_id).toBeTruthy();
      expect(t.step_id).toBeTruthy();
      expect(typeof t.ok).toBe("boolean");
      expect(t.started_at).toBeTruthy();
      expect(t.ended_at).toBeTruthy();
    }
    expect(traces.filter((t: { step_id: string }) => t.step_id === "step-0")).toHaveLength(3);
    expect(traces.filter((t: { step_id: string }) => t.step_id === "step-1")).toHaveLength(3);
    expect(traces.filter((t: { step_id: string }) => t.step_id === "step-2")).toHaveLength(1);

    const checkpointPath = path.join(artifacts.runDir, "checkpoints.json");
    const ck = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    expect(ck.last_success_step_id).toBe("step-2");
  });

  it("resumes from the last successful step", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-resume-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-2",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);

    await checkpointStore.recordRunStart(
      artifacts.runId,
      new Date().toISOString(),
    );
    await checkpointStore.recordStepEnd(
      artifacts.runId,
      "step-1",
      new Date().toISOString(),
      true,
    );

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
    await engine.runWorkflow(workflow, {}, { desktop: client as never });

    expect(client.executedSteps).toContain("click:step-2");
    expect(client.executedSteps).not.toContain("click:step-1");
  });

  it("throws on missing input variables", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-input-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-3",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-3",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "fill",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
          input: { var: "missing" },
        },
      ],
    };

    const client = new FakeDesktopClient();
    await expect(
      engine.runWorkflow(workflow, {}, { desktop: client as never }),
    ).rejects.toThrow("Missing input variable");
  });

  it("throws when required targets are missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-target-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-4",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-4",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "click",
        },
      ],
    };

    const client = new FakeDesktopClient();
    await expect(
      engine.runWorkflow(workflow, {}, { desktop: client as never }),
    ).rejects.toThrow("Missing target");
  });

  it("throws on unsupported driver", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-driver-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-5",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-5",
      steps: [
        {
          id: "step-1",
          driver: "mobile" as "desktop",
          action: "click",
        },
      ],
    };

    const client = new FakeDesktopClient();
    await expect(
      engine.runWorkflow(workflow, {}, { desktop: client as never }),
    ).rejects.toThrow("Unsupported driver");
  });

  it("throws when focus window returns no trace", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-focus-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-6",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-6",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "focus_window",
          target: {
            ladder: [{ kind: "uia", confidence: 1, selector: {} }],
            scope: { window_title_contains: "Notepad" },
          },
        },
      ],
    };

    const client = new FakeDesktopClient();
    client.focusWindow = async () =>
      ({ trace: undefined, window: {} } as unknown as {
        trace: StepTrace;
        window: Record<string, unknown>;
      });

    await expect(
      engine.runWorkflow(workflow, {}, { desktop: client as never }),
    ).rejects.toThrow("Missing focus trace");
  });
});
