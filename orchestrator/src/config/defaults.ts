import fs from "fs";
import path from "path";

export interface DesktopRunnerConfig {
  pythonExecutable: string;
  module: string;
  requestTimeoutMs: number;
  spawnTimeoutMs: number;
  pythonPath: string[];
}

export interface RuntimeConfig {
  defaultTimeoutMs: number;
}

export interface OrchestratorConfig {
  desktopRunner: DesktopRunnerConfig;
  runtime: RuntimeConfig;
}

export const defaultConfig: OrchestratorConfig = {
  desktopRunner: {
    pythonExecutable: "python",
    module: "desktop_runner.server",
    requestTimeoutMs: 10_000,
    spawnTimeoutMs: 5_000,
    pythonPath: ["desktop-runner/src"],
  },
  runtime: {
    defaultTimeoutMs: 30_000,
  },
};

export function loadConfig(configPath?: string): OrchestratorConfig {
  if (!configPath) {
    return defaultConfig;
  }

  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw) as Partial<OrchestratorConfig>;

  return {
    desktopRunner: {
      ...defaultConfig.desktopRunner,
      ...(parsed.desktopRunner ?? {}),
    },
    runtime: {
      ...defaultConfig.runtime,
      ...(parsed.runtime ?? {}),
    },
  };
}
