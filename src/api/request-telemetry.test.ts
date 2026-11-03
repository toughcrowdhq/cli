import { describe, expect, it } from "vitest";
import { diagnosticContext } from "../telemetry-context.js";
import { createTelemetry } from "../telemetry.js";
import { requestJson } from "./request.js";

type Event = {
  event: string;
  invocationId: string;
  durationMs?: number;
  reason?: string;
  api?: {
    cliRequestId: string;
    requestId?: string;
    status?: number;
    route: string;
  };
};

function capture(env: NodeJS.ProcessEnv = {}) {
  const events: Event[] = [];
  const reporter = createTelemetry({
    version: "0.8.0",
    env,
    fetch: (_url, init) => {
      events.push(
        ...(JSON.parse(init.body as string) as { entries: Event[] }).entries,
      );
      return Promise.resolve(new Response(null, { status: 202 }));
    },
  });
  const context = {
    reportRequestEvent: (
      event: Parameters<NonNullable<typeof reporter>["request"]>[0],
    ) => reporter?.request(event, {}),
  };
  reporter?.start("session list", context);
  return { events, reporter, context };
}

describe("request correlation telemetry", () => {
  it("joins concurrent calls to one invocation and keeps their client and server IDs distinct", async () => {
    const f = capture();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    await diagnosticContext.run(f.context, async () => {
      const first = requestJson({
        path: "/api/sessions?repo=secret-repo",
        method: "GET",
        decode: () => true,
        fetch: async () => {
          await blocked;
          return Response.json(
            {},
            { headers: { "x-request-id": "server-first" } },
          );
        },
      });
      await requestJson({
        path: "/api/me",
        method: "GET",
        decode: () => true,
        fetch: () =>
          Promise.resolve(
            Response.json({}, { headers: { "x-request-id": "server-second" } }),
          ),
      });
      release();
      await first;
    });
    await f.reporter?.finish(0, undefined, false, f.context);
    expect(f.events.map((event) => event.event)).toEqual([
      "cli.command.started",
      "cli.request.started",
      "cli.request.started",
      "cli.request.response",
      "cli.request.response",
      "cli.command.finished",
    ]);
    expect(new Set(f.events.map((event) => event.invocationId)).size).toBe(1);
    const firstId = f.events[1].api!.cliRequestId;
    const secondId = f.events[2].api!.cliRequestId;
    expect(firstId).not.toBe(secondId);
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.events[3].api).toEqual({
      cliRequestId: secondId,
      requestId: "server-second",
      status: 200,
      method: "GET",
      route: "/api/me",
    });
    expect(f.events[4].api).toEqual({
      cliRequestId: firstId,
      requestId: "server-first",
      status: 200,
      method: "GET",
      route: "/api/sessions",
    });
    expect(f.events[4].durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(f.events)).not.toContain("secret-repo");
  });

  it.each([200, 503])(
    "captures response IDs before decoding a malformed %s body",
    async (status) => {
      const f = capture();
      await expect(
        diagnosticContext.run(f.context, () =>
          requestJson({
            path: "/api/me",
            method: "GET",
            decode: () => true,
            fetch: () =>
              Promise.resolve(
                new Response("body-secret", {
                  status,
                  headers: { "x-request-id": "server-response" },
                }),
              ),
          }),
        ),
      ).rejects.toMatchObject({
        kind: "malformed-response",
        requestId: "server-response",
      });
      await f.reporter?.finish(1, undefined, false, f.context);
      expect(f.events[2]).toMatchObject({
        event: "cli.request.response",
        api: { requestId: "server-response", status },
      });
      expect(
        f.events.filter((event) => event.event === "cli.request.failed"),
      ).toHaveLength(0);
      expect(JSON.stringify(f.events)).not.toContain("body-secret");
    },
  );

  it.each(["network", "timeout", "canceled"] as const)(
    "keeps %s failures correlated without inventing a server ID",
    async (reason) => {
      const f = capture();
      const controller = new AbortController();
      if (reason === "canceled") controller.abort();
      await expect(
        diagnosticContext.run(f.context, () =>
          requestJson({
            path: "/api/me",
            method: "GET",
            decode: () => true,
            signal: controller.signal,
            ...(reason === "timeout"
              ? {
                  timers: {
                    setTimeout: (callback: () => void) => {
                      callback();
                      return 1;
                    },
                    clearTimeout: () => {},
                  },
                }
              : {}),
            fetch: () => Promise.reject(new TypeError("network-secret")),
          }),
        ),
      ).rejects.toMatchObject({
        kind: reason,
        requestId: undefined,
        cliRequestId: expect.any(String) as unknown,
      });
      await f.reporter?.finish(1, undefined, false, f.context);
      expect(f.events[2]).toMatchObject({
        event: "cli.request.failed",
        reason,
        api: { cliRequestId: f.events[1].api!.cliRequestId },
      });
      expect(f.events[2].api).not.toHaveProperty("requestId");
      expect(JSON.stringify(f.events)).not.toContain("network-secret");
    },
  );

  it("omits unsafe server IDs and emits no telemetry when opted out", async () => {
    for (const env of [{}, { DO_NOT_TRACK: "1" }]) {
      const f = capture(env);
      await diagnosticContext.run(f.context, () =>
        requestJson({
          path: "/api/me",
          method: "GET",
          decode: () => true,
          fetch: () =>
            Promise.resolve(
              Response.json(
                {},
                { headers: { "x-request-id": "unsafe secret" } },
              ),
            ),
        }),
      );
      await f.reporter?.finish(0, undefined, false, f.context);
      expect(f.events).toHaveLength("DO_NOT_TRACK" in env ? 0 : 4);
      expect(JSON.stringify(f.events)).not.toContain("unsafe secret");
    }
  });
});
