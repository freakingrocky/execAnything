import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { DesktopClient } from "../src/rpc/desktopClient";

function createFakeProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const fakeProcess = {
    stdin,
    stdout,
    stderr,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
      return fakeProcess;
    },
    emit: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((handler) => handler(...args));
    },
    kill: () => {
      fakeProcess.emit("exit", 0);
    },
  } as unknown as NodeJS.ChildProcessWithoutNullStreams;

  return { fakeProcess, stdin, stdout, stderr };
}

async function readLine(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes("\n")) {
        const [line] = buffer.split("\n");
        resolve(line);
      }
    });
  });
}

describe("DesktopClient", () => {
  it("sends ping and parses response", async () => {
    const { fakeProcess, stdin, stdout } = createFakeProcess();
    const client = new DesktopClient(
      {
        pythonExecutable: "python",
        module: "desktop_runner.server",
        requestTimeoutMs: 1000,
        spawnTimeoutMs: 0,
        pythonPath: ["desktop-runner/src"],
      },
      () => fakeProcess,
    );

    await client.start();
    const pingPromise = client.ping();

    const requestLine = await readLine(stdin);
    const request = JSON.parse(requestLine) as { id: number };
    stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { ok: true, service: "desktop-runner", version: "0.1" },
      }) + "\n",
    );

    const response = await pingPromise;
    expect(response.ok).toBe(true);
    expect(response.service).toBe("desktop-runner");

    await client.stop();
  });

  it("sends resolve and assert requests", async () => {
    const { fakeProcess, stdin, stdout } = createFakeProcess();
    const client = new DesktopClient(
      {
        pythonExecutable: "python",
        module: "desktop_runner.server",
        requestTimeoutMs: 1000,
        spawnTimeoutMs: 0,
        pythonPath: ["desktop-runner/src"],
      },
      () => fakeProcess,
    );

    await client.start();

    const resolvePromise = client.resolveTarget({
      run_id: "run_1",
      step_id: "step_1",
      target: { ladder: [{ kind: "uia", confidence: 1, selector: {} }] },
    });
    const resolveLine = await readLine(stdin);
    const resolveRequest = JSON.parse(resolveLine) as { id: number; method: string };
    stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: resolveRequest.id,
        result: {
          resolved: { rung_index: 0, kind: "uia", element: { name: "Edit" } },
          match_attempts: [],
        },
      }) + "\n",
    );
    const resolveResult = await resolvePromise;
    expect(resolveResult.resolved.kind).toBe("uia");

    const assertPromise = client.assertCheck({
      run_id: "run_1",
      step_id: "step_2",
      assertions: [{ kind: "desktop_element_exists" }],
    });
    const assertLine = await readLine(stdin);
    const assertRequest = JSON.parse(assertLine) as { id: number; method: string };
    stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: assertRequest.id,
        result: { ok: true, failed: [] },
      }) + "\n",
    );
    const assertResult = await assertPromise;
    expect(assertResult.ok).toBe(true);

    await client.stop();
  });
});
