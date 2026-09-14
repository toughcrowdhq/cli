import { createServer, type Server } from "node:http";

const relayHost = "127.0.0.1";
const relayPort = 1455;
const callbackPath = "/auth/callback";

export type ChatGptRelayListener = {
  callbackUrl: string;
  setRelayUrl(url: string): void;
  waitForRedirect(): Promise<void>;
  close(): Promise<void>;
};

export type ChatGptRelayListenerFactory = () => Promise<ChatGptRelayListener>;

export async function bindChatGptRelayListener(): Promise<ChatGptRelayListener> {
  let relayUrl: URL | undefined;
  let resolveRedirect!: () => void;
  const redirected = new Promise<void>((resolve) => {
    resolveRedirect = resolve;
  });

  const server = createServer((request, response) => {
    if (request.method !== "GET" || !request.url) {
      response.writeHead(404).end();
      return;
    }

    let callbackUrl: URL;
    try {
      callbackUrl = new URL(request.url, `http://localhost:${relayPort}`);
    } catch {
      response.writeHead(400).end("Invalid callback URL.");
      return;
    }

    if (callbackUrl.pathname !== callbackPath) {
      response.writeHead(404).end();
      return;
    }
    if (!relayUrl) {
      response.writeHead(503).end("The Tough Crowd relay is not ready yet.");
      return;
    }

    const callbackParams = callbackUrl.searchParams;
    if (
      (!callbackParams.get("code") || !callbackParams.get("state")) &&
      !callbackParams.get("error")
    ) {
      response.writeHead(400).end("The authorization callback is incomplete.");
      return;
    }

    const destination = new URL(relayUrl);
    destination.hash = callbackParams.toString();
    response.writeHead(303, {
      location: destination.toString(),
      "cache-control": "no-store",
      connection: "close",
    });
    response.once("finish", resolveRedirect);
    response.end();
  });

  await listen(server);

  return {
    callbackUrl: `http://localhost:${relayPort}${callbackPath}`,
    setRelayUrl(value) {
      relayUrl = validateRelayUrl(value);
    },
    waitForRedirect: () => redirected,
    close: () => closeServer(server),
  };
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
