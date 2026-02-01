import fs from "fs";
import path from "path";
import { parseArgs } from "./args";
import { loadConfig } from "../config/defaults";

function readJsonFile<T>(filePath: string): T {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as T;
}

function requireRecordings(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    throw new Error("Missing required argument: --recordings");
  }
  return values;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadConfig(args.config);
  const recordings = requireRecordings(args.recordings);

  recordings.forEach((recordingPath) => {
    readJsonFile<Record<string, unknown>>(recordingPath);
  });

  console.log("compile not implemented");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
