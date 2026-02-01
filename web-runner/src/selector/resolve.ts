import { Locator, Page, FrameLocator } from "playwright";
import {
  MatchAttempt,
  ResolvedElement,
  WebTarget,
  WebTargetRung,
  WebTargetScope,
} from "../types";

export interface ResolveResult {
  locator: Locator;
  resolved: ResolvedElement;
  match_attempts: MatchAttempt[];
}

function scopedLocatorRoot(
  page: Page,
  scope?: WebTargetScope,
): Page | FrameLocator {
  if (scope?.frame) {
    return page.frameLocator(scope.frame);
  }
  return page;
}

function buildLocator(root: Page | FrameLocator, rung: WebTargetRung): Locator {
  switch (rung.kind) {
    case "web_role": {
      const selector = rung.selector as { role: string; name: string; exact?: boolean };
      return root.getByRole(selector.role as never, {
        name: selector.name,
        exact: selector.exact,
      });
    }
    case "web_label": {
      const selector = rung.selector as { text: string; exact?: boolean };
      return root.getByLabel(selector.text, { exact: selector.exact });
    }
    case "web_css": {
      const selector = rung.selector as { css: string };
      return root.locator(selector.css);
    }
    case "web_text": {
      const selector = rung.selector as {
        text: string;
        exact?: boolean;
        within_css?: string;
      };
      if (selector.within_css) {
        return root.locator(selector.within_css).getByText(selector.text, {
          exact: selector.exact,
        });
      }
      return root.getByText(selector.text, { exact: selector.exact });
    }
    case "web_xpath": {
      const selector = rung.selector as { xpath: string };
      return root.locator(`xpath=${selector.xpath}`);
    }
    default:
      throw new Error(`Unsupported web selector kind: ${rung.kind}`);
  }
}

export async function resolveTarget(
  page: Page,
  target: WebTarget,
  timeoutMs?: number,
): Promise<ResolveResult> {
  const scope = target.scope;
  if (scope?.url_contains && !page.url().includes(scope.url_contains)) {
    throw new Error(`URL does not match scope: ${scope.url_contains}`);
  }
  if (scope?.title_contains) {
    const title = await page.title();
    if (!title.includes(scope.title_contains)) {
      throw new Error(`Title does not match scope: ${scope.title_contains}`);
    }
  }
  const root = scopedLocatorRoot(page, scope);
  const match_attempts: MatchAttempt[] = [];

  for (let index = 0; index < target.ladder.length; index += 1) {
    const rung = target.ladder[index];
    const started = Date.now();
    try {
      const locator = buildLocator(root, rung);
      if (timeoutMs !== undefined) {
        await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
      }
      const matched_count = await locator.count();
      const duration_ms = Date.now() - started;
      const ok = matched_count === 1;
      match_attempts.push({
        rung_index: index,
        kind: rung.kind,
        matched_count,
        duration_ms,
        ok,
      });
      if (ok) {
        return {
          locator,
          resolved: {
            rung_index: index,
            kind: rung.kind,
            selector: rung.selector,
          },
          match_attempts,
        };
      }
    } catch (error) {
      const duration_ms = Date.now() - started;
      match_attempts.push({
        rung_index: index,
        kind: rung.kind,
        matched_count: 0,
        duration_ms,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error("No web selector rung resolved to a unique element");
}
