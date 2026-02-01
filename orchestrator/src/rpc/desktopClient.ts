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

export interface RetryPolicy {
  attempts: number;
  wait_ms: number;
  backoff?: "none" | "linear" | "exponential";
}

export interface TargetRung {
  kind: "uia" | "uia_near_label" | "uia_path" | "ocr_anchor" | "coords";
  confidence: number;
  selector: Record<string, unknown>;
  notes?: string;
}

export interface DesktopTarget {
  ladder: TargetRung[];
  scope?: {
    process_name?: string;
    window_title_contains?: string;
    window_class?: string;
  };
}

export interface MatchAttempt {
  rung_index: number;
  kind: string;
  matched_count: number;
  duration_ms: number;
  ok: boolean;
  error?: string;
}

export interface ResolvedElement {
  rung_index: number;
  kind: string;
  element: Record<string, unknown>;
}

export interface StepTrace {
  run_id: string;
  step_id: string;
  started_at: string;
  ended_at: string;
  ok: boolean;
  match_attempts: MatchAttempt[];
  resolved?: ResolvedElement;
  before_screenshot_path?: string;
  after_screenshot_path?: string;
  error?: string;
  error_code?: number;
  failed?: Array<{ index: number; kind: string; message: string }>;
  value?: string;
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

  async runBegin(params: { run_id: string; artifact_dir: string; correlation_id?: string }): Promise<{ ok: boolean }> {
    const result = await this.sendRequest("run.begin", params);
    return result as { ok: boolean };
  }

  async runEnd(params: { run_id: string }): Promise<{ ok: boolean }> {
    const result = await this.sendRequest("run.end", params);
    return result as { ok: boolean };
  }

  async resolveTarget(params: {
    run_id: string;
    step_id: string;
    target: DesktopTarget;
    retry?: RetryPolicy;
    timeout_ms?: number;
  }): Promise<{ resolved: ResolvedElement; match_attempts: MatchAttempt[] }> {
    const result = await this.sendRequest("target.resolve", params);
    return result as { resolved: ResolvedElement; match_attempts: MatchAttempt[] };
  }

  async click(params: {
    run_id: string;
    step_id: string;
    target: DesktopTarget;
    button?: "left" | "right" | "middle";
    clicks?: number;
    retry?: RetryPolicy;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<StepTrace> {
    const result = await this.sendRequest("action.click", params);
    return result as StepTrace;
  }

  async pasteText(params: {
    run_id: string;
    step_id: string;
    target: DesktopTarget;
    text: string;
    retry?: RetryPolicy;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<StepTrace> {
    const result = await this.sendRequest("action.pasteText", params);
    return result as StepTrace;
  }

  async setValue(params: {
    run_id: string;
    step_id: string;
    target: DesktopTarget;
    value: string;
    retry?: RetryPolicy;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<StepTrace> {
    const result = await this.sendRequest("action.setValue", params);
    return result as StepTrace;
  }

  async assertCheck(params: {
    run_id: string;
    step_id: string;
    assertions: Array<Record<string, unknown>>;
  }): Promise<StepTrace> {
    const result = await this.sendRequest("assert.check", params);
    return result as StepTrace;
  }

  async extractGetValue(params: {
    run_id: string;
    step_id: string;
    target: DesktopTarget;
    timeout_ms?: number;
  }): Promise<StepTrace> {
    const result = await this.sendRequest("extract.getValue", params);
    return result as StepTrace;
  }

  async screenshot(params: {
    run_id: string;
    step_id: string;
    name: string;
    mode?: "active_window" | "screen";
  }): Promise<StepTrace> {
    const result = await this.sendRequest("artifact.screenshot", params);
    return result as StepTrace;
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
