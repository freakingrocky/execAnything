import { WebStepTrace } from "../types";

export function startTrace(run_id: string, step_id: string): WebStepTrace {
  return {
    run_id,
    step_id,
    started_at: new Date().toISOString(),
    ended_at: "",
    ok: false,
    match_attempts: [],
  };
}

export function finishTrace(
  trace: WebStepTrace,
  ok: boolean,
  error?: string,
): WebStepTrace {
  trace.ended_at = new Date().toISOString();
  trace.ok = ok;
  if (error) {
    trace.error = error;
  }
  return trace;
}
