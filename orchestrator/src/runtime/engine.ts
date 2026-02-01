import fs from "fs/promises";
import path from "path";
import { CheckpointStore } from "./checkpoints";
import { RunArtifacts } from "./artifacts";
import {
  Assertion,
  InputValue,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTarget,
} from "../types/workflow";
import {
  DesktopClient,
  DesktopRpcError,
  DesktopTarget,
  StepTrace,
} from "../rpc/desktopClient";
import {
  WebAssertion,
  WebClient,
  WebStepTrace,
  WebTarget,
} from "../rpc/webClient";

export interface RuntimeEngineOptions {
  checkpointStore: CheckpointStore;
  artifacts: RunArtifacts;
  defaultTimeoutMs: number;
  resume?: boolean;
}

export interface RuntimeClients {
  desktop?: DesktopClient;
  web?: WebClient;
}

export class RuntimeEngine {
  private checkpointStore: CheckpointStore;
  private artifacts: RunArtifacts;
  private defaultTimeoutMs: number;
  private resume: boolean;
  private stepTracePath: string;

  constructor(options: RuntimeEngineOptions) {
    this.checkpointStore = options.checkpointStore;
    this.artifacts = options.artifacts;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
    this.resume = options.resume ?? false;
    this.stepTracePath = path.join(this.artifacts.logsDir, "step_traces.jsonl");
  }

  async runWorkflow(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>,
    clients: RuntimeClients,
  ): Promise<void> {
    await this.checkpointStore.recordRunStart(
      this.artifacts.runId,
      new Date().toISOString(),
    );
    const resumeFrom = this.resume
      ? await this.checkpointStore.getLastCompletedStepId(this.artifacts.runId)
      : null;
    const resumeIndex = resumeFrom
      ? workflow.steps.findIndex((step) => step.id === resumeFrom)
      : -1;
    let skipping = resumeIndex >= 0;

    for (const step of workflow.steps) {
      if (skipping) {
        if (step.id === resumeFrom) {
          skipping = false;
        }
        continue;
      }
      await this.runStepWithClients(step, inputs, clients);
    }

    await this.checkpointStore.recordRunEnd(
      this.artifacts.runId,
      new Date().toISOString(),
    );
  }

  public async runStepWithClients(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    clients: RuntimeClients,
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    await this.checkpointStore.recordStepStart(
      this.artifacts.runId,
      step.id,
      startedAt,
    );
    console.log(
      `[run:${this.artifacts.runId}] step ${step.id} (${step.action})`,
    );

    try {
      const stepTimeoutMs =
        step.timeouts?.step_timeout_ms ?? this.defaultTimeoutMs;
      await this.withTimeout(async () => {
        if (step.driver === "desktop") {
          if (!clients.desktop) {
            throw new Error("Desktop client not configured");
          }
          await this.runDesktopStep(step, inputs, clients.desktop);
        } else if (step.driver === "web") {
          if (!clients.web) {
            throw new Error("Web client not configured");
          }
          await this.runWebStep(step, inputs, clients.web);
        } else {
          throw new Error(`Unsupported driver: ${step.driver}`);
        }
      }, stepTimeoutMs);

      const endedAt = new Date().toISOString();
      await this.checkpointStore.recordStepEnd(
        this.artifacts.runId,
        step.id,
        endedAt,
        true,
      );
    } catch (error) {
      const endedAt = new Date().toISOString();
      await this.checkpointStore.recordStepEnd(
        this.artifacts.runId,
        step.id,
        endedAt,
        false,
      );
      await this.appendTraceFromError(error);
      throw error;
    }
  }

  private async executeAction(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    desktopClient: DesktopClient,
  ): Promise<StepTrace | null> {
    const target = step.target ? this.normalizeTarget(step.target) : undefined;
    const timeout_ms =
      step.timeouts?.wait_timeout_ms ?? step.timeouts?.step_timeout_ms;
    const capture_screenshots = Boolean(step.params?.capture_screenshots);

    switch (step.action) {
      case "focus_window": {
        if (!target?.scope) {
          throw new Error(`Missing target scope for step ${step.id}`);
        }
        const result = await desktopClient.focusWindow({
          run_id: this.artifacts.runId,
          step_id: step.id,
          scope: target.scope,
          timeout_ms,
        });
        if (!result?.trace) {
          throw new Error(`Missing focus trace for step ${step.id}`);
        }
        return result.trace;
      }
      case "click":
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        return desktopClient.click({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          retry: step.retry,
          timeout_ms,
          capture_screenshots,
        });
      case "paste": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const text = this.resolveInput(step.input, inputs);
        return desktopClient.pasteText({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          text,
          retry: step.retry,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "fill":
      case "type": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const value = this.resolveInput(step.input, inputs);
        return desktopClient.setValue({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          value,
          retry: step.retry,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "extract": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        return desktopClient.extractGetValue({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          timeout_ms,
        });
      }
      case "assert": {
        const assertions =
          (step.params?.assertions as Assertion[] | undefined) ??
          step.post_assert ??
          [];
        return desktopClient.assertCheck({
          run_id: this.artifacts.runId,
          step_id: step.id,
          assertions: assertions.map((assertion) =>
            this.normalizeAssertion(assertion),
          ),
        });
      }
      default:
        throw new Error(
          `Unsupported desktop action in Phase 1: ${step.action}`,
        );
    }
  }

  private async runDesktopStep(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    desktopClient: DesktopClient,
  ): Promise<void> {
    if (step.pre_assert && step.pre_assert.length > 0) {
      const trace = await desktopClient.assertCheck({
        run_id: this.artifacts.runId,
        step_id: step.id,
        assertions: step.pre_assert.map((assertion) =>
          this.normalizeAssertion(assertion),
        ),
      });
      await this.appendTrace(trace);
    }

    const actionTrace = await this.executeAction(step, inputs, desktopClient);
    if (actionTrace) {
      await this.appendTrace(actionTrace);
    }

    if (step.post_assert && step.post_assert.length > 0) {
      const trace = await desktopClient.assertCheck({
        run_id: this.artifacts.runId,
        step_id: step.id,
        assertions: step.post_assert.map((assertion) =>
          this.normalizeAssertion(assertion),
        ),
      });
      await this.appendTrace(trace);
    }
  }

  private async runWebStep(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    webClient: WebClient,
  ): Promise<void> {
    if (step.pre_assert && step.pre_assert.length > 0) {
      const trace = await webClient.assertCheck({
        run_id: this.artifacts.runId,
        step_id: step.id,
        assertions: step.pre_assert.map((assertion) =>
          this.normalizeWebAssertion(assertion),
        ),
      });
      await this.appendTrace(trace);
    }

    const actionTrace = await this.executeWebAction(step, inputs, webClient);
    if (actionTrace) {
      await this.appendTrace(actionTrace);
    }

    if (step.post_assert && step.post_assert.length > 0) {
      const trace = await webClient.assertCheck({
        run_id: this.artifacts.runId,
        step_id: step.id,
        assertions: step.post_assert.map((assertion) =>
          this.normalizeWebAssertion(assertion),
        ),
      });
      await this.appendTrace(trace);
    }
  }

  private async executeWebAction(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    webClient: WebClient,
  ): Promise<WebStepTrace | null> {
    const target = step.target ? this.normalizeWebTarget(step.target) : undefined;
    const timeout_ms =
      step.timeouts?.wait_timeout_ms ?? step.timeouts?.step_timeout_ms;
    const capture_screenshots = Boolean(step.params?.capture_screenshots);

    switch (step.action) {
      case "navigate": {
        const urlParam = step.params?.url;
        const url = urlParam === undefined ? "" : this.resolveInput(urlParam as InputValue, inputs);
        if (!url) {
          throw new Error(`Missing url for step ${step.id}`);
        }
        return webClient.navigate({
          run_id: this.artifacts.runId,
          step_id: step.id,
          url,
          timeout_ms,
        });
      }
      case "click":
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        return webClient.click({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          timeout_ms,
          capture_screenshots,
        });
      case "fill": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const value = this.resolveInput(step.input, inputs);
        return webClient.fill({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          value,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "type": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const value = this.resolveInput(step.input, inputs);
        return webClient.type({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          value,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "paste": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const value = this.resolveInput(step.input, inputs);
        return webClient.fill({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          value,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "select": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const value = this.resolveInput(step.input, inputs);
        return webClient.select({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          value,
          timeout_ms,
          capture_screenshots,
        });
      }
      case "wait_for": {
        if (timeout_ms === undefined) {
          throw new Error(`Missing timeout for wait_for step ${step.id}`);
        }
        return webClient.waitFor({
          run_id: this.artifacts.runId,
          step_id: step.id,
          timeout_ms,
        });
      }
      case "extract": {
        if (!target) {
          throw new Error(`Missing target for step ${step.id}`);
        }
        const field =
          (step.params?.field as "text" | "value" | undefined) ?? "text";
        return webClient.extract({
          run_id: this.artifacts.runId,
          step_id: step.id,
          target,
          field,
          timeout_ms,
        });
      }
      case "assert": {
        const assertions =
          (step.params?.assertions as WebAssertion[] | undefined) ??
          step.post_assert ??
          [];
        return webClient.assertCheck({
          run_id: this.artifacts.runId,
          step_id: step.id,
          assertions: assertions.map((assertion) =>
            this.normalizeWebAssertion(assertion),
          ),
        });
      }
      default:
        throw new Error(`Unsupported web action: ${step.action}`);
    }
  }

  private resolveInput(
    value: InputValue | undefined,
    inputs: Record<string, unknown>,
  ): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }

    const raw = inputs[value.var];
    if (raw === undefined) {
      throw new Error(`Missing input variable: ${value.var}`);
    }
    let resolved = String(raw);
    switch (value.transform) {
      case "trim":
        resolved = resolved.trim();
        break;
      case "upper":
        resolved = resolved.toUpperCase();
        break;
      case "lower":
        resolved = resolved.toLowerCase();
        break;
      default:
        break;
    }
    return resolved;
  }

  private normalizeTarget(target: WorkflowTarget): DesktopTarget {
    const scope = (
      target.scope as
        | { desktop?: DesktopTarget["scope"] }
        | DesktopTarget["scope"]
        | undefined
    )?.desktop;
    return {
      ladder: target.ladder,
      scope: scope ?? (target.scope as DesktopTarget["scope"] | undefined),
    };
  }

  private normalizeAssertion(assertion: Assertion): Assertion {
    const normalized: Assertion = { ...assertion };
    if (assertion.target) {
      normalized.target = this.normalizeTarget(assertion.target);
    }
    if (assertion.assert) {
      normalized.assert = this.normalizeAssertion(assertion.assert);
    }
    return normalized;
  }

  private normalizeWebTarget(target: WorkflowTarget): WebTarget {
    const scope = (
      target.scope as
        | { web?: WebTarget["scope"] }
        | WebTarget["scope"]
        | undefined
    )?.web;
    return {
      ladder: target.ladder,
      scope: scope ?? (target.scope as WebTarget["scope"] | undefined),
    };
  }

  private normalizeWebAssertion(assertion: Assertion): WebAssertion {
    const normalized: WebAssertion = { ...assertion };
    if (assertion.target) {
      normalized.target = this.normalizeWebTarget(assertion.target);
    }
    if (assertion.assert) {
      normalized.assert = this.normalizeWebAssertion(assertion.assert);
    }
    return normalized;
  }

  private async appendTrace(trace: StepTrace | WebStepTrace): Promise<void> {
    const line = JSON.stringify(trace);
    await fs.appendFile(this.stepTracePath, `${line}\n`, "utf-8");
  }

  private async appendTraceFromError(error: unknown): Promise<void> {
    if (error instanceof DesktopRpcError) {
      const trace = (error.data as { trace?: StepTrace } | undefined)?.trace;
      if (trace) {
        await this.appendTrace(trace);
      }
    }
  }

  private async withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Step timed out"));
      }, timeoutMs);
    });

    const result = await Promise.race([task(), timeoutPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    return result as T;
  }
}
