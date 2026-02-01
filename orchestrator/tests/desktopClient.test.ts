import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { DesktopClient } from "../src/rpc/desktopClient";
import { DesktopRpcMethods } from "../src/rpc/contracts";

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

function createLineReader(stream: PassThrough) {
  let buffer = "";
  const queue: ((line: string) => void)[] = [];

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\n") && queue.length > 0) {
      const [line, rest] = buffer.split("\n", 2);
      buffer = rest ?? "";
      const resolve = queue.shift();
      if (resolve) {
        resolve(line);
      }
    }
  });

  return {
    nextLine: () =>
      new Promise<string>((resolve) => {
        if (buffer.includes("\n")) {
          const [line, rest] = buffer.split("\n", 2);
          buffer = rest ?? "";
          resolve(line);
          return;
        }
        queue.push(resolve);
      }),
  };
}

describe("DesktopClient", () => {
  it("sends ping and parses response", async () => {
    const { fakeProcess, stdin, stdout } = createFakeProcess();
    const reader = createLineReader(stdin);
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

    const requestLine = await reader.nextLine();
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
    const reader = createLineReader(stdin);
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
    const resolveLine = await reader.nextLine();
    const resolveRequest = JSON.parse(resolveLine) as {
      id: number;
      jsonrpc: string;
      method: string;
      params: any;
    };

    expect(resolveRequest.jsonrpc).toBe("2.0");
    expect(resolveRequest.method).toBe(DesktopRpcMethods.targetResolve);
    expect(resolveRequest.params.run_id).toBe("run_1");
    expect(resolveRequest.params.step_id).toBe("step_1");
    expect(resolveRequest.params.target?.ladder?.[0]?.kind).toBe("uia");
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
    const assertLine = await reader.nextLine();
    const assertRequest = JSON.parse(assertLine) as {
      id: number;
      jsonrpc: string;
      method: string;
      params: any;
    };
    expect(resolveRequest.id).not.toBe(assertRequest.id);

    expect(assertRequest.jsonrpc).toBe("2.0");
    expect(assertRequest.method).toBe(DesktopRpcMethods.assertCheck);
    expect(assertRequest.params.run_id).toBe("run_1");
    expect(assertRequest.params.step_id).toBe("step_2");
    expect(assertRequest.params.assertions?.[0]?.kind).toBe(
      "desktop_element_exists",
    );
    stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: assertRequest.id,
        result: {
          run_id: "run_1",
          step_id: "step_2",
          started_at: "2024-01-01T00:00:00Z",
          ended_at: "2024-01-01T00:00:01Z",
          ok: true,
          match_attempts: [],
          failed: [],
        },
      }) + "\n",
    );
    const assertResult = await assertPromise;
    expect(assertResult.ok).toBe(true);
    expect(resolveRequest.method).toBe(DesktopRpcMethods.targetResolve);
    expect(assertRequest.method).toBe(DesktopRpcMethods.assertCheck);

    await client.stop();
  });

  it("surfaces JSON-RPC error responses", async () => {
    const { fakeProcess, stdin, stdout } = createFakeProcess();
    const reader = createLineReader(stdin);

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

    const requestLine = await reader.nextLine();
    const request = JSON.parse(requestLine) as { id: number };

    stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: "Method not found" },
      }) + "\n",
    );

    await expect(pingPromise).rejects.toThrow(/Method not found/);
    await client.stop();
  });
});
