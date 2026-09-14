import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { bindChatGptRelayListener } from "./relay-listener.js";

describe("ChatGPT relay listener", () => {
  it("redirects the localhost OAuth callback to the server URL with secrets in the fragment", async () => {
    const listener = await bindChatGptRelayListener();
    listener.setRelayUrl(
      "https://app.toughcrowd.dev/oauth2/callback?provider=openai&expectedOwnerKind=user",
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
});

function get(path: string): Promise<{
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
        headers: { host: "localhost:1455" },
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
