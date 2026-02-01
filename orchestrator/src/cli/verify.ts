import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { parseArgs } from "./args";
import { loadConfig } from "../config/defaults";
import { ArtifactManager } from "../runtime/artifacts";
import { FileCheckpointStore } from "../runtime/checkpoints";
import { RuntimeEngine } from "../runtime/engine";
import { runVerification, DecisionProvider, DecisionRecord } from "../runtime/verification";
import { DesktopClient } from "../rpc/desktopClient";
import { WebClient } from "../rpc/webClient";
import { WorkflowDefinition, WorkflowStep } from "../types/workflow";

function readJsonFile<T>(filePath: string): T {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as T;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workflowPath = requireArg(args.workflow, "workflow");
  const inputsPath = requireArg(args.inputs, "inputs");
  const outDir = requireArg(args.out, "out");

  const workflow = readJsonFile<WorkflowDefinition>(workflowPath);
  const inputs = readJsonFile<Record<string, unknown>>(inputsPath);
  const config = loadConfig(args.config);

  const artifactManager = new ArtifactManager(outDir);
  const runArtifacts = await artifactManager.createRunFolder(workflow.id);
  const checkpointStore = new FileCheckpointStore(runArtifacts.runDir);

  const desktopClient = new DesktopClient(config.desktopRunner);
  const webClient = new WebClient({
    ...config.webRunner,
    artifactDir: runArtifacts.evidenceDir,
  });

  const usesWeb = workflow.steps.some((step) => step.driver === "web");

  await desktopClient.start();
  await desktopClient.ping();
  await desktopClient.runBegin({
    run_id: runArtifacts.runId,
    artifact_dir: runArtifacts.evidenceDir,
  });

  if (usesWeb) {
    await webClient.start();
    await webClient.ping();
  }

  const decisionProvider: DecisionProvider = new PromptDecisionProvider();
  const engine = new RuntimeEngine({
    checkpointStore,
    artifacts: runArtifacts,
    defaultTimeoutMs: config.runtime.defaultTimeoutMs,
  });

  try {
    await runVerification({
      workflow,
      inputs,
      engine,
      clients: { desktop: desktopClient, web: usesWeb ? webClient : undefined },
      artifacts: runArtifacts,
      checkpointStore,
      decisionProvider,
    });
  } finally {
    await desktopClient.runEnd({ run_id: runArtifacts.runId });
    await desktopClient.stop();
    if (usesWeb) {
      await webClient.stop();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

class PromptDecisionProvider implements DecisionProvider {
  async getDecision(step: WorkflowStep): Promise<DecisionRecord> {
    const rl = readline.createInterface({ input, output });
    try {
      let choice = "";
      console.log(`[verify] Awaiting decision for step ${step.id}`);
      while (!["p", "c", "r"].includes(choice)) {
        choice = (
          await rl.question(
            `Step ${step.id}: [p]roceed, [c]omment, [r]aise issue? `,
          )
        )
          .trim()
          .toLowerCase();
      }

      let decision: DecisionRecord;
      if (choice === "p") {
        decision = {
          at: new Date().toISOString(),
          step_id: step.id,
          decision: "proceed",
        };
      } else {
        const comment = await rl.question("Enter comment: ");
        decision = {
          at: new Date().toISOString(),
          step_id: step.id,
          decision:
            choice === "c"
              ? "proceed_with_comments"
              : "raise_issue_with_comments",
          comment: comment.trim(),
        };
      }
      return decision;
    } finally {
      rl.close();
    }
  }
}
