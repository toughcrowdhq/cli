import { describe, expect, it } from "vitest";
import { ApiClientError } from "../api/errors.js";
import type { FetchLike } from "../api/request.js";
import {
  decodeExchangedCliAuthorization,
  decodeStartedCliAuthorization,
  exchangeCliAuthorization,
  startCliAuthorization,
} from "./authorization.js";

const state = "sssssssssssssssssssssssssssssssssssssssssss";
const codeChallenge = "ccccccccccccccccccccccccccccccccccccccccccc";
const codeVerifier = "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv";
const authorizationCode =
  "tc_cli_code_abcdefghijklmnopqrstuv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const apiKey =
  "tc_key_abcdefghijklmnopqrstuv_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

describe("CLI authorization API operations", () => {
  it("starts authorization through the configured API without a bearer credential", async () => {
    const fetch = createFetch(() =>
      jsonResponse(
        {
          authorizationUrl:
            "https://app.toughcrowd.com/cli/authorize#request=tc_cli_request_value",
          expiresAt: "2026-07-18T20:10:00.000Z",
        },
        201,
      ),
    );

    const result = await startCliAuthorization({
      apiOrigin: "https://api.toughcrowd.com",
      callbackUri: "http://127.0.0.1:49152/callback",
      codeChallenge,
      state,
      clientName: "Tough Crowd CLI 0.2.0",
      version: "0.2.0",
      signal: new AbortController().signal,
      fetch,
    });

    expect(result).toEqual({
      authorizationUrl:
        "https://app.toughcrowd.com/cli/authorize#request=tc_cli_request_value",
      expiresAt: "2026-07-18T20:10:00.000Z",
    });
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(
      "https://api.toughcrowd.com/api/cli-authorizations",
    );
    expect(fetch.calls[0].method).toBe("POST");
    expect(fetch.calls[0].authorization).toBeNull();
    expect(fetch.calls[0].body).toBe(
      JSON.stringify({
        callbackUri: "http://127.0.0.1:49152/callback",
        codeChallenge: "ccccccccccccccccccccccccccccccccccccccccccc",
        codeChallengeMethod: "S256",
        state: "sssssssssssssssssssssssssssssssssssssssssss",
        clientName: "Tough Crowd CLI 0.2.0",
      }),
    );
  });

  it("exchanges the code and verifier without exposing them in the decoded result", async () => {
    const fetch = createFetch(() =>
      jsonResponse({
        key: apiKey,
        apiKey: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Tough Crowd CLI 0.2.0 abcdef12",
          createdAt: "2026-07-18T20:01:00.000Z",
        },
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Ada Lovelace",
          email: "ada@example.com",
        },
      }),
    );

    const result = await exchangeCliAuthorization({
      apiOrigin: "https://api.toughcrowd.com",
      code: authorizationCode,
      codeVerifier,
      version: "0.2.0",
      signal: new AbortController().signal,
      fetch,
    });

    expect(result).toEqual({
      apiKey,
      key: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Tough Crowd CLI 0.2.0 abcdef12",
        createdAt: "2026-07-18T20:01:00.000Z",
      },
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    });
    expect(fetch.calls[0].url).toBe(
      "https://api.toughcrowd.com/api/cli-authorizations/exchange",
    );
    expect(fetch.calls[0].authorization).toBeNull();
    expect(fetch.calls[0].body).toBe(
      JSON.stringify({ code: authorizationCode, codeVerifier }),
    );
    expect(JSON.stringify(result)).not.toContain(authorizationCode);
    expect(JSON.stringify(result)).not.toContain(codeVerifier);
  });

  it.each([
    [
      "credential-bearing URL",
      {
        authorizationUrl:
          "https://user:secret@app.toughcrowd.com/cli/authorize",
        expiresAt: "2026-07-18T20:10:00.000Z",
      },
    ],
    [
      "insecure remote URL",
      {
        authorizationUrl: "http://app.toughcrowd.com/cli/authorize",
        expiresAt: "2026-07-18T20:10:00.000Z",
      },
    ],
    [
      "invalid expiration",
      {
        authorizationUrl: "https://app.toughcrowd.com/cli/authorize",
        expiresAt: "tomorrow",
      },
    ],
  ])("rejects a start response with an %s", (_case, response) => {
    expect(() => decodeStartedCliAuthorization(response)).toThrow(
      "authorization response is invalid",
    );
  });

  it("rejects an exchange response with malformed secret or metadata", () => {
    expect(() =>
      decodeExchangedCliAuthorization({
        key: "tc_key_not-valid",
        apiKey: {
          id: "not-a-uuid",
          name: "Tough Crowd CLI 0.2.0 abcdef12",
          createdAt: "2026-07-18T20:01:00.000Z",
        },
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Ada Lovelace",
          email: "ada@example.com",
        },
      }),
    ).toThrow("authorization exchange response is invalid");
  });

  it("does not retain authorization secrets from an API error", async () => {
    const fetch = createFetch(() =>
      jsonResponse(
        {
          error: {
            code: "authorization-denied",
            message: "Authorization code is invalid.",
            requestId: "req_exchange",
          },
          debug: { authorizationCode, codeVerifier },
        },
        403,
      ),
    );

    const error = await captureApiClientError(
      exchangeCliAuthorization({
        apiOrigin: "https://api.toughcrowd.com",
        code: authorizationCode,
        codeVerifier,
        version: "0.2.0",
        signal: new AbortController().signal,
        fetch,
      }),
    );

    expect(error).toMatchObject({
      kind: "api",
      code: "authorization-denied",
      message: "Authorization code is invalid.",
      requestId: "req_exchange",
    });
    expect(JSON.stringify(error)).not.toContain(authorizationCode);
    expect(JSON.stringify(error)).not.toContain(codeVerifier);
    expect(String(error.stack)).not.toContain(authorizationCode);
    expect(String(error.stack)).not.toContain(codeVerifier);
  });
});

interface CapturedRequest {
  url: string;
  method: string | undefined;
  authorization: string | null;
  body: BodyInit | null | undefined;
}

interface TestFetch extends FetchLike {
  calls: CapturedRequest[];
}

function createFetch(responder: () => Response): TestFetch {
  const implementation = ((url: URL, init: RequestInit) => {
    implementation.calls.push({
      url: url.toString(),
      method: init.method,
      authorization: new Headers(init.headers).get("authorization"),
      body: init.body,
    });
    return Promise.resolve(responder());
  }) as TestFetch;
  implementation.calls = [];
  return implementation;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function captureApiClientError(
  promise: Promise<unknown>,
): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiClientError) return error;
    throw error;
  }

  throw new Error("Expected API request to fail");
}
