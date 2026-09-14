import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { bindChatGptRelayListener } from "./relay-listener.js";

describe("ChatGPT relay listener", () => {
  it("redirects the localhost OAuth callback to the server URL with secrets in the fragment", async () => {
    const listener = await bindChatGptRelayListener();
    listener.setRelayUrl(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai&expectedOwnerKind=user",
      "codex-state",
    );

    const response = await get(
      "/auth/callback?code=codex-code&state=codex-state",
    );
    await listener.waitForRedirect();
    await listener.close();

    expect(response.statusCode).toBe(303);
    expect(response.location).toBe(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai&expectedOwnerKind=user#code=codex-code&state=codex-state",
    );
    expect(response.connection).toBe("close");
  });

  it("keeps waiting through invalid hosts, states, and callback query shapes", async () => {
    const listener = await bindChatGptRelayListener();
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
      get("/auth/callback?code=codex-code&state=expected-state&extra=1"),
      get(
        "/auth/callback?code=codex-code&state=expected-state&state=expected-state",
      ),
      get("/auth/callback?error=access_denied"),
      get("/auth/callback?error=access_denied&state=wrong"),
      get("/auth/callback?error=access_denied&state=expected-state&extra=1"),
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(redirectSettled).toBe(false);

    const validResponse = await get(
      "/auth/callback?error=access_denied&state=expected-state",
    );
    await waitingForRedirect;
    await listener.close();

    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 400, 400, 400, 400, 400, 400,
    ]);
    expect(validResponse.statusCode).toBe(303);
    expect(validResponse.location).toBe(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai#error=access_denied&state=expected-state",
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
