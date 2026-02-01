import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args";
import { loadConfig } from "../src/config/defaults";

describe("cli args", () => {
  it("parses workflow, inputs, and out flags", () => {
    const args = parseArgs(["--workflow", "workflow.json", "--inputs", "inputs.json", "--out", "out"]);
    expect(args.workflow).toBe("workflow.json");
    expect(args.inputs).toBe("inputs.json");
    expect(args.out).toBe("out");
  });

  it("loads config overrides from file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-config-"));
    const configPath = path.join(tempDir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        desktopRunner: { pythonExecutable: "py", requestTimeoutMs: 5000 },
        runtime: { defaultTimeoutMs: 20000 },
      }),
    );

    const config = loadConfig(configPath);
    expect(config.desktopRunner.pythonExecutable).toBe("py");
    expect(config.desktopRunner.requestTimeoutMs).toBe(5000);
    expect(config.runtime.defaultTimeoutMs).toBe(20000);
  });
});
