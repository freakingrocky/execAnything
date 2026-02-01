import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import { WebStepTrace } from "../src/rpc/webClient";
import { WorkflowDefinition } from "../src/types/workflow";

class FakeWebClient {
  calls: Array<{ method: string; params: any }> = [];

  private createTrace(stepId: string): WebStepTrace {
    return {
      run_id: "run-1",
      step_id: stepId,
      started_at: "2024-01-01T00:00:00Z",
      ended_at: "2024-01-01T00:00:01Z",
      ok: true,
      match_attempts: [],
    };
  }

  async assertCheck(params: { step_id: string }): Promise<WebStepTrace> {
    this.calls.push({ method: "assert.check", params });
    return this.createTrace(params.step_id);
  }

  async click(params: { step_id: string }): Promise<WebStepTrace> {
    this.calls.push({ method: "action.click", params });
    return this.createTrace(params.step_id);
  }

  async fill(params: { step_id: string }): Promise<WebStepTrace> {
    this.calls.push({ method: "action.fill", params });
    return this.createTrace(params.step_id);
  }
}

describe("RuntimeEngine web flow", () => {
  it("routes web actions and assertions through the web client", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-web-"));
    const artifacts = await new ArtifactManager(tempDir).createRunFolder(
      "flow-web",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-web",
      steps: [
        {
          id: "step-1",
          driver: "web",
          action: "click",
          target: {
            ladder: [
              { kind: "web_css", confidence: 1, selector: { css: "#submit" } },
            ],
          },
          pre_assert: [
            {
              kind: "web_visible",
              target: {
                ladder: [
                  {
                    kind: "web_css",
                    confidence: 1,
                    selector: { css: "#submit" },
                  },
                ],
              },
            },
          ],
        },
        {
          id: "step-2",
          driver: "web",
          action: "fill",
          target: {
            ladder: [
              { kind: "web_css", confidence: 1, selector: { css: "#name" } },
            ],
          },
          input: "Ada",
        },
      ],
    };

    const client = new FakeWebClient();
    await engine.runWorkflow(workflow, {}, { web: client as never });

    const assertion = client.calls.find((call) => call.method === "assert.check");
    expect(assertion).toBeTruthy();
    expect(assertion?.params.assertions?.[0]?.kind).toBe("web_visible");
    expect(assertion?.params.assertions?.[0]?.target?.ladder?.[0]?.kind).toBe(
      "web_css",
    );

    const click = client.calls.find((call) => call.method === "action.click");
    expect(click?.params.target?.ladder?.[0]?.kind).toBe("web_css");
  });
});
