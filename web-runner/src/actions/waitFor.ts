import { Page } from "playwright";
import { WebStepTrace } from "../types";
import { finishTrace, startTrace } from "./trace";

export interface WaitParams {
  run_id: string;
  step_id: string;
  timeout_ms: number;
}

export async function waitAction(
  page: Page,
  params: WaitParams,
): Promise<WebStepTrace> {
  const trace = startTrace(params.run_id, params.step_id);
  try {
    await page.waitForTimeout(params.timeout_ms);
    return finishTrace(trace, true);
  } catch (error) {
    return finishTrace(
      trace,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}
