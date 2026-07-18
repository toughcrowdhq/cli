import { describe, expect, it } from "vitest";
import { decodeAuthIdentity, validateApiKey } from "./identity.js";

const identityResponse = {
  authenticated: true,
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "user",
  },
  impersonation: {
    isImpersonating: false,
    impersonatedBy: null,
  },
  credential: {
    type: "api-key",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Tough Crowd CLI 0.2.0 abcdef12",
    createdAt: "2026-07-18T20:01:00.000Z",
  },
};

describe("API-key identity", () => {
  it("uses the bearer-capable /api/me contract", async () => {
    const calls: Array<{
      url: string;
      authorization: string | null;
    }> = [];

    const identity = await validateApiKey({
      apiOrigin: "https://api.toughcrowd.dev",
      apiKey: "tc_key_secret",
      signal: new AbortController().signal,
      version: "0.2.0",
      fetch(url, init) {
        calls.push({
          url: url.toString(),
          authorization: new Headers(init.headers).get("authorization"),
        });
        return Promise.resolve(
          new Response(JSON.stringify(identityResponse), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    });

    expect(calls).toEqual([
      {
        url: "https://api.toughcrowd.dev/api/me",
        authorization: "Bearer tc_key_secret",
      },
    ]);
    expect(identity).toEqual({
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
      key: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Tough Crowd CLI 0.2.0 abcdef12",
        createdAt: "2026-07-18T20:01:00.000Z",
      },
    });
  });

  it.each([
    ["unauthenticated", { authenticated: false, user: null }],
    [
      "browser credential",
      {
        ...identityResponse,
        credential: { type: "browser-session" },
      },
    ],
    [
      "impersonated identity",
      {
        ...identityResponse,
        impersonation: {
          isImpersonating: true,
          impersonatedBy: "33333333-3333-4333-8333-333333333333",
        },
      },
    ],
  ])("rejects an %s response", (_case, response) => {
    expect(() => decodeAuthIdentity(response)).toThrow();
  });
});
