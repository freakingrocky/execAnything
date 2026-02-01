import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import { resolveTarget } from "../src/selector/resolve";
import { WebTarget } from "../src/types";
import { fixtureUrl } from "./_helpers/fixture";

describe("resolveTarget", () => {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    await page.goto(fixtureUrl(import.meta.url, "fixtures", "selector.html"));
  });

  afterEach(async () => {
    await context?.close();
    await browser?.close();
    context = undefined;
    browser = undefined;
    page = undefined;
  });

  it("resolves the first unique rung and records ambiguous fallbacks", async () => {
    const target: WebTarget = {
      ladder: [
        {
          kind: "web_css",
          confidence: 0.9,
          selector: { css: "#submit-btn" },
        },
        {
          kind: "web_css",
          confidence: 0.1,
          selector: { css: "button" },
        },
      ],
    };

    const result = await resolveTarget(page, target, undefined, {
      recordAllAttempts: true,
    });
    expect(result.resolved.kind).toBe("web_css");
    expect(result.resolved.selector).toEqual({ css: "#submit-btn" });
    expect(result.match_attempts[0].matched_count).toBe(1);
    expect(result.match_attempts[1].matched_count).toBeGreaterThan(1);
  });

  it("throws when no rung is unique", async () => {
    const target: WebTarget = {
      ladder: [
        {
          kind: "web_css",
          confidence: 0.5,
          selector: { css: "button" },
        },
        {
          kind: "web_css",
          confidence: 0.2,
          selector: { css: ".does-not-exist" },
        },
      ],
    };

    await expect(resolveTarget(page, target)).rejects.toThrow(
      "No web selector rung resolved to a unique element",
    );
  });
});
