import { Page } from "playwright";
import { resolveTarget } from "../selector/resolve";
import { MatchAttempt, ResolvedElement, WebAssertion, WebStepTrace } from "../types";
import { finishTrace, startTrace } from "./trace";

export interface AssertParams {
  run_id: string;
  step_id: string;
  assertions: WebAssertion[];
}

async function assertSingle(
  page: Page,
  assertion: WebAssertion,
): Promise<{ match_attempts: MatchAttempt[]; resolved?: ResolvedElement }> {
  switch (assertion.kind) {
    case "web_exists": {
      if (!assertion.target) {
        throw new Error("web_exists assertion requires a target");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      await resolved.locator.first().waitFor({
        state: "attached",
        timeout: assertion.timeout_ms,
      });
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_visible": {
      if (!assertion.target) {
        throw new Error("web_visible assertion requires a target");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      const visible = await resolved.locator.isVisible({
        timeout: assertion.timeout_ms,
      });
      if (!visible) {
        throw new Error("Target is not visible");
      }
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_text_contains": {
      if (!assertion.target || !assertion.text) {
        throw new Error("web_text_contains assertion requires target + text");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      const text = (await resolved.locator.textContent()) ?? "";
      if (!text.includes(assertion.text)) {
        throw new Error("Text does not contain expected value");
      }
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_text_equals": {
      if (!assertion.target || !assertion.text) {
        throw new Error("web_text_equals assertion requires target + text");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      const text = (await resolved.locator.textContent()) ?? "";
      if (text !== assertion.text) {
        throw new Error("Text does not equal expected value");
      }
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_value_equals": {
      if (!assertion.target || assertion.value === undefined) {
        throw new Error("web_value_equals assertion requires target + value");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      const value = await resolved.locator.inputValue({
        timeout: assertion.timeout_ms,
      });
      if (value !== assertion.value) {
        throw new Error("Value does not equal expected value");
      }
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_value_contains": {
      if (!assertion.target || assertion.value === undefined) {
        throw new Error("web_value_contains assertion requires target + value");
      }
      const resolved = await resolveTarget(
        page,
        assertion.target,
        assertion.timeout_ms,
      );
      const value = await resolved.locator.inputValue({
        timeout: assertion.timeout_ms,
      });
      if (!value.includes(assertion.value)) {
        throw new Error("Value does not contain expected value");
      }
      return {
        match_attempts: resolved.match_attempts,
        resolved: resolved.resolved,
      };
    }
    case "web_url_contains": {
      if (!assertion.url_contains) {
        throw new Error("web_url_contains assertion requires url_contains");
      }
      const url = page.url();
      if (!url.includes(assertion.url_contains)) {
        throw new Error("URL does not contain expected value");
      }
      return { match_attempts: [] };
    }
    case "web_url_equals": {
      if (!assertion.url_equals) {
        throw new Error("web_url_equals assertion requires url_equals");
      }
      const url = page.url();
      if (url !== assertion.url_equals) {
        throw new Error("URL does not equal expected value");
      }
      return { match_attempts: [] };
    }
    case "web_title_contains": {
      if (!assertion.title_contains) {
        throw new Error("web_title_contains assertion requires title_contains");
      }
      const title = await page.title();
      if (!title.includes(assertion.title_contains)) {
        throw new Error("Title does not contain expected value");
      }
      return { match_attempts: [] };
    }
    case "not": {
      if (!assertion.assert) {
        throw new Error("not assertion requires nested assert");
      }
      try {
        await assertSingle(page, assertion.assert);
      } catch {
        return { match_attempts: [] };
      }
      throw new Error("Negated assertion matched");
    }
    default:
      throw new Error(`Unsupported web assertion kind: ${assertion.kind}`);
  }
}

export async function assertAction(
  page: Page,
  params: AssertParams,
): Promise<WebStepTrace> {
  const trace = startTrace(params.run_id, params.step_id);
  try {
    const match_attempts: MatchAttempt[] = [];
    for (const assertion of params.assertions) {
      const result = await assertSingle(page, assertion);
      match_attempts.push(...result.match_attempts);
      if (result.resolved) {
        trace.resolved = result.resolved;
      }
    }
    trace.match_attempts = match_attempts;
    return finishTrace(trace, true);
  } catch (error) {
    return finishTrace(
      trace,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}
