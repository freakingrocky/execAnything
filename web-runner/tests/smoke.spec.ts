import path from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebRunner, WebTarget } from "../src";

describe("web-runner smoke", () => {
  let runner: WebRunner;
  const appUrl = pathToFileURL(
    path.join(__dirname, "..", "test-app", "index.html"),
  ).toString();

  beforeEach(async () => {
    runner = new WebRunner({ headless: true });
    await runner.start();
  });

  afterEach(async () => {
    await runner.stop();
  });

  it("runs a basic flow against the test app", async () => {
    const navTrace = await runner.navigate({
      run_id: "run-1",
      step_id: "nav",
      url: appUrl,
    });
    expect(navTrace.ok).toBe(true);

    const nameTarget: WebTarget = {
      ladder: [
        {
          kind: "web_label",
          confidence: 1,
          selector: { text: "Name" },
        },
      ],
    };

    const selectTarget: WebTarget = {
      ladder: [
        {
          kind: "web_css",
          confidence: 0.9,
          selector: { css: "#choice-select" },
        },
      ],
    };

    const buttonTarget: WebTarget = {
      ladder: [
        {
          kind: "web_role",
          confidence: 1,
          selector: { role: "button", name: "Submit" },
        },
      ],
    };

    const fillTrace = await runner.fill({
      run_id: "run-1",
      step_id: "fill",
      target: nameTarget,
      value: "Ada",
    });
    expect(fillTrace.ok).toBe(true);

    const selectTrace = await runner.select({
      run_id: "run-1",
      step_id: "select",
      target: selectTarget,
      value: "beta",
    });
    expect(selectTrace.ok).toBe(true);

    const clickTrace = await runner.click({
      run_id: "run-1",
      step_id: "click",
      target: buttonTarget,
    });
    expect(clickTrace.ok).toBe(true);

    const assertTrace = await runner.assertCheck({
      run_id: "run-1",
      step_id: "assert",
      assertions: [
        { kind: "web_title_contains", title_contains: "Web Runner" },
        { kind: "web_url_contains", url_contains: "index.html" },
      ],
    });
    expect(assertTrace.ok).toBe(true);

    const resultTrace = await runner.extract({
      run_id: "run-1",
      step_id: "extract",
      target: {
        ladder: [
          {
            kind: "web_css",
            confidence: 1,
            selector: { css: "#result" },
          },
        ],
      },
    });
    expect(resultTrace.ok).toBe(true);
    expect(resultTrace.value).toContain("Ada");
  });
});
