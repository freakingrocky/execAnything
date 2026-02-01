import fs from "fs";
import path from "path";
import { parseArgs } from "./args";
import { loadConfig } from "../config/defaults";
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
  loadConfig(args.config);

  readJsonFile<WorkflowDefinition>(workflowPath);
  readJsonFile<Record<string, unknown>>(inputsPath);

  console.log("verify not implemented");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
