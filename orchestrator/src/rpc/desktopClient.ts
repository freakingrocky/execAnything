import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";
import readline from "readline";

export interface DesktopRunnerConfig {
  pythonExecutable: string;
  module: string;
  requestTimeoutMs: number;
  spawnTimeoutMs: number;
  pythonPath: string[];
}

export interface DesktopRunnerCapabilities {
  uia: boolean;
  ocr: {
    windows_ocr: boolean;
    tesseract: boolean;
  };
  screenshots: boolean;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export class DesktopRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(payload: JsonRpcErrorPayload) {
    super(payload.message);
    this.code = payload.code;
    this.data = payload.data;
  }
}

export type SpawnDesktopRunner = (config: DesktopRunnerConfig) => ChildProcessWithoutNullStreams;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: NodeJS.Timeout;
};

export class DesktopClient {
  private config: DesktopRunnerConfig;
  private spawnDesktopRunner: SpawnDesktopRunner;
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;

  constructor(config: DesktopRunnerConfig, spawnDesktopRunner: SpawnDesktopRunner = defaultSpawn) {
    this.config = config;
    this.spawnDesktopRunner = spawnDesktopRunner;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    this.process = this.spawnDesktopRunner(this.config);
    const rl = readline.createInterface({ input: this.process.stdout });

    rl.on("line", (line) => {
      this.handleLine(line);
    });

    this.process.on("exit", (code) => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Desktop runner exited with code ${code ?? "unknown"}`));
        clearTimeout(pending.timeoutId);
      }
      this.pending.clear();
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.config.spawnTimeoutMs);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.process.kill();
    this.process = null;
  }

  async ping(): Promise<{ ok: boolean; service: string; version: string }> {
    const result = await this.sendRequest("system.ping", {});
    return result as { ok: boolean; service: string; version: string };
  }

  async getCapabilities(): Promise<DesktopRunnerCapabilities> {
    const result = await this.sendRequest("system.getCapabilities", {});
    return result as DesktopRunnerCapabilities;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.process) {
      throw new Error("Desktop runner is not started");
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const request = JSON.stringify(payload);
    this.process.stdin.write(`${request}\n`);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, this.config.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId });
    });
  }

  private handleLine(line: string): void {
    let parsed: { id?: number; result?: unknown; error?: JsonRpcErrorPayload } | null = null;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      void error;
      return;
    }

    if (!parsed || typeof parsed.id !== "number") {
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }

    this.pending.delete(parsed.id);
    clearTimeout(pending.timeoutId);

    if (parsed.error) {
      pending.reject(new DesktopRpcError(parsed.error));
      return;
    }

    pending.resolve(parsed.result);
  }
}

function defaultSpawn(config: DesktopRunnerConfig): ChildProcessWithoutNullStreams {
  const resolvedPaths = (config.pythonPath ?? []).map((entry) => path.resolve(entry));
  const joinedPaths = resolvedPaths.join(path.delimiter);
  const existing = process.env.PYTHONPATH;
  const pythonPath = existing ? `${joinedPaths}${path.delimiter}${existing}` : joinedPaths;

  return spawn(config.pythonExecutable, ["-m", config.module], {
    stdio: "pipe",
    env: {
      ...process.env,
      PYTHONPATH: pythonPath,
    },
  });
}
