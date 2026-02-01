import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import {
  DecisionProvider,
  DecisionRecord,
  runVerification,
} from "../src/runtime/verification";
import { StepTrace } from "../src/rpc/desktopClient";
import { WorkflowDefinition } from "../src/types/workflow";

class FakeDesktopClient {
  async assertCheck(params: { step_id: string }): Promise<StepTrace> {
    return {
      run_id: "run-1",
      step_id: params.step_id,
      started_at: "2024-01-01T00:00:00Z",
      ended_at: "2024-01-01T00:00:01Z",
      ok: true,
      match_attempts: [],
    };
  }

  async click(params: { step_id: string }): Promise<StepTrace> {
    return {
      run_id: "run-1",
      step_id: params.step_id,
      started_at: "2024-01-01T00:00:00Z",
      ended_at: "2024-01-01T00:00:01Z",
      ok: true,
      match_attempts: [],
    };
  }
}

class FakeDecisionProvider implements DecisionProvider {
  async getDecision(step: WorkflowDefinition["steps"][number]): Promise<DecisionRecord> {
    return {
      at: new Date().toISOString(),
      step_id: step.id,
      decision: "proceed_with_comments",
      comment: "looks good",
    };
  }
}

describe("verification mode", () => {
  it("writes review artifacts and decisions", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-verify",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-verify",
      steps: [
        {
          id: "step-1",
          driver: "desktop",
          action: "click",
          target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
          pre_assert: [{ kind: "desktop_window_active" }],
          post_assert: [{ kind: "desktop_window_active" }],
        },
      ],
    };

    await runVerification({
      workflow,
      inputs: {},
      engine,
      clients: { desktop: new FakeDesktopClient() as never },
      artifacts,
      checkpointStore,
      decisionProvider: new FakeDecisionProvider(),
    });

    const explainPath = path.join(artifacts.reviewDir, "step_step-1.md");
    const tracePath = path.join(artifacts.reviewDir, "step_step-1_trace.json");
    const decisionsPath = path.join(artifacts.reviewDir, "decisions.jsonl");

    expect(fs.existsSync(explainPath)).toBe(true);
    expect(fs.existsSync(tracePath)).toBe(true);
    expect(fs.existsSync(decisionsPath)).toBe(true);

    const decisions = fs.readFileSync(decisionsPath, "utf-8").trim().split("\n");
    expect(decisions).toHaveLength(1);
    expect(JSON.parse(decisions[0]).decision).toBe("proceed_with_comments");
  });
});
