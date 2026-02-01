import fs from "fs/promises";
import path from "path";
import { RunArtifacts } from "./artifacts";
import { CheckpointStore } from "./checkpoints";
import { RuntimeClients, RuntimeEngine } from "./engine";
import { WorkflowDefinition, WorkflowStep } from "../types/workflow";

export type VerificationDecision =
  | "proceed"
  | "proceed_with_comments"
  | "raise_issue_with_comments";

export interface DecisionRecord {
  at: string;
  step_id: string;
  decision: VerificationDecision;
  comment?: string;
}

export interface DecisionProvider {
  getDecision(step: WorkflowStep): Promise<DecisionRecord>;
}

export interface VerificationOptions {
  workflow: WorkflowDefinition;
  inputs: Record<string, unknown>;
  engine: RuntimeEngine;
  clients: RuntimeClients;
  artifacts: RunArtifacts;
  checkpointStore: CheckpointStore;
  decisionProvider: DecisionProvider;
}

function formatAssertions(title: string, assertions?: WorkflowStep["pre_assert"]): string {
  if (!assertions || assertions.length === 0) {
    return `${title}: none`;
  }
  const lines = assertions.map((assertion) => `- ${assertion.kind}`).join("\n");
  return `${title}:\n${lines}`;
}

async function writeExplainBlock(step: WorkflowStep, reviewDir: string): Promise<void> {
  const explain = step.explain ?? `${step.action} (${step.driver})`;
  const content = [
    `# Step ${step.id}`,
    "",
    `**Explain**: ${explain}`,
    "",
    formatAssertions("Pre-assertions", step.pre_assert),
    "",
    formatAssertions("Post-assertions", step.post_assert),
    "",
  ].join("\n");
  const filePath = path.join(reviewDir, `step_${step.id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
}

async function writeStepArtifacts(
  step: WorkflowStep,
  artifacts: RunArtifacts,
): Promise<void> {
  const tracePath = path.join(artifacts.logsDir, "step_traces.jsonl");
  const raw = await fs.readFile(tracePath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const last = [...lines]
    .reverse()
    .map((line) => JSON.parse(line))
    .find((entry) => entry.step_id === step.id);
  if (!last) {
    return;
  }

  await fs.writeFile(
    path.join(artifacts.reviewDir, `step_${step.id}_trace.json`),
    JSON.stringify(last, null, 2),
    "utf-8",
  );

  if (last.value !== undefined) {
    await fs.writeFile(
      path.join(artifacts.reviewDir, `step_${step.id}_value.json`),
      JSON.stringify({ value: last.value }, null, 2),
      "utf-8",
    );
  }

  const screenshotPaths = [
    last.before_screenshot_path,
    last.after_screenshot_path,
  ].filter(Boolean);
  for (const screenshotPath of screenshotPaths) {
    const fileName = path.basename(screenshotPath as string);
    await fs.copyFile(
      screenshotPath as string,
      path.join(artifacts.reviewDir, fileName),
    );
  }
}

async function appendDecision(
  artifacts: RunArtifacts,
  decision: DecisionRecord,
): Promise<void> {
  const line = JSON.stringify(decision);
  const decisionPath = path.join(artifacts.reviewDir, "decisions.jsonl");
  await fs.appendFile(decisionPath, `${line}\n`, "utf-8");
}

export async function runVerification(options: VerificationOptions): Promise<void> {
  const {
    workflow,
    inputs,
    engine,
    clients,
    artifacts,
    checkpointStore,
    decisionProvider,
  } = options;

  await checkpointStore.recordRunStart(
    artifacts.runId,
    new Date().toISOString(),
  );

  for (const step of workflow.steps) {
    await writeExplainBlock(step, artifacts.reviewDir);
    await engine.runStepWithClients(step, inputs, clients);
    await writeStepArtifacts(step, artifacts);
    const decision = await decisionProvider.getDecision(step);
    await appendDecision(artifacts, decision);
  }

  await checkpointStore.recordRunEnd(
    artifacts.runId,
    new Date().toISOString(),
  );
}
