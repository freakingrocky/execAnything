import fs from "fs/promises";
import path from "path";
import { WorkflowDefinition, WorkflowRecord } from "./types";

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walk(resolved)));
      continue;
    }
    if (entry.isFile() && entry.name === "workflow.json") {
      paths.push(resolved);
    }
  }

  return paths;
}

export async function findWorkflowFiles(rootDir: string): Promise<string[]> {
  try {
    const files = await walk(rootDir);
    return files.sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function resolveInputsPath(workflowPath: string): Promise<string | undefined> {
  const dir = path.dirname(workflowPath);
  const candidate = path.join(dir, "inputs.json");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

export async function loadWorkflows(rootDir: string, repoRoot: string): Promise<WorkflowRecord[]> {
  const workflowPaths = await findWorkflowFiles(rootDir);
  const workflows: WorkflowRecord[] = [];

  for (const workflowPath of workflowPaths) {
    const raw = await fs.readFile(workflowPath, "utf-8");
    let parsed: WorkflowDefinition;
    try {
      parsed = JSON.parse(raw) as WorkflowDefinition;
    } catch (error) {
      throw new Error(`Failed to parse workflow: ${workflowPath}`);
    }
    if (!parsed.id || !Array.isArray(parsed.steps)) {
      throw new Error(`Invalid workflow shape: ${workflowPath}`);
    }

    const inputsPath = await resolveInputsPath(workflowPath);
    workflows.push({
      id: parsed.id,
      name: parsed.name,
      path: path.relative(repoRoot, workflowPath),
      inputsPath: inputsPath ? path.relative(repoRoot, inputsPath) : undefined,
      steps: parsed.steps,
    });
  }

  return workflows;
}
