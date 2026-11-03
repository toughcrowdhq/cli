import type { RelayTelemetryEvent as RelayEvent } from "../telemetry-context.js";
import { createServer, type Server } from "node:http";

const relayHost = "127.0.0.1";
const relayPort = 1455;
const callbackPath = "/auth/callback";

export type ChatGptRelayListener = {
  callbackUrl: string;
  setRelayUrl(url: string, state: string): void;
  waitForRedirect(): Promise<void>;
  close(): Promise<void>;
};

export type { RelayTelemetryEvent as RelayEvent } from "../telemetry-context.js";

type RelayListenerOptions = {
  onEvent?: (event: RelayEvent) => void;
  onInvalidCallback?: (message: string) => void;
};

export type ChatGptRelayListenerFactory = (
  options?: RelayListenerOptions,
) => Promise<ChatGptRelayListener>;

export async function bindChatGptRelayListener(
  options: RelayListenerOptions = {},
): Promise<ChatGptRelayListener> {
  let relayUrl: URL | undefined;
  let expectedState: string | undefined;
  let resolveRedirect!: () => void;
  const redirected = new Promise<void>((resolve) => {
    resolveRedirect = resolve;
  });

  const server = createServer((request, response) => {
    if (
      request.method !== "GET" ||
      request.headers.host !== `localhost:${relayPort}` ||
      !request.url
    ) {
      options.onEvent?.({
        event: "request_rejected",
        reason: "invalid_request",
      });
      response.writeHead(404).end();
      return;
    }

    let callbackUrl: URL;
    try {
      callbackUrl = new URL(request.url, `http://localhost:${relayPort}`);
    } catch {
      options.onEvent?.({ event: "request_rejected", reason: "invalid_url" });
      response.writeHead(400).end("Invalid callback URL.");
      return;
    }

    if (callbackUrl.pathname !== callbackPath) {
      options.onEvent?.({
        event: "request_rejected",
        reason: "invalid_request",
      });
      response.writeHead(404).end();
      return;
    }
    if (!relayUrl || !expectedState) {
      options.onEvent?.({ event: "request_rejected", reason: "not_ready" });
      response.writeHead(503).end("The Tough Crowd relay is not ready yet.");
      return;
    }

    const callbackParams = callbackUrl.searchParams;
    if (!isValidCallback(callbackUrl, expectedState)) {
      const message =
        "The authorization callback is invalid or does not match this relay. Return to Tough Crowd and restart ChatGPT authorization.";
      options.onInvalidCallback?.(message);
      options.onEvent?.({
        event: "request_rejected",
        reason: "invalid_callback",
      });
      response.writeHead(400).end(message);
      return;
    }

    const destination = new URL(relayUrl);
    const forwarded = new URLSearchParams();
    for (const key of ["code", "state", "error", "error_description"]) {
      const value = callbackParams.get(key);
      if (value !== null) forwarded.set(key, value);
    }
    destination.hash = forwarded.toString();
    response.writeHead(303, {
      location: destination.toString(),
      "cache-control": "no-store",
      connection: "close",
    });
    response.once("finish", () => {
      options.onEvent?.({ event: "redirect_sent" });
      resolveRedirect();
    });
    response.once("close", () => {
      if (!response.writableFinished) {
        options.onEvent?.({
          event: "request_rejected",
          reason: "redirect_failed",
        });
      }
    });
    response.end();
  });

  await listen(server);

  return {
    callbackUrl: `http://localhost:${relayPort}${callbackPath}`,
    setRelayUrl(value, state) {
      const validatedRelayUrl = validateRelayUrl(value);
      const validatedState = validateState(state);
      relayUrl = validatedRelayUrl;
      expectedState = validatedState;
    },
    waitForRedirect: () => redirected,
    close: () => closeServer(server),
  };
}

function isValidCallback(url: URL, expectedState: string): boolean {
  if (url.hash !== "") return false;
  const params = url.searchParams;
  if (
    params.getAll("state").length !== 1 ||
    params.get("state") !== expectedState
  ) {
    return false;
  }

  // Provider metadata may evolve; only validate the fields that control the result.
  const codes = params.getAll("code");
  const errors = params.getAll("error");
  return (
    (codes.length === 1 && Boolean(codes[0]) && errors.length === 0) ||
    (errors.length === 1 && Boolean(errors[0]) && codes.length === 0)
  );
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(relayPort, relayHost);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, closeReject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? closeReject(error) : resolve()));
    server.closeAllConnections();
  });
}

function validateRelayUrl(value: string): URL {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("The server returned an invalid browser relay URL.");
  }
  return url;
}

function validateState(value: string): string {
  if (!value) throw new Error("The server returned an invalid OAuth state.");
  return value;
}
