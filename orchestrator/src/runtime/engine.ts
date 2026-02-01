import { CheckpointStore } from "./checkpoints";
import { RunArtifacts } from "./artifacts";
import { WorkflowDefinition, WorkflowStep } from "../types/workflow";
import { DesktopClient } from "../rpc/desktopClient";

export interface RuntimeEngineOptions {
  checkpointStore: CheckpointStore;
  artifacts: RunArtifacts;
  defaultTimeoutMs: number;
}

export class RuntimeEngine {
  private checkpointStore: CheckpointStore;
  private artifacts: RunArtifacts;
  private defaultTimeoutMs: number;

  constructor(options: RuntimeEngineOptions) {
    this.checkpointStore = options.checkpointStore;
    this.artifacts = options.artifacts;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  async runWorkflow(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>,
    desktopClient: DesktopClient,
  ): Promise<void> {
    void inputs;
    await this.checkpointStore.recordRunStart(this.artifacts.runId, new Date().toISOString());

    for (const step of workflow.steps) {
      await this.runStep(step, desktopClient);
    }

    await this.checkpointStore.recordRunEnd(this.artifacts.runId, new Date().toISOString());
  }

  private async runStep(step: WorkflowStep, desktopClient: DesktopClient): Promise<void> {
    const startedAt = new Date().toISOString();
    await this.checkpointStore.recordStepStart(this.artifacts.runId, step.id, startedAt);

    await this.withTimeout(async () => {
      void desktopClient;
      void step;
    });

    const endedAt = new Date().toISOString();
    await this.checkpointStore.recordStepEnd(this.artifacts.runId, step.id, endedAt, true);
  }

  private async withTimeout<T>(task: () => Promise<T>): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Step timed out"));
      }, this.defaultTimeoutMs);
    });

    const result = await Promise.race([task(), timeoutPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    return result as T;
  }
}
