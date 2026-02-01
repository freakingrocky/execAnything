import { Page } from "playwright";
import { resolveTarget } from "../selector/resolve";
import { WebStepTrace, WebTarget } from "../types";
import { captureScreenshot } from "./screenshot";
import { finishTrace, startTrace } from "./trace";

export interface ClickParams {
  run_id: string;
  step_id: string;
  target: WebTarget;
  timeout_ms?: number;
  capture_screenshots?: boolean;
}

export async function clickAction(
  page: Page,
  params: ClickParams,
  artifactDir?: string,
): Promise<WebStepTrace> {
  const trace = startTrace(params.run_id, params.step_id);
  try {
    if (params.capture_screenshots) {
      trace.before_screenshot_path = await captureScreenshot(
        page,
        artifactDir,
        `${params.step_id}-before.png`,
      );
    }
    const resolved = await resolveTarget(
      page,
      params.target,
      params.timeout_ms,
    );
    trace.match_attempts = resolved.match_attempts;
    trace.resolved = resolved.resolved;
    await resolved.locator.click({ timeout: params.timeout_ms });
    if (params.capture_screenshots) {
      trace.after_screenshot_path = await captureScreenshot(
        page,
        artifactDir,
        `${params.step_id}-after.png`,
      );
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
