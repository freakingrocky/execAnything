import fs from "fs";
import path from "path";
import { parseArgs } from "./args";
import { loadConfig } from "../config/defaults";
import { ArtifactManager, RunArtifacts } from "../runtime/artifacts";
import { RuntimeEngine } from "../runtime/engine";
import { FileCheckpointStore } from "../runtime/checkpoints";
import { DesktopClient } from "../rpc/desktopClient";
import { WorkflowDefinition } from "../types/workflow";

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
  const config = loadConfig(args.config);

  const workflow = readJsonFile<WorkflowDefinition>(workflowPath);
  const inputs = readJsonFile<Record<string, unknown>>(inputsPath);

  const artifactManager = new ArtifactManager(outDir);
  const resume = Boolean(args.resume);

  let runArtifacts: RunArtifacts;
  let checkpointStore: FileCheckpointStore;

  if (resume) {
    const runDir = path.resolve(outDir);
    checkpointStore = new FileCheckpointStore(runDir);
    const checkpoint = await checkpointStore.readCheckpoint();
    if (!checkpoint) {
      throw new Error(`No checkpoint found in ${runDir}`);
    }
    runArtifacts = await artifactManager.loadRunFolder(runDir, checkpoint.run_id);
  } else {
    runArtifacts = await artifactManager.createRunFolder(workflow.id);
    checkpointStore = new FileCheckpointStore(runArtifacts.runDir);
  }

  const desktopClient = new DesktopClient(config.desktopRunner);
  await desktopClient.start();
  await desktopClient.ping();
  await desktopClient.runBegin({
    run_id: runArtifacts.runId,
    artifact_dir: runArtifacts.evidenceDir,
  });

  const engine = new RuntimeEngine({
    checkpointStore,
    artifacts: runArtifacts,
    defaultTimeoutMs: config.runtime.defaultTimeoutMs,
    resume,
  });

  try {
    await engine.runWorkflow(workflow, inputs, desktopClient);
  } finally {
    await desktopClient.runEnd({ run_id: runArtifacts.runId });
    await desktopClient.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
