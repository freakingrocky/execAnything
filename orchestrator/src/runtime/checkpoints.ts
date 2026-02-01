export interface CheckpointStore {
  recordRunStart(runId: string, startedAt: string): Promise<void>;
  recordRunEnd(runId: string, endedAt: string): Promise<void>;
  recordStepStart(runId: string, stepId: string, startedAt: string): Promise<void>;
  recordStepEnd(runId: string, stepId: string, endedAt: string, ok: boolean): Promise<void>;
  getLastCompletedStepId(runId: string): Promise<string | null>;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private runSteps = new Map<string, string[]>();

  async recordRunStart(runId: string, startedAt: string): Promise<void> {
    this.runSteps.set(runId, []);
    void startedAt;
  }

  async recordRunEnd(runId: string, endedAt: string): Promise<void> {
    void runId;
    void endedAt;
  }

  async recordStepStart(runId: string, stepId: string, startedAt: string): Promise<void> {
    void runId;
    void stepId;
    void startedAt;
  }

  async recordStepEnd(runId: string, stepId: string, endedAt: string, ok: boolean): Promise<void> {
    const steps = this.runSteps.get(runId) ?? [];
    if (ok) {
      steps.push(stepId);
      this.runSteps.set(runId, steps);
    }
    void endedAt;
  }

  async getLastCompletedStepId(runId: string): Promise<string | null> {
    const steps = this.runSteps.get(runId) ?? [];
    if (steps.length === 0) {
      return null;
    }
    return steps[steps.length - 1];
  }
}
