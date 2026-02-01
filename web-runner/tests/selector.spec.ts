import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import { resolveTarget } from "../src/selector/resolve";
import { WebTarget } from "../src/types";

describe("resolveTarget", () => {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    const __filename = new URL(import.meta.url).pathname;
    const __dirname = path.dirname(__filename);
    const fixturePath = path.join(__dirname, "fixtures", "selector.html");
    await page.goto(pathToFileURL(fixturePath).toString());
  });

  afterEach(async () => {
    await context?.close();
    await browser?.close();
    context = undefined;
    browser = undefined;
    page = undefined;
  });

  it("resolves the first unique rung", async () => {
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

    const result = await resolveTarget(page, target);
    expect(result.resolved.kind).toBe("web_css");
    expect(result.resolved.selector).toEqual({ css: "#submit-btn" });
    expect(result.match_attempts[0].matched_count).toBe(1);
  });
});
