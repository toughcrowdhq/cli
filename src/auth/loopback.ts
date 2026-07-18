import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export type LoopbackCallback =
  { kind: "approved"; code: string } | { kind: "denied" };

export type LoopbackFailureKind = "canceled" | "close" | "listen" | "timeout";

export class LoopbackAuthorizationError extends Error {
  readonly kind: LoopbackFailureKind;

  constructor(kind: LoopbackFailureKind, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "LoopbackAuthorizationError";
    this.kind = kind;
  }
}

export interface LoopbackListener {
  readonly callbackUri: string;
  waitForCallback(): Promise<LoopbackCallback>;
  close(): Promise<void>;
}

export interface BindLoopbackListenerOptions {
  state: string;
  signal: AbortSignal;
  timeoutMs?: number;
}

export interface LoopbackListenerFactory {
  (options: BindLoopbackListenerOptions): Promise<LoopbackListener>;
}

const loopbackAddress = "127.0.0.1";
const callbackPath = "/callback";
const defaultTimeoutMs = 10 * 60 * 1_000;
const safeSuccessHtml =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Tough Crowd CLI</title><body><p>Authorization received. You can return to the terminal.</p></body></html>';
const safeRejectedText =
  "This request is not a valid CLI authorization callback.\n";

export async function bindLoopbackListener(
  options: BindLoopbackListenerOptions,
): Promise<LoopbackListener> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Loopback callback timeout must be greater than zero");
  }

  let port = 0;
  let acceptingCallback = true;
  let terminal = false;
  let closePromise: Promise<void> | undefined;
  let resolveCallback!: (result: LoopbackCallback) => void;
  let rejectCallback!: (error: LoopbackAuthorizationError) => void;

  const callbackPromise = new Promise<LoopbackCallback>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  void callbackPromise.catch(() => {
    // Cleanup may close the listener before a caller starts awaiting callbacks.
  });

  const server = createServer((request, response) => {
    const callback = readCallback(request, port, options.state);
    if (!acceptingCallback || callback == null) {
      sendRejectedResponse(response);
      return;
    }

    acceptingCallback = false;
    sendSuccessResponse(response, () => {
      void settleSuccess(callback);
    });
  });

  const closeServer = (): Promise<void> => {
    closePromise ??= new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return closePromise;
  };

  const clearLifecycle = (): void => {
    clearTimeout(timeoutId);
    options.signal.removeEventListener("abort", abort);
  };

  const settleSuccess = async (callback: LoopbackCallback): Promise<void> => {
    if (terminal) return;
    terminal = true;
    clearLifecycle();
    try {
      await closeServer();
      resolveCallback(callback);
    } catch (error) {
      rejectCallback(
        new LoopbackAuthorizationError(
          "close",
          "The CLI callback listener could not close safely.",
          error,
        ),
      );
    }
  };

  const settleFailure = async (
    error: LoopbackAuthorizationError,
  ): Promise<void> => {
    if (terminal) return;
    terminal = true;
    acceptingCallback = false;
    clearLifecycle();
    try {
      await closeServer();
    } catch {
      // The original terminal outcome remains the safe public failure.
    }
    rejectCallback(error);
  };

  const abort = (): void => {
    void settleFailure(
      new LoopbackAuthorizationError(
        "canceled",
        "CLI authorization was canceled.",
      ),
    );
  };

  try {
    await listen(server);
  } catch (error) {
    throw new LoopbackAuthorizationError(
      "listen",
      "The CLI callback listener could not bind to IPv4 loopback.",
      error,
    );
  }

  port = (server.address() as AddressInfo).port;
  options.signal.addEventListener("abort", abort, { once: true });

  const timeoutId = setTimeout(() => {
    void settleFailure(
      new LoopbackAuthorizationError("timeout", "CLI authorization timed out."),
    );
  }, timeoutMs);
  timeoutId.unref();

  if (options.signal.aborted) abort();

  return {
    callbackUri: `http://${loopbackAddress}:${port}${callbackPath}`,
    waitForCallback() {
      return callbackPromise;
    },
    async close() {
      if (!terminal) {
        await settleFailure(
          new LoopbackAuthorizationError(
            "canceled",
            "CLI authorization was canceled.",
          ),
        );
        return;
      }
      await closeServer();
    },
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, loopbackAddress);
  });
}

function readCallback(
  request: IncomingMessage,
  port: number,
  expectedState: string,
): LoopbackCallback | null {
  if (
    request.method !== "GET" ||
    request.headers.host !== `${loopbackAddress}:${port}` ||
    request.url == null
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(request.url, `http://${loopbackAddress}:${port}`);
  } catch {
    return null;
  }

  if (url.pathname !== callbackPath || url.hash !== "") return null;
  if (url.searchParams.getAll("state").length !== 1) return null;
  if (url.searchParams.get("state") !== expectedState) return null;

  const code = url.searchParams.get("code");
  if (
    code != null &&
    code.length > 0 &&
    code.length <= 200 &&
    hasExactQueryKeys(url, ["code", "state"])
  ) {
    return { kind: "approved", code };
  }

  if (
    url.searchParams.get("error") === "access_denied" &&
    hasExactQueryKeys(url, ["error", "state"])
  ) {
    return { kind: "denied" };
  }

  return null;
}

function hasExactQueryKeys(url: URL, expectedKeys: readonly string[]): boolean {
  const keys = [...url.searchParams.keys()].sort();
  const expected = [...expectedKeys].sort();

  return (
    keys.length === expected.length &&
    keys.every(
      (key, index) =>
        key === expected[index] && url.searchParams.getAll(key).length === 1,
    )
  );
}

function sendSuccessResponse(
  response: ServerResponse,
  onFinished: () => void,
): void {
  response.writeHead(200, {
    "cache-control": "no-store",
    connection: "close",
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(safeSuccessHtml, onFinished);
}

function sendRejectedResponse(response: ServerResponse): void {
  response.writeHead(404, {
    "cache-control": "no-store",
    connection: "close",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(safeRejectedText);
}
