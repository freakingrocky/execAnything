import fs from "fs/promises";
import path from "path";

export interface RunArtifacts {
  runId: string;
  runDir: string;
  evidenceDir: string;
  logsDir: string;
  reviewDir: string;
  createdAt: string;
}

export class ArtifactManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async createRunFolder(runId?: string): Promise<RunArtifacts> {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, "-");
    const safeRunId = runId ?? `run-${safeTimestamp}`;
    const runDir = path.resolve(this.baseDir, `${safeTimestamp}_${safeRunId}`);

    const evidenceDir = path.join(runDir, "evidence");
    const logsDir = path.join(runDir, "logs");
    const reviewDir = path.join(runDir, "review");

    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(reviewDir, { recursive: true });

    return {
      runId: safeRunId,
      runDir,
      evidenceDir,
      logsDir,
      reviewDir,
      createdAt,
    };
  }

  async loadRunFolder(runDir: string, runId: string): Promise<RunArtifacts> {
    const createdAt = new Date().toISOString();
    const resolvedRunDir = path.resolve(runDir);
    const evidenceDir = path.join(resolvedRunDir, "evidence");
    const logsDir = path.join(resolvedRunDir, "logs");
    const reviewDir = path.join(resolvedRunDir, "review");

    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(reviewDir, { recursive: true });

    return {
      runId,
      runDir: resolvedRunDir,
      evidenceDir,
      logsDir,
      reviewDir,
      createdAt,
    };
  }
}
