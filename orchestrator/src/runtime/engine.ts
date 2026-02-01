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

export interface RuntimeEngineOptions {
  checkpointStore: CheckpointStore;
  artifacts: RunArtifacts;
  defaultTimeoutMs: number;
  resume?: boolean;
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
    desktopClient: DesktopClient,
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
      await this.runStep(step, inputs, desktopClient);
    }

    await this.checkpointStore.recordRunEnd(
      this.artifacts.runId,
      new Date().toISOString(),
    );
  }

  private async runStep(
    step: WorkflowStep,
    inputs: Record<string, unknown>,
    desktopClient: DesktopClient,
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
        if (step.driver !== "desktop") {
          throw new Error(`Unsupported driver in Phase 1: ${step.driver}`);
        }

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

        const actionTrace = await this.executeAction(
          step,
          inputs,
          desktopClient,
        );
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

  private async appendTrace(trace: StepTrace): Promise<void> {
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
