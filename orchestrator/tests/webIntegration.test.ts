import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArtifactManager } from "../src/runtime/artifacts";
import { FileCheckpointStore } from "../src/runtime/checkpoints";
import { RuntimeEngine } from "../src/runtime/engine";
import { WebClient } from "../src/rpc/webClient";
import { WorkflowDefinition } from "../src/types/workflow";

describe("RuntimeEngine web integration", () => {
  let webClient: WebClient;
  let artifactsDir: string;

  beforeAll(async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-int-"));
    artifactsDir = tempDir;
    webClient = new WebClient({ headless: true, artifactDir: tempDir });
    await webClient.start();
    await webClient.ping();

    const appUrl = pathToFileURL(
      path.join(__dirname, "..", "..", "web-runner", "test-app", "index.html"),
    ).toString();
    await webClient.navigate({
      run_id: "setup",
      step_id: "navigate",
      url: appUrl,
    });
  });

  afterAll(async () => {
    await webClient.stop();
  });

  it("executes a web workflow end-to-end", async () => {
    const artifacts = await new ArtifactManager(artifactsDir).createRunFolder(
      "flow-web-int",
    );
    const checkpointStore = new FileCheckpointStore(artifacts.runDir);
    const engine = new RuntimeEngine({
      checkpointStore,
      artifacts,
      defaultTimeoutMs: 5000,
    });

    const workflow: WorkflowDefinition = {
      id: "flow-web-int",
      steps: [
        {
          id: "fill-name",
          driver: "web",
          action: "fill",
          target: {
            ladder: [
              {
                kind: "web_css",
                confidence: 1,
                selector: { css: "#name-input" },
              },
            ],
          },
          input: "Ada",
          pre_assert: [
            {
              kind: "web_visible",
              target: {
                ladder: [
                  {
                    kind: "web_css",
                    confidence: 1,
                    selector: { css: "#name-input" },
                  },
                ],
              },
            },
          ],
          post_assert: [
            {
              kind: "web_value_equals",
              target: {
                ladder: [
                  {
                    kind: "web_css",
                    confidence: 1,
                    selector: { css: "#name-input" },
                  },
                ],
              },
              value: "Ada",
            },
          ],
        },
        {
          id: "click-submit",
          driver: "web",
          action: "click",
          target: {
            ladder: [
              {
                kind: "web_role",
                confidence: 1,
                selector: { role: "button", name: "Submit" },
              },
            ],
          },
          pre_assert: [
            {
              kind: "web_visible",
              target: {
                ladder: [
                  {
                    kind: "web_role",
                    confidence: 1,
                    selector: { role: "button", name: "Submit" },
                  },
                ],
              },
            },
          ],
          post_assert: [
            {
              kind: "web_text_contains",
              target: {
                ladder: [
                  {
                    kind: "web_css",
                    confidence: 1,
                    selector: { css: "#result" },
                  },
                ],
              },
              text: "Hello Ada",
            },
          ],
        },
      ],
    };

    await engine.runWorkflow(workflow, {}, { web: webClient });

    const tracePath = path.join(artifacts.logsDir, "step_traces.jsonl");
    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(6);
  });
});
