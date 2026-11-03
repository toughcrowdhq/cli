import { request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { bindChatGptRelayListener } from "./relay-listener.js";

describe("ChatGPT relay listener", () => {
  it("reports requests arriving before readiness and requests to an unsupported path", async () => {
    const onEvent = vi.fn();
    const listener = await bindChatGptRelayListener({ onEvent });
    try {
      expect(
        (await get("/auth/callback?code=private-code&state=private-state"))
          .statusCode,
      ).toBe(503);
      expect((await get("/other")).statusCode).toBe(404);
      expect(onEvent.mock.calls).toEqual([
        [{ event: "request_rejected", reason: "not_ready" }],
        [{ event: "request_rejected", reason: "invalid_request" }],
      ]);
    } finally {
      await listener.close();
    }
  });

  it.each([
    "",
    "&scope=openid+profile+email+offline_access",
    "&extra=1&extra=2&scope=openid&scope=email",
  ])(
    "redirects the localhost OAuth callback with additional provider parameters (%s) and secrets in the fragment",
    async (scope) => {
      const onEvent = vi.fn();
      const listener = await bindChatGptRelayListener({ onEvent });
      listener.setRelayUrl(
        "https://app.toughcrowd.dev/oauth2/callback?provider=openai&expectedOwnerKind=user",
        "codex-state",
      );

      const response = await get(
        `/auth/callback?code=codex-code&state=codex-state${scope}`,
      );
      await listener.waitForRedirect();
      await listener.close();

      expect(response.statusCode).toBe(303);
      expect(response.location).toBe(
        `https://app.toughcrowd.dev/oauth2/callback?provider=openai&expectedOwnerKind=user#code=codex-code&state=codex-state`,
      );
      expect(response.connection).toBe("close");
      expect(onEvent.mock.calls).toEqual([[{ event: "redirect_sent" }]]);
    },
  );

  it("keeps waiting through invalid hosts, states, and callback query shapes", async () => {
    const onInvalidCallback = vi.fn();
    const onEvent = vi.fn();
    const listener = await bindChatGptRelayListener({
      onInvalidCallback,
      onEvent,
    });
    listener.setRelayUrl(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai",
      "expected-state",
    );
    let redirectSettled = false;
    const waitingForRedirect = listener.waitForRedirect().then(() => {
      redirectSettled = true;
    });

    const responses = await Promise.all([
      get(
        "/auth/callback?code=codex-code&state=expected-state",
        "127.0.0.1:1455",
      ),
      get("/auth/callback?code=codex-code&state=wrong"),
      get("/auth/callback?code=codex-code&state=expected-state&code=other"),
      get(
        "/auth/callback?code=codex-code&state=expected-state&state=expected-state",
      ),
      get(
        "/auth/callback?code=codex-code&state=expected-state&error=access_denied",
      ),
      get("/auth/callback?error=access_denied"),
      get("/auth/callback?error=access_denied&state=wrong"),
      get(
        "/auth/callback?error=access_denied&state=expected-state&error=other",
      ),
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(redirectSettled).toBe(false);

    const validResponse = await get(
      "/auth/callback?error=access_denied&state=expected-state&error_description=User+cancelled&future=value",
    );
    await waitingForRedirect;
    await listener.close();

    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 400, 400, 400, 400, 400, 400, 400,
    ]);
    expect(onInvalidCallback).toHaveBeenCalledTimes(7);
    expect(onInvalidCallback).toHaveBeenCalledWith(
      "The authorization callback is invalid or does not match this relay. Return to Tough Crowd and restart ChatGPT authorization.",
    );
    expect(onEvent.mock.calls).toEqual([
      [{ event: "request_rejected", reason: "invalid_request" }],
      ...Array.from({ length: 7 }, () => [
        { event: "request_rejected", reason: "invalid_callback" },
      ]),
      [{ event: "redirect_sent" }],
    ]);
    expect(validResponse.statusCode).toBe(303);
    expect(validResponse.location).toBe(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai#state=expected-state&error=access_denied&error_description=User+cancelled",
    );
  });
});

function get(
  path: string,
  host = "localhost:1455",
): Promise<{
  statusCode: number;
  location?: string;
  connection?: string;
}> {
  return new Promise((resolve, reject) => {
    const pending = request(
      {
        host: "127.0.0.1",
        port: 1455,
        path,
        method: "GET",
        agent: false,
        headers: { host },
      },
      (response) => {
        response.resume();
        response.once("end", () =>
          resolve({
            statusCode: response.statusCode ?? 0,
            ...(response.headers.location
              ? { location: response.headers.location }
              : {}),
            ...(response.headers.connection
              ? { connection: response.headers.connection }
              : {}),
          }),
        );
      },
    );
    pending.once("error", reject);
    pending.end();
  });
}
