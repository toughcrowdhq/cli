import { describe, expect, it } from "vitest";
import { ApiClientError } from "./errors.js";
import {
  requestJson,
  type FetchLike,
  type TimerCapabilities,
} from "./request.js";

describe("requestJson", () => {
  it("sends an authenticated JSON request to the canonical origin", async () => {
    const fetch = createFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await requestJson({
      origin: "https://api.toughcrowd.dev",
      method: "POST",
      path: "/api/example",
      authorization: "Bearer tc_secret",
      body: { prompt: "Fix the checkout test" },
      idempotencyKey: "idem_123",
      requestId: "req_cli_123",
      fetch,
      timers: immediateTimers,
      metadata: stableMetadata,
      decode: decodeOkResponse,
    });

    expect(response).toEqual({ ok: true });
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe("https://api.toughcrowd.dev/api/example");
    expect(fetch.calls[0].init.method).toBe("POST");
    expect(fetch.calls[0].init.redirect).toBe("manual");
    expect(fetch.calls[0].init.body).toBe(
      JSON.stringify({ prompt: "Fix the checkout test" }),
    );
    expect(readHeaders(fetch.calls[0].init.headers)).toEqual({
      accept: "application/json",
      authorization: "Bearer tc_secret",
      "content-type": "application/json",
      "idempotency-key": "idem_123",
      "user-agent": "@toughcrowd/cli/1.2.3 node/22.14.0 linux/x64",
      "x-request-id": "req_cli_123",
      "x-toughcrowd-client": "@toughcrowd/cli/1.2.3",
      "x-toughcrowd-runtime": "node/22.14.0; linux; x64",
    });
  });

  it("does not send content-type for requests without a body", async () => {
    const fetch = createFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await requestJson({
      method: "GET",
      path: "/api/example",
      authorization: "Bearer tc_secret",
      requestId: "req_cli_123",
      fetch,
      timers: immediateTimers,
      metadata: stableMetadata,
      decode: decodeOkResponse,
    });

    expect(readHeaders(fetch.calls[0].init.headers)).toEqual({
      accept: "application/json",
      authorization: "Bearer tc_secret",
      "user-agent": "@toughcrowd/cli/1.2.3 node/22.14.0 linux/x64",
      "x-request-id": "req_cli_123",
      "x-toughcrowd-client": "@toughcrowd/cli/1.2.3",
      "x-toughcrowd-runtime": "node/22.14.0; linux; x64",
    });
  });

  it("omits authorization for public API operations", async () => {
    const fetch = createFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await requestJson({
      method: "POST",
      path: "/api/cli-authorizations",
      body: { state: "public-request" },
      requestId: "req_cli_public",
      fetch,
      timers: immediateTimers,
      metadata: stableMetadata,
      decode: decodeOkResponse,
    });

    expect(readHeaders(fetch.calls[0].init.headers)).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "@toughcrowd/cli/1.2.3 node/22.14.0 linux/x64",
      "x-request-id": "req_cli_public",
      "x-toughcrowd-client": "@toughcrowd/cli/1.2.3",
      "x-toughcrowd-runtime": "node/22.14.0; linux; x64",
    });
  });

  it.each([
    ["/v1/example"],
    ["https://evil.test/api/example"],
    ["//evil.test/api/example"],
    ["/api/../admin"],
  ])(
    "rejects paths that are not isolated to the API origin: %s",
    async (path) => {
      await expect(
        requestJson({
          method: "GET",
          path,
          authorization: "Bearer tc_secret",
          fetch: createFetch(new Response("{}")),
          timers: immediateTimers,
          decode: decodeOkResponse,
        }),
      ).rejects.toMatchObject({
        kind: "malformed-response",
      });
    },
  );

  it("does not follow redirects that could receive authorization", async () => {
    const fetch = createFetch(
      new Response("", {
        status: 302,
        headers: {
          location: "https://evil.test/api/steal",
          "x-request-id": "req_redirect",
        },
      }),
    );

    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch,
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      status: 302,
      requestId: "req_redirect",
    });

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].init.redirect).toBe("manual");
    expect(fetch.calls[0].url).toBe("https://api.toughcrowd.dev/api/example");
  });

  it("requires JSON content type for successful responses", async () => {
    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(new Response(JSON.stringify({ ok: true }))),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      message: "API response did not use JSON",
    });
  });

  it("requires successful responses to contain valid JSON", async () => {
    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(
          new Response("{", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      message: "API response body was not valid JSON",
    });
  });

  it("requires successful responses to pass the operation decoder", async () => {
    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(
          new Response(JSON.stringify({ nope: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      message: "API response did not match the expected shape",
    });
  });

  it("parses structured API error envelopes without retaining arbitrary bodies", async () => {
    const error = await captureApiClientError(
      requestJson({
        method: "POST",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_prompt",
                message: "Prompt is required",
                fields: [
                  {
                    field: "prompt",
                    message: "Enter a prompt",
                    code: "required",
                  },
                ],
              },
              requestId: "req_body",
              debug: "server-secret",
            }),
            {
              status: 422,
              headers: {
                "content-type": "application/json",
                "x-request-id": "req_header",
              },
            },
          ),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    );

    expect(error).toMatchObject({
      kind: "api",
      status: 422,
      code: "invalid_prompt",
      message: "Prompt is required",
      requestId: "req_body",
      fields: [
        {
          field: "prompt",
          message: "Enter a prompt",
          code: "required",
        },
      ],
    });
    expect(JSON.stringify(error)).not.toContain("server-secret");
    expect(String(error.stack)).not.toContain("server-secret");
  });

  it("parses the supported product error envelope", async () => {
    const error = await captureApiClientError(
      requestJson({
        method: "POST",
        path: "/api/cli-authorizations/exchange",
        fetch: createFetch(
          new Response(
            JSON.stringify({
              error: {
                code: "authorization-denied",
                message: "Authorization code is invalid.",
                requestId: "req_product_api",
                details: [
                  {
                    field: "code",
                    message: "Authorization code is invalid.",
                  },
                ],
              },
            }),
            {
              status: 403,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    );

    expect(error).toMatchObject({
      kind: "api",
      status: 403,
      code: "authorization-denied",
      message: "Authorization code is invalid.",
      requestId: "req_product_api",
      fields: [
        {
          field: "code",
          message: "Authorization code is invalid.",
        },
      ],
    });
  });

  it("maps malformed API error envelopes to malformed-response", async () => {
    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(
          new Response(JSON.stringify({ debug: "secret body" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      message: "API error response did not match the expected shape",
    });
  });

  it("keeps structured API errors even when safe strings are empty", async () => {
    const error = await captureApiClientError(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createFetch(
          new Response(
            JSON.stringify({
              error: {
                code: "",
                message: "",
                fields: [{ field: "prompt", message: "", code: "" }],
              },
              requestId: "req_empty",
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    );

    expect(error).toMatchObject({
      kind: "api",
      status: 400,
      code: "",
      message: "",
      requestId: "req_empty",
      fields: [{ field: "prompt", message: "", code: "" }],
    });
  });

  it("maps network failures without leaking credentials", async () => {
    const error = await captureApiClientError(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        fetch: createRejectingFetch(new Error("socket hung up for tc_secret")),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    );

    expect(error.kind).toBe("network");
    expect(error.message).toBe(
      "API request failed before a response was received",
    );
    expect(error.message).not.toContain("tc_secret");
    expect(String(error)).not.toContain("tc_secret");
  });

  it("maps command cancellation separately from network failure", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        signal: abortController.signal,
        fetch: createRejectingFetch(new DOMException("aborted", "AbortError")),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toMatchObject({
      kind: "canceled",
      message: "API request was canceled",
    });
  });

  it("maps request timeout separately from cancellation", async () => {
    const timers = createManualTimers();
    const promise = requestJson({
      method: "GET",
      path: "/api/example",
      authorization: "Bearer tc_secret",
      timeoutMs: 25,
      fetch: (_url, init) => {
        timers.runNext();
        return Promise.reject(
          init.signal?.aborted === true
            ? new DOMException("aborted", "AbortError")
            : new Error("not aborted"),
        );
      },
      timers,
      decode: decodeOkResponse,
    });

    await expect(promise).rejects.toMatchObject({
      kind: "timeout",
      message: "API request timed out",
    });
  });

  it("rejects invalid timeout options as programmer errors", async () => {
    await expect(
      requestJson({
        method: "GET",
        path: "/api/example",
        authorization: "Bearer tc_secret",
        timeoutMs: 0,
        fetch: createFetch(new Response("{}")),
        timers: immediateTimers,
        decode: decodeOkResponse,
      }),
    ).rejects.toThrow(
      new TypeError("API request timeout must be greater than zero"),
    );
  });
});

const stableMetadata = {
  cliVersion: "1.2.3",
  nodeVersion: "22.14.0",
  platform: "linux",
  arch: "x64",
};

const immediateTimers: TimerCapabilities = {
  setTimeout() {
    return undefined;
  },
  clearTimeout() {},
};

interface OkResponse {
  ok: true;
}

function decodeOkResponse(value: unknown): OkResponse {
  if (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === true
  ) {
    return { ok: true };
  }

  throw new Error("Expected ok response");
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

interface CapturingFetch extends FetchLike {
  calls: FetchCall[];
}

function createFetch(response: Response): CapturingFetch {
  const calls: FetchCall[] = [];
  const fetch: CapturingFetch = (url, init) => {
    calls.push({ url: url.toString(), init });
    return Promise.resolve(response);
  };
  fetch.calls = calls;

  return fetch;
}

function createRejectingFetch(error: Error): CapturingFetch {
  const calls: FetchCall[] = [];
  const fetch: CapturingFetch = (url, init) => {
    calls.push({ url: url.toString(), init });
    return Promise.reject(error);
  };
  fetch.calls = calls;

  return fetch;
}

function readHeaders(headers: RequestInit["headers"]): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

async function captureApiClientError(
  promise: Promise<unknown>,
): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiClientError) return error;
  }

  throw new Error("Expected ApiClientError");
}

function createManualTimers(): TimerCapabilities & { runNext(): void } {
  const callbacks: Array<() => void> = [];

  return {
    setTimeout(callback) {
      callbacks.push(callback);
      return callback;
    },
    clearTimeout(timeoutId) {
      const index = callbacks.indexOf(timeoutId as () => void);
      if (index >= 0) callbacks.splice(index, 1);
    },
    runNext() {
      const callback = callbacks.shift();
      if (callback == null) throw new Error("Expected pending timer");
      callback();
    },
  };
}
