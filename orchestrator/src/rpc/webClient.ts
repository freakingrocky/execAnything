import {
  WebRunner,
  WebRunnerCapabilities,
  WebStepTrace,
  WebTarget,
  WebAssertion,
} from "@ai-rpa/web-runner";

export interface WebRunnerConfig {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  artifactDir?: string;
  attachEndpoint?: string;
}

export class WebClient {
  private runner: WebRunner;

  constructor(config: WebRunnerConfig = {}) {
    this.runner = new WebRunner(config);
  }

  async start(): Promise<void> {
    await this.runner.start();
  }

  async stop(): Promise<void> {
    await this.runner.stop();
  }

  async ping(): Promise<{ ok: boolean; service: string; version: string }> {
    return this.runner.ping();
  }

  async getCapabilities(): Promise<WebRunnerCapabilities> {
    return this.runner.getCapabilities();
  }

  async navigate(params: {
    run_id: string;
    step_id: string;
    url: string;
    timeout_ms?: number;
  }): Promise<WebStepTrace> {
    return this.runner.navigate(params);
  }

  async click(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return this.runner.click(params);
  }

  async fill(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return this.runner.fill(params);
  }

  async type(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return this.runner.type(params);
  }

  async select(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return this.runner.select(params);
  }

  async waitFor(params: {
    run_id: string;
    step_id: string;
    timeout_ms: number;
  }): Promise<WebStepTrace> {
    return this.runner.waitFor(params);
  }

  async extract(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    field?: "text" | "value";
    timeout_ms?: number;
  }): Promise<WebStepTrace> {
    return this.runner.extract(params);
  }

  async assertCheck(params: {
    run_id: string;
    step_id: string;
    assertions: WebAssertion[];
  }): Promise<WebStepTrace> {
    return this.runner.assertCheck(params);
  }
}

export type { WebTarget, WebAssertion, WebStepTrace, WebRunnerCapabilities };
