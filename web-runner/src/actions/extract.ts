import { Page } from "playwright";
import { resolveTarget } from "../selector/resolve";
import { WebStepTrace, WebTarget } from "../types";
import { finishTrace, startTrace } from "./trace";

export interface ExtractParams {
  run_id: string;
  step_id: string;
  target: WebTarget;
  field?: "text" | "value";
  timeout_ms?: number;
}

export async function extractAction(
  page: Page,
  params: ExtractParams,
): Promise<WebStepTrace> {
  const trace = startTrace(params.run_id, params.step_id);
  try {
    const resolved = await resolveTarget(
      page,
      params.target,
      params.timeout_ms,
    );
    trace.match_attempts = resolved.match_attempts;
    trace.resolved = resolved.resolved;
    if (params.field === "value") {
      trace.value = await resolved.locator.inputValue({
        timeout: params.timeout_ms,
      });
    } else {
      trace.value = (await resolved.locator.textContent({
        timeout: params.timeout_ms,
      })) ?? "";
    }
    return finishTrace(trace, true);
  } catch (error) {
    return finishTrace(
      trace,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}
