import { createServer, request } from "node:http";
import { describe, expect, it } from "vitest";
import {
  bindLoopbackListener,
  LoopbackAuthorizationError,
} from "./loopback.js";

const state = "sssssssssssssssssssssssssssssssssssssssssss";
const code =
  "tc_cli_code_abcdefghijklmnopqrstuv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

describe("IPv4 loopback authorization listener", () => {
  it("binds an operating-system-assigned port and accepts one safe callback", async () => {
    const listener = await bindLoopbackListener({
      state,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
    });
    const callbackUrl = new URL(listener.callbackUri);
    const port = Number(callbackUrl.port);

    expect(callbackUrl.hostname).toBe("127.0.0.1");
    expect(port).toBeGreaterThan(0);
    expect(callbackUrl.pathname).toBe("/callback");

    const response = await fetch(
      `${listener.callbackUri}?code=${code}&state=${state}`,
    );
    const body = await response.text();

    await expect(listener.waitForCallback()).resolves.toEqual({
      kind: "approved",
      code,
    });
    expect(response.status).toBe(200);
    expect(body).toBe(
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Tough Crowd CLI</title><body><p>Authorization received. You can return to the terminal.</p></body></html>',
    );
    expect(body).not.toContain(code);
    expect(body).not.toContain(state);
    await expectPortCanBeRebound(port);
  });

  it("keeps waiting through wrong method, path, host, state, and query shape", async () => {
    const listener = await bindLoopbackListener({
      state,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
    });
    const port = Number(new URL(listener.callbackUri).port);

    const rejected = await Promise.all([
      fetch(`${listener.callbackUri}?code=${code}&state=${state}`, {
        method: "POST",
      }),
      fetch(`http://127.0.0.1:${port}/wrong?code=${code}&state=${state}`),
      requestWithHost(port, "attacker.example"),
      fetch(`${listener.callbackUri}?code=${code}&state=wrong`),
      fetch(`${listener.callbackUri}?code=${code}&state=${state}&extra=1`),
      fetch(
        `${listener.callbackUri}?code=${code}&state=${state}&state=${state}`,
      ),
    ]);

    expect(rejected.map((response) => response.status)).toEqual([
      404, 404, 404, 404, 404, 404,
    ]);

    const deniedResponse = await fetch(
      `${listener.callbackUri}?error=access_denied&state=${state}`,
    );

    await expect(listener.waitForCallback()).resolves.toEqual({
      kind: "denied",
    });
    expect(deniedResponse.status).toBe(200);
    expect(await deniedResponse.text()).not.toContain(state);
    await expectPortCanBeRebound(port);
  });

  it("exposes one completion to repeated waiters", async () => {
    const listener = await bindLoopbackListener({
      state,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
    });
    const port = Number(new URL(listener.callbackUri).port);

    const firstWaiter = listener.waitForCallback();
    const secondWaiter = listener.waitForCallback();
    const response = await fetch(
      `${listener.callbackUri}?code=one-time-code&state=${state}`,
    );

    await expect(Promise.all([firstWaiter, secondWaiter])).resolves.toEqual([
      { kind: "approved", code: "one-time-code" },
      { kind: "approved", code: "one-time-code" },
    ]);
    expect(response.status).toBe(200);
    await expectPortCanBeRebound(port);
  });

  it("aborts, closes idempotently, and releases the port", async () => {
    const abortController = new AbortController();
    const listener = await bindLoopbackListener({
      state,
      signal: abortController.signal,
      timeoutMs: 5_000,
    });
    const port = Number(new URL(listener.callbackUri).port);

    abortController.abort();

    await expect(listener.waitForCallback()).rejects.toMatchObject({
      name: "LoopbackAuthorizationError",
      kind: "canceled",
      message: "CLI authorization was canceled.",
    } satisfies Partial<LoopbackAuthorizationError>);
    await expect(listener.close()).resolves.toBeUndefined();
    await listener.close();
    await expectPortCanBeRebound(port);
  });

  it("closes safely before callback waiting begins", async () => {
    const listener = await bindLoopbackListener({
      state,
      signal: new AbortController().signal,
      timeoutMs: 5_000,
    });
    const port = Number(new URL(listener.callbackUri).port);

    await expect(listener.close()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    await expectPortCanBeRebound(port);
  });

  it("times out and releases the port", async () => {
    const listener = await bindLoopbackListener({
      state,
      signal: new AbortController().signal,
      timeoutMs: 20,
    });
    const port = Number(new URL(listener.callbackUri).port);

    await expect(listener.waitForCallback()).rejects.toMatchObject({
      name: "LoopbackAuthorizationError",
      kind: "timeout",
      message: "CLI authorization timed out.",
    } satisfies Partial<LoopbackAuthorizationError>);
    await expectPortCanBeRebound(port);
  });
});

function requestWithHost(port: number, host: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/callback?code=${code}&state=${state}`,
        headers: { host },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers: incoming.headers as HeadersInit,
            }),
          );
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function expectPortCanBeRebound(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}
