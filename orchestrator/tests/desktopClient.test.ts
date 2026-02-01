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
});
