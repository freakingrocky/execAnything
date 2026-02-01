import fs from "fs/promises";
import path from "path";

export interface CheckpointStore {
  recordRunStart(runId: string, startedAt: string): Promise<void>;
  recordRunEnd(runId: string, endedAt: string): Promise<void>;
  recordStepStart(runId: string, stepId: string, startedAt: string): Promise<void>;
  recordStepEnd(runId: string, stepId: string, endedAt: string, ok: boolean): Promise<void>;
  getLastCompletedStepId(runId: string): Promise<string | null>;
}

export interface CheckpointStepRecord {
  id: string;
  started_at?: string;
  ended_at?: string;
  ok?: boolean;
}

export interface CheckpointRecord {
  run_id: string;
  started_at?: string;
  ended_at?: string;
  last_success_step_id?: string;
  steps: CheckpointStepRecord[];
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

export class FileCheckpointStore implements CheckpointStore {
  private checkpointPath: string;

  constructor(runDir: string) {
    this.checkpointPath = path.join(runDir, "checkpoints.json");
  }

  async recordRunStart(runId: string, startedAt: string): Promise<void> {
    const record = await this.loadRecord(runId);
    record.run_id = runId;
    record.started_at = startedAt;
    await this.saveRecord(record);
  }

  async recordRunEnd(runId: string, endedAt: string): Promise<void> {
    const record = await this.loadRecord(runId);
    record.ended_at = endedAt;
    await this.saveRecord(record);
  }

  async recordStepStart(runId: string, stepId: string, startedAt: string): Promise<void> {
    const record = await this.loadRecord(runId);
    let step = record.steps.find((entry) => entry.id === stepId);
    if (!step) {
      step = { id: stepId };
      record.steps.push(step);
    }
    step.started_at = startedAt;
    await this.saveRecord(record);
  }

  async recordStepEnd(runId: string, stepId: string, endedAt: string, ok: boolean): Promise<void> {
    const record = await this.loadRecord(runId);
    let step = record.steps.find((entry) => entry.id === stepId);
    if (!step) {
      step = { id: stepId };
      record.steps.push(step);
    }
    step.ended_at = endedAt;
    step.ok = ok;
    if (ok) {
      record.last_success_step_id = stepId;
    }
    await this.saveRecord(record);
  }

  async getLastCompletedStepId(runId: string): Promise<string | null> {
    const record = await this.loadRecord(runId);
    return record.last_success_step_id ?? null;
  }

  async readCheckpoint(): Promise<CheckpointRecord | null> {
    try {
      const raw = await fs.readFile(this.checkpointPath, "utf-8");
      return JSON.parse(raw) as CheckpointRecord;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async loadRecord(runId: string): Promise<CheckpointRecord> {
    const existing = await this.readCheckpoint();
    if (existing) {
      return existing;
    }
    return {
      run_id: runId,
      steps: [],
    };
  }

  private async saveRecord(record: CheckpointRecord): Promise<void> {
    const payload = JSON.stringify(record, null, 2);
    await fs.writeFile(this.checkpointPath, payload, "utf-8");
  }
}
