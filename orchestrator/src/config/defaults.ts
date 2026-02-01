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

export interface WebRunnerConfig {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  attachEndpoint?: string;
}

export interface OrchestratorConfig {
  desktopRunner: DesktopRunnerConfig;
  webRunner: WebRunnerConfig;
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
  webRunner: {
    browser: "chromium",
    headless: true,
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
    webRunner: {
      ...defaultConfig.webRunner,
      ...(parsed.webRunner ?? {}),
    },
    runtime: {
      ...defaultConfig.runtime,
      ...(parsed.runtime ?? {}),
    },
  };
}
