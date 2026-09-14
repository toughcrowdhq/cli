import { ApiClientError } from "../api/errors.js";
import {
  requestJson,
  requestNoContent,
  type FetchLike,
  type TimerCapabilities,
} from "../api/request.js";
import { defaultApiOrigin } from "../api/origin.js";
import {
  bindChatGptRelayListener,
  type ChatGptRelayListenerFactory,
} from "./relay-listener.js";

export class ChatGptRelayError extends Error {
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = "ChatGptRelayError";
  }
}

export type ChatGptRelayRuntime = {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
  signal: AbortSignal;
  version: string;
  origin?: string;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  bindListener?: ChatGptRelayListenerFactory;
};

type RelayReadyResponse = {
  relayUrl: string;
  expiresAt: string;
  heartbeatIntervalSeconds: number;
};

export async function relayChatGptAuthorization(
  code: string,
  runtime: ChatGptRelayRuntime,
): Promise<void> {
  let listener;
  let listenerClosed = false;
  try {
    listener = await (runtime.bindListener ?? bindChatGptRelayListener)();
  } catch (error) {
    throw new ChatGptRelayError(
      error instanceof Error && "code" in error && error.code === "EADDRINUSE"
        ? "Port 1455 is already in use. Stop the other process and run the relay again."
        : "Could not start the ChatGPT relay on localhost:1455.",
    );
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  runtime.signal.addEventListener("abort", abort, { once: true });

  try {
    const ready = await requestJson({
      origin: runtime.origin ?? defaultApiOrigin,
      method: "POST",
      path: "/api/model-credential-authorizations/relay/ready",
      body: { code },
      signal: controller.signal,
      fetch: runtime.fetch,
      timers: runtime.timers,
      metadata: { cliVersion: runtime.version },
      decode: decodeRelayReadyResponse,
    });
    listener.setRelayUrl(ready.relayUrl);

    runtime.stdout.write(`ChatGPT relay running at ${listener.callbackUrl}\n`);
    runtime.stdout.write(
      "Return to your browser and choose Authorize with ChatGPT.\n",
    );

    const heartbeat = runHeartbeats(
      code,
      ready.heartbeatIntervalSeconds,
      runtime,
      controller.signal,
    );
    const outcome = await Promise.race([
      listener.waitForRedirect().then(() => "redirected" as const),
      heartbeat,
      waitForAbort(controller.signal).then(() => "aborted" as const),
    ]);
    if (outcome === "aborted") return;
    controller.abort();
    await listener.close();
    listenerClosed = true;
    runtime.stdout.write(
      "ChatGPT authorization returned to Tough Crowd. Relay completed.\n",
    );
  } catch (error) {
    if (runtime.signal.aborted) return;
    if (error instanceof ChatGptRelayError) throw error;
    if (error instanceof ApiClientError && error.kind === "api") {
      throw new ChatGptRelayError(error.message);
    }
    throw new ChatGptRelayError(
      error instanceof Error
        ? error.message
        : "The ChatGPT relay stopped unexpectedly.",
    );
  } finally {
    controller.abort();
    runtime.signal.removeEventListener("abort", abort);
    if (!listenerClosed) await listener.close().catch(() => undefined);
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

async function runHeartbeats(
  code: string,
  intervalSeconds: number,
  runtime: ChatGptRelayRuntime,
  signal: AbortSignal,
): Promise<never> {
  while (!signal.aborted) {
    await delay(intervalSeconds * 1000, signal, runtime.timers);
    if (signal.aborted) break;
    await requestNoContent({
      origin: runtime.origin ?? defaultApiOrigin,
      method: "POST",
      path: "/api/model-credential-authorizations/relay/heartbeat",
      body: { code },
      signal,
      fetch: runtime.fetch,
      timers: runtime.timers,
      metadata: { cliVersion: runtime.version },
    });
  }
  return await new Promise<never>(() => undefined);
}

function delay(
  milliseconds: number,
  signal: AbortSignal,
  timers: TimerCapabilities = globalThis,
): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = timers.setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      timers.clearTimeout(timeoutId);
      done();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function decodeRelayReadyResponse(value: unknown): RelayReadyResponse {
  if (!isRecord(value)) throw new TypeError("Relay response must be an object");
  const relayUrl = value.relayUrl;
  const expiresAt = value.expiresAt;
  const heartbeatIntervalSeconds = value.heartbeatIntervalSeconds;
  if (
    typeof relayUrl !== "string" ||
    typeof expiresAt !== "string" ||
    typeof heartbeatIntervalSeconds !== "number" ||
    !Number.isInteger(heartbeatIntervalSeconds) ||
    heartbeatIntervalSeconds <= 0
  ) {
    throw new TypeError("Relay response fields are invalid");
  }
  return { relayUrl, expiresAt, heartbeatIntervalSeconds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
