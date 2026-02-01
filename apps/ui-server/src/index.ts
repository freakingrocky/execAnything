import cors from "cors";
import express, { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import crypto from "crypto";
import { loadWorkflows, resolveInputsPath } from "./workflows";

type RunStatus = "running" | "success" | "failed" | "awaiting-decision";
type RunType = "run" | "verify" | "record-desktop";

interface PendingDecision {
  stepId: string;
}

interface RunSession {
  id: string;
  type: RunType;
  status: RunStatus;
  logs: string[];
  startedAt: number;
  runDir?: string;
  reviewDir?: string;
  pendingDecision?: PendingDecision;
  process: ChildProcessWithoutNullStreams;
  subscribers: Set<Response>;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const workflowsDir = path.resolve(
  process.env.AI_RPA_WORKFLOWS_DIR ?? path.join(repoRoot, "workflows"),
);
const runsDir = path.resolve(process.env.AI_RPA_RUNS_DIR ?? path.join(repoRoot, "runs"));
const recordingsDir = path.resolve(
  process.env.AI_RPA_RECORDINGS_DIR ?? path.join(repoRoot, "recordings"),
);
const orchestratorConfigPath = process.env.AI_RPA_ORCHESTRATOR_CONFIG;

const sessions = new Map<string, RunSession>();

function resolveBinaryPath(relativePath: string): string {
  return path.resolve(repoRoot, relativePath);
}

function resolveRunExecutable(): string {
  const tsNodeName = process.platform === "win32" ? "ts-node.cmd" : "ts-node";
  return resolveBinaryPath(path.join("orchestrator", "node_modules", ".bin", tsNodeName));
}

function buildRunArgs(
  command: "run" | "verify",
  workflowPath: string,
  inputsPath: string,
): string[] {
  const cliPath = resolveBinaryPath(path.join("orchestrator", "src", "cli", `${command}.ts`));
  const args = [cliPath, "--workflow", workflowPath, "--inputs", inputsPath, "--out", runsDir];
  if (orchestratorConfigPath) {
    args.push("--config", orchestratorConfigPath);
  }
  return args;
}

async function ensureInputsPath(workflowPath: string, runId: string): Promise<string> {
  const resolvedWorkflowPath = path.resolve(repoRoot, workflowPath);
  if (!resolvedWorkflowPath.startsWith(repoRoot)) {
    throw new Error("Workflow path must be inside the repository");
  }
  const existing = await resolveInputsPath(resolvedWorkflowPath);
  if (existing) {
    return existing;
  }

  await fs.mkdir(runsDir, { recursive: true });
  const fallbackPath = path.join(runsDir, `${runId}_inputs.json`);
  await fs.writeFile(fallbackPath, JSON.stringify({}, null, 2), "utf-8");
  return fallbackPath;
}

function broadcast(session: RunSession, event: string, payload: Record<string, unknown>): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of session.subscribers) {
    client.write(data);
  }
}

function attachProcessHandlers(session: RunSession): void {
  const handleLine = (line: string): void => {
    session.logs.push(line);
    broadcast(session, "log", { line });
    const decisionMatch =
      line.match(/\[verify\]\s+Awaiting decision for step\s+(.+)/i) ??
      line.match(/Step\s+(.+?):\s+\[p\]roceed/i);
    if (decisionMatch) {
      session.pendingDecision = { stepId: decisionMatch[1] };
      session.status = "awaiting-decision";
      broadcast(session, "status", {
        status: session.status,
        runDir: session.runDir,
        reviewDir: session.reviewDir,
        pendingDecision: session.pendingDecision,
      });
    }
  };

  session.process.stdout.on("data", (chunk: Buffer) => {
    chunk
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .forEach(handleLine);
  });
  session.process.stderr.on("data", (chunk: Buffer) => {
    chunk
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .forEach((line) => handleLine(`[stderr] ${line}`));
  });

  session.process.on("exit", async (code) => {
    session.status = code === 0 ? "success" : "failed";
    session.pendingDecision = undefined;
    if (session.type !== "record-desktop") {
      session.runDir = await findLatestRunDir(session.startedAt);
      session.reviewDir = session.runDir ? path.join(session.runDir, "review") : undefined;
    }
    broadcast(session, "status", {
      status: session.status,
      runDir: session.runDir,
      reviewDir: session.reviewDir,
      pendingDecision: session.pendingDecision,
    });
  });
}

async function findLatestRunDir(startedAt: number): Promise<string | undefined> {
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const candidates: Array<{ path: string; mtimeMs: number }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const resolved = path.join(runsDir, entry.name);
      const stats = await fs.stat(resolved);
      if (stats.mtimeMs >= startedAt - 1000) {
        candidates.push({ path: resolved, mtimeMs: stats.mtimeMs });
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0]?.path;
  } catch {
    return undefined;
  }
}

async function startRunSession(type: RunType, workflowPath?: string): Promise<RunSession> {
  const id = crypto.randomUUID();
  let childProcess: ChildProcessWithoutNullStreams;

  if (type === "record-desktop") {
    const pythonExecutable = process.env.AI_RPA_PYTHON ?? "python";
    await fs.mkdir(recordingsDir, { recursive: true });
    childProcess = spawn(
      pythonExecutable,
      ["-m", "recorder_desktop.record", "--name", `recording-${id}`, "--out", recordingsDir],
      { cwd: repoRoot, env: process.env },
    );
  } else {
    if (!workflowPath) {
      throw new Error("workflowPath is required");
    }
    const tsNodePath = resolveRunExecutable();
    try {
      await fs.access(tsNodePath);
    } catch {
      throw new Error("ts-node was not found. Run npm install in orchestrator.");
    }
    const resolvedWorkflowPath = path.resolve(repoRoot, workflowPath);
    if (!resolvedWorkflowPath.startsWith(repoRoot)) {
      throw new Error("Workflow path must be inside the repository");
    }
    const inputsPath = await ensureInputsPath(workflowPath, id);
    const args = buildRunArgs(type, resolvedWorkflowPath, inputsPath);
    childProcess = spawn(tsNodePath, args, { cwd: repoRoot, env: process.env });
  }

  const session: RunSession = {
    id,
    type,
    status: "running",
    logs: [],
    startedAt: Date.now(),
    process: childProcess,
    subscribers: new Set<Response>(),
  };

  sessions.set(id, session);
  attachProcessHandlers(session);
  return session;
}

app.get("/api/workflows", async (_req: Request, res: Response) => {
  try {
    const workflows = await loadWorkflows(workflowsDir, repoRoot);
    res.json({ workflows });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/run", async (req: Request, res: Response) => {
  const workflowPath = req.body?.workflowPath as string | undefined;
  if (!workflowPath) {
    res.status(400).json({ error: "workflowPath is required" });
    return;
  }
  try {
    const session = await startRunSession("run", workflowPath);
    res.json({ runId: session.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/verify", async (req: Request, res: Response) => {
  const workflowPath = req.body?.workflowPath as string | undefined;
  if (!workflowPath) {
    res.status(400).json({ error: "workflowPath is required" });
    return;
  }
  try {
    const session = await startRunSession("verify", workflowPath);
    res.json({ runId: session.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/record-desktop", async (_req: Request, res: Response) => {
  try {
    const session = await startRunSession("record-desktop");
    res.json({ runId: session.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/runs/:id/decision", async (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Run session not found" });
    return;
  }
  if (session.type !== "verify") {
    res.status(400).json({ error: "Decisions are only supported for verify runs" });
    return;
  }
  if (!session.pendingDecision) {
    res.status(400).json({ error: "No decision pending for this run" });
    return;
  }

  const decision = req.body?.decision as string | undefined;
  const comment = req.body?.comment as string | undefined;
  if (!decision) {
    res.status(400).json({ error: "decision is required" });
    return;
  }
  if ((decision === "proceed_with_comments" || decision === "raise_issue_with_comments") && !comment) {
    res.status(400).json({ error: "comment is required for the selected decision" });
    return;
  }

  if (decision === "proceed") {
    session.process.stdin.write("p\n");
  } else if (decision === "proceed_with_comments") {
    session.process.stdin.write(`c\n${comment}\n`);
  } else if (decision === "raise_issue_with_comments") {
    session.process.stdin.write(`r\n${comment}\n`);
  } else {
    res.status(400).json({ error: "Unknown decision value" });
    return;
  }

  session.pendingDecision = undefined;
  session.status = "running";
  broadcast(session, "status", {
    status: session.status,
    runDir: session.runDir,
    reviewDir: session.reviewDir,
    pendingDecision: session.pendingDecision,
  });

  res.json({ ok: true });
});

app.get("/api/runs/:id/stream", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  session.subscribers.add(res);
  broadcast(session, "status", {
    status: session.status,
    runDir: session.runDir,
    reviewDir: session.reviewDir,
    pendingDecision: session.pendingDecision,
  });
  for (const line of session.logs) {
    res.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`);
  }

  const keepAlive = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    session.subscribers.delete(res);
  });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`UI server listening on http://localhost:${port}`);
});
