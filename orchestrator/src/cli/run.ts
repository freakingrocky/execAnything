import fs from "fs";
import path from "path";
import { parseArgs } from "./args";
import { loadConfig } from "../config/defaults";
import { ArtifactManager } from "../runtime/artifacts";
import { RuntimeEngine } from "../runtime/engine";
import { InMemoryCheckpointStore } from "../runtime/checkpoints";
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
  const runArtifacts = await artifactManager.createRunFolder(workflow.id);
  const desktopClient = new DesktopClient(config.desktopRunner);
  await desktopClient.start();
  await desktopClient.ping();

  const engine = new RuntimeEngine({
    checkpointStore: new InMemoryCheckpointStore(),
    artifacts: runArtifacts,
    defaultTimeoutMs: config.runtime.defaultTimeoutMs,
  });

  await engine.runWorkflow(workflow, inputs, desktopClient);
  await desktopClient.stop();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
