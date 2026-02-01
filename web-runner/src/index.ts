import { Browser, BrowserContext, Page } from "playwright";
import { launchBrowser } from "./browser/launch";
import { attachBrowser } from "./browser/attach";
import { clickAction } from "./actions/click";
import { fillAction } from "./actions/fill";
import { typeAction } from "./actions/type";
import { selectAction } from "./actions/select";
import { waitAction } from "./actions/waitFor";
import { extractAction } from "./actions/extract";
import { assertAction } from "./actions/assert";
import {
  WebAssertion,
  WebStepTrace,
  WebTarget,
  WebTargetScope,
} from "./types";

export interface WebRunnerCapabilities {
  playwright: boolean;
  browser: string;
  selectors: string[];
  assertions: string[];
}

export interface WebRunnerOptions {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  artifactDir?: string;
  attachEndpoint?: string;
}

export class WebRunner {
  private options: WebRunnerOptions;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(options: WebRunnerOptions = {}) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.browser) {
      return;
    }
    if (this.options.attachEndpoint) {
      this.browser = await attachBrowser({
        endpoint: this.options.attachEndpoint,
      });
    } else {
      this.browser = await launchBrowser({
        browser: this.options.browser,
        headless: this.options.headless,
      });
    }
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async stop(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.context = null;
    this.browser = null;
    this.page = null;
  }

  async ping(): Promise<{ ok: boolean; service: string; version: string }> {
    return { ok: true, service: "web-runner", version: "0.1.0" };
  }

  async getCapabilities(): Promise<WebRunnerCapabilities> {
    return {
      playwright: true,
      browser: this.options.browser ?? "chromium",
      selectors: ["web_role", "web_label", "web_css", "web_text", "web_xpath"],
      assertions: [
        "web_exists",
        "web_visible",
        "web_url_contains",
        "web_url_equals",
        "web_title_contains",
        "web_text_contains",
        "web_text_equals",
        "web_value_equals",
        "web_value_contains",
        "not",
      ],
    };
  }

  async navigate(params: {
    run_id: string;
    step_id: string;
    url: string;
    timeout_ms?: number;
  }): Promise<WebStepTrace> {
    const page = this.requirePage();
    const trace: WebStepTrace = {
      run_id: params.run_id,
      step_id: params.step_id,
      started_at: new Date().toISOString(),
      ended_at: "",
      ok: false,
      match_attempts: [],
    };
    try {
      await page.goto(params.url, { timeout: params.timeout_ms });
      trace.ok = true;
      trace.ended_at = new Date().toISOString();
      return trace;
    } catch (error) {
      trace.error = error instanceof Error ? error.message : String(error);
      trace.ended_at = new Date().toISOString();
      return trace;
    }
  }

  async click(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return clickAction(this.requirePage(), params, this.options.artifactDir);
  }

  async fill(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return fillAction(this.requirePage(), params, this.options.artifactDir);
  }

  async type(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return typeAction(this.requirePage(), params, this.options.artifactDir);
  }

  async select(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    value: string;
    timeout_ms?: number;
    capture_screenshots?: boolean;
  }): Promise<WebStepTrace> {
    return selectAction(this.requirePage(), params, this.options.artifactDir);
  }

  async waitFor(params: {
    run_id: string;
    step_id: string;
    timeout_ms: number;
  }): Promise<WebStepTrace> {
    return waitAction(this.requirePage(), params);
  }

  async extract(params: {
    run_id: string;
    step_id: string;
    target: WebTarget;
    field?: "text" | "value";
    timeout_ms?: number;
  }): Promise<WebStepTrace> {
    return extractAction(this.requirePage(), params);
  }

  async assertCheck(params: {
    run_id: string;
    step_id: string;
    assertions: WebAssertion[];
  }): Promise<WebStepTrace> {
    return assertAction(this.requirePage(), params);
  }

  async setScope(scope?: WebTargetScope): Promise<void> {
    const page = this.requirePage();
    if (scope?.url_contains && !page.url().includes(scope.url_contains)) {
      throw new Error(`URL does not match scope: ${scope.url_contains}`);
    }
    if (scope?.title_contains) {
      const title = await page.title();
      if (!title.includes(scope.title_contains)) {
        throw new Error(`Title does not match scope: ${scope.title_contains}`);
      }
    }
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("Web runner is not started");
    }
    return this.page;
  }
}

export type {
  WebTarget,
  WebTargetScope,
  WebStepTrace,
  WebAssertion,
} from "./types";
