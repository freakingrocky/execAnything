import { useEffect, useMemo, useState } from "react";

type WorkflowTarget = {
  ladder?: Array<{ kind: string; selector?: Record<string, unknown> }>;
};

type WorkflowStep = {
  id: string;
  driver: "desktop" | "web";
  action: string;
  target?: WorkflowTarget;
  pre_assert?: Array<{ kind: string }>;
  post_assert?: Array<{ kind: string }>;
  explain?: string;
};

type WorkflowRecord = {
  id: string;
  name?: string;
  path: string;
  inputsPath?: string;
  steps: WorkflowStep[];
};

type RunStatus = "idle" | "running" | "success" | "failed" | "awaiting-decision";

type PendingDecision = {
  stepId: string;
};

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

function formatSelector(selector?: Record<string, unknown>): string {
  if (!selector) {
    return "selector: none";
  }
  const entries = Object.entries(selector).slice(0, 3);
  if (entries.length === 0) {
    return "selector: none";
  }
  const parts = entries.map(([key, value]) => `${key}=${String(value)}`);
  return parts.join(", ");
}

function formatTarget(step: WorkflowStep): string {
  const rung = step.target?.ladder?.[0];
  if (!rung) {
    return "target: none";
  }
  return `${rung.kind} · ${formatSelector(rung.selector)}`;
}

function formatAssertions(step: WorkflowStep): string {
  const pre = step.pre_assert?.length ?? 0;
  const post = step.post_assert?.length ?? 0;
  return `assertions: pre ${pre} · post ${post}`;
}

export default function App(): JSX.Element {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runDir, setRunDir] = useState<string | null>(null);
  const [reviewDir, setReviewDir] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/workflows`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setWorkflows(data.workflows ?? []);
        if (data.workflows?.length) {
          setSelectedWorkflowPath(data.workflows[0].path);
        }
      })
      .catch(() => {
        setWorkflows([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!runId) {
      return;
    }
    const eventSource = new EventSource(`${apiBase}/api/runs/${runId}/stream`);
    eventSource.addEventListener("log", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { line: string };
      setLogs((prev) => [...prev, payload.line]);
    });
    eventSource.addEventListener("status", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        status: RunStatus;
        runDir?: string;
        reviewDir?: string;
        pendingDecision?: PendingDecision | null;
      };
      setStatus(payload.status);
      setRunDir(payload.runDir ?? null);
      setReviewDir(payload.reviewDir ?? null);
      setPendingDecision(payload.pendingDecision ?? null);
    });
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => {
      eventSource.close();
    };
  }, [runId]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.path === selectedWorkflowPath) ?? null,
    [workflows, selectedWorkflowPath],
  );

  const startRun = async (endpoint: "run" | "verify" | "record-desktop"): Promise<void> => {
    if (endpoint !== "record-desktop" && !selectedWorkflow) {
      return;
    }
    setLogs([]);
    setStatus("running");
    setRunDir(null);
    setReviewDir(null);
    setPendingDecision(null);
    setComment("");

    const body =
      endpoint === "record-desktop"
        ? {}
        : { workflowPath: selectedWorkflow?.path };
    const response = await fetch(`${apiBase}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (data.runId) {
      setRunId(data.runId);
    } else {
      setStatus("failed");
      setLogs((prev) => [...prev, data.error ?? "Failed to start run"]);
    }
  };

  const submitDecision = async (decision: string): Promise<void> => {
    if (!runId || !pendingDecision) {
      return;
    }
    const response = await fetch(`${apiBase}/api/runs/${runId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    });
    if (!response.ok) {
      const data = await response.json();
      setLogs((prev) => [...prev, data.error ?? "Failed to submit decision"]);
    } else {
      setComment("");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>AI-Minimal RPA UI</h1>
          <p>Record, verify, and run workflows with live telemetry.</p>
        </div>
        <div className="controls">
          <button
            onClick={() => startRun("record-desktop")}
            className="secondary"
            type="button"
          >
            Record Desktop
          </button>
          <button
            onClick={() => startRun("verify")}
            disabled={!selectedWorkflow}
            type="button"
          >
            Verify
          </button>
          <button
            onClick={() => startRun("run")}
            disabled={!selectedWorkflow}
            type="button"
          >
            Run
          </button>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <h2>Workflows</h2>
          <ul>
            {workflows.map((workflow) => (
              <li key={workflow.path}>
                <button
                  type="button"
                  className={
                    workflow.path === selectedWorkflowPath ? "active" : undefined
                  }
                  onClick={() => setSelectedWorkflowPath(workflow.path)}
                >
                  <div className="workflow-title">{workflow.name ?? workflow.id}</div>
                  <div className="workflow-meta">{workflow.path}</div>
                  <div className="workflow-meta">
                    {workflow.steps.length} steps
                    {workflow.inputsPath ? ` · inputs: ${workflow.inputsPath}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="content">
          {selectedWorkflow ? (
            <>
              <h2>Flow</h2>
              <div className="flow">
                {selectedWorkflow.steps.map((step, index) => (
                  <div key={step.id} className="flow-item">
                    <div className="step-card">
                      <div className="step-header">
                        <span className="step-id">{step.id}</span>
                        <span className={`step-driver ${step.driver}`}>
                          {step.driver}
                        </span>
                      </div>
                      <div className="step-action">{step.action}</div>
                      <div className="step-meta">{formatTarget(step)}</div>
                      <div className="step-meta">{formatAssertions(step)}</div>
                    </div>
                    {index < selectedWorkflow.steps.length - 1 && (
                      <div className="connector" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>No workflows found.</p>
          )}
        </section>

        <section className="telemetry">
          <h2>Run Status</h2>
          <div className="status-grid">
            <div>
              <div className="status-label">State</div>
              <div className={`status-value ${status}`}>{status}</div>
            </div>
            <div>
              <div className="status-label">Run Dir</div>
              <div className="status-value">{runDir ?? "-"}</div>
            </div>
            <div>
              <div className="status-label">Review Dir</div>
              <div className="status-value">{reviewDir ?? "-"}</div>
            </div>
          </div>

          {pendingDecision && (
            <div className="decision-panel">
              <h3>Verification Decision</h3>
              <p>Step: {pendingDecision.stepId}</p>
              <textarea
                placeholder="Comment (required for comment/issue)"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <div className="decision-actions">
                <button type="button" onClick={() => submitDecision("proceed")}>
                  Proceed
                </button>
                <button
                  type="button"
                  onClick={() => submitDecision("proceed_with_comments")}
                >
                  Proceed w/ Comments
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => submitDecision("raise_issue_with_comments")}
                >
                  Raise Issue
                </button>
              </div>
            </div>
          )}

          <div className="logs">
            <div className="status-label">Logs</div>
            <pre>{logs.length ? logs.join("\n") : "No logs yet."}</pre>
          </div>
        </section>
      </div>
    </div>
  );
}
