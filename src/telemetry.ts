import { AuthCommandError } from "./auth/errors.js";
import { ConfigError } from "./config.js";
import { isTelemetryRoute } from "./api/routes.js";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { relative, resolve, isAbsolute } from "node:path";
import { LoopbackAuthorizationError } from "./auth/loopback.js";
import { ApiClientError } from "./api/errors.js";
import type { FetchLike, TimerCapabilities } from "./api/request.js";
import { resolveAuthOrigin } from "./auth/origins.js";
import { diagnosticFor, type DiagnosticContext } from "./telemetry-context.js";

interface TelemetryOptions {
  env?: NodeJS.ProcessEnv;
  version: string;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  now?: () => number;
  wallTime?: () => Date;
  uuid?: () => string;
  interactive?: boolean;
}
type Kind =
  | "usage"
  | "authentication"
  | "permission"
  | "api"
  | "network"
  | "timeout"
  | "malformed-response"
  | "local-I/O"
  | "unexpected";
interface Frame {
  file: string;
  line?: number;
  column?: number;
}
interface SafeError {
  kind: Kind;
  code: string;
  name: string;
  frames?: Frame[];
}
const codes = new Set([
  "authentication-required",
  "permission-denied",
  "not-found",
  "client-upgrade-required",
  "validation-failed",
  "conflict",
  "rate-limit-exceeded",
]);
const names = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ApiClientError",
  "AuthCommandError",
  "SessionCommandError",
  "IssueCommandError",
  "IncidentCommandError",
  "DeployCommandError",
  "ConfigError",
  "ChatGptRelayError",
  "CommanderError",
  "InvalidArgumentError",
  "LoopbackAuthorizationError",
]);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

export function safeFrames(
  stack: string | undefined,
  root = packageRoot,
): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack?.split("\n").slice(1) ?? []) {
    const match =
      /(?:\(|at )(file:\/\/\/[^()]+|\/[^()]+|[A-Z]:\\[^()]+):(\d+):(\d+)\)?$/.exec(
        line,
      );
    if (match == null) continue;
    let path: string;
    try {
      path = match[1].startsWith("file:") ? fileURLToPath(match[1]) : match[1];
    } catch {
      continue;
    }
    const file = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
    if (
      isAbsolute(file) ||
      !/^(src|dist)\/[a-zA-Z0-9_./-]+\.[cm]?[jt]s$/.test(file) ||
      file.split("/").includes("..") ||
      file.length > 200
    ) {
      continue;
    }
    const lineNumber = Number(match[2]);
    const column = Number(match[3]);
    if (
      !Number.isSafeInteger(lineNumber) ||
      lineNumber <= 0 ||
      !Number.isSafeInteger(column) ||
      column <= 0
    ) {
      continue;
    }
    frames.push({ file, line: lineNumber, column });
    if (frames.length === 10) break;
  }
  return frames;
}

export function safeDiagnostic(error: unknown): {
  error: SafeError;
  api?: Record<string, string | number>;
} {
  let kind: Kind = "unexpected";
  let code = "unknown";
  let api: Record<string, string | number> | undefined;
  if (error instanceof ApiClientError) {
    kind = error.kind === "canceled" ? "unexpected" : error.kind;
    if (error.kind === "malformed-response") code = "response-schema-invalid";
    else if (error.code != null && codes.has(error.code)) code = error.code;
    if (error.status === 401) kind = "authentication";
    if (error.status === 403) kind = "permission";
    api = {
      ...(error.method != null &&
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
        error.method,
      )
        ? { method: error.method }
        : {}),
      ...(error.route != null && isTelemetryRoute(error.route)
        ? { route: error.route }
        : {}),
      ...(error.status != null && error.status >= 100 && error.status <= 599
        ? { status: error.status }
        : {}),
      ...(error.requestId != null &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(error.requestId)
        ? { requestId: error.requestId }
        : {}),
    };
  } else if (error instanceof LoopbackAuthorizationError) {
    kind = error.kind === "timeout" ? "timeout" : "local-I/O";
    code =
      error.kind === "timeout"
        ? "authorization-timeout"
        : "callback-listener-failed";
  } else if (error instanceof Error) {
    if (
      error.name === "CommanderError" ||
      error.name === "InvalidArgumentError" ||
      ("exitCode" in error && error.exitCode === 2)
    ) {
      kind = "usage";
      code = "invalid-arguments";
    } else if (error instanceof AuthCommandError) {
      kind = "authentication";
      if (
        error.diagnostic.kind === "local-I/O" &&
        error.diagnostic.code === "credential-store-unavailable"
      ) {
        kind = "local-I/O";
        code = "credential-store-unavailable";
      }
    } else if (error instanceof ConfigError) {
      kind = error.kind;
      code =
        error.kind === "usage"
          ? "invalid-configuration"
          : "configuration-io-failed";
    } else if (
      [
        "SessionCommandError",
        "IssueCommandError",
        "IncidentCommandError",
        "DeployCommandError",
      ].includes(error.name)
    ) {
      kind = "usage";
      code = "invalid-arguments";
    } else if (
      "code" in error &&
      [
        "ENOENT",
        "EACCES",
        "EPERM",
        "EIO",
        "ENOSPC",
        "EROFS",
        "EADDRINUSE",
        "EMFILE",
        "ENOTDIR",
        "EISDIR",
      ].includes(String(error.code))
    ) {
      kind = "local-I/O";
      code = String(error.code);
    }
  }
  const frames = error instanceof Error ? safeFrames(error.stack) : [];
  return {
    error: {
      kind,
      code,
      name:
        error instanceof Error && names.has(error.name) ? error.name : "Error",
      ...(frames.length ? { frames } : {}),
    },
    ...(api != null && Object.keys(api).length ? { api } : {}),
  };
}

export function createTelemetry(options: TelemetryOptions) {
  const env = options.env ?? {};
  if (env.TOUGHCROWD_TELEMETRY === "0" || env.DO_NOT_TRACK === "1") {
    return undefined;
  }
  let origin: string;
  try {
    origin = resolveAuthOrigin(env);
  } catch {
    return undefined;
  }
  if (!/^[a-zA-Z0-9.+-]{1,64}$/.test(options.version)) return undefined;
  const timers: TimerCapabilities = options.timers ?? {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  const uuid = options.uuid ?? randomUUID;
  const now = options.now ?? (() => performance.now());
  const wallTime = options.wallTime ?? (() => new Date());
  const invocationId = uuid();
  const sends = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  let command: string | undefined;
  let startedAt = 0;
  let finished = false;
  const context =
    env.CI && env.CI !== "false" && env.CI !== "0"
      ? "ci"
      : options.interactive
        ? "interactive"
        : "noninteractive";
  function send(
    fields: Record<string, unknown>,
    diagnostic: DiagnosticContext,
  ) {
    const event: Record<string, unknown> = {
      schemaVersion: 1,
      eventId: uuid(),
      invocationId,
      clientTime: wallTime().toISOString(),
      cliVersion: options.version,
      nodeVersion: process.versions.node,
      platform: ["darwin", "linux", "win32"].includes(process.platform)
        ? process.platform
        : "other",
      arch: ["x64", "arm64"].includes(process.arch) ? process.arch : "other",
      command,
      executionContext: context,
      ...fields,
    };
    let body = JSON.stringify({ source: "cli-client", entries: [event] });
    if (Buffer.byteLength(body) > 16384) {
      if (typeof event.error === "object" && event.error != null) {
        delete (event.error as SafeError).frames;
      }
      body = JSON.stringify({ source: "cli-client", entries: [event] });
      if (Buffer.byteLength(body) > 16384) return;
    }
    const key =
      env.TOUGHCROWD_API_KEY ||
      (diagnostic.credential?.origin === origin
        ? diagnostic.credential.key
        : undefined);
    const controller = new AbortController();
    controllers.add(controller);
    // Resolve our own wait on abort even when a transport ignores its signal.
    let resolveAbort!: () => void;
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    controller.signal.addEventListener("abort", resolveAbort, { once: true });
    const deadline = timers.setTimeout(() => controller.abort(), 500);
    const delivery = Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return;
        const response = await (options.fetch ?? fetch)(
          new URL("/api/client-logs", origin),
          {
            method: "POST",
            redirect: "manual",
            credentials: "omit",
            headers: {
              "content-type": "application/json",
              ...(key ? { authorization: `Bearer ${key}` } : {}),
            },
            body,
            signal: controller.signal,
          },
        );
        await response.body?.cancel();
      })
      .catch(() => {});
    const pending = Promise.race([delivery, aborted]).finally(() => {
      timers.clearTimeout(deadline);
      controller.signal.removeEventListener("abort", resolveAbort);
      controllers.delete(controller);
      sends.delete(pending);
    });
    sends.add(pending);
  }
  return {
    start(name: string, diagnostic: DiagnosticContext) {
      if (
        command != null ||
        !/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(name) ||
        name.length > 120
      ) {
        return;
      }
      command = name;
      startedAt = now();
      send({ event: "cli.command.started" }, diagnostic);
    },
    async finish(
      exitCode: number,
      error: unknown,
      canceled: boolean,
      diagnostic: DiagnosticContext,
      shutdownSignal?: AbortSignal,
    ) {
      if (command == null || finished) return;
      finished = true;
      const outcome =
        canceled || exitCode === 130
          ? "canceled"
          : exitCode === 0
            ? "success"
            : "failure";
      const stopDelivery = (): void => {
        for (const controller of controllers) controller.abort();
      };
      // Cancellation during command work still gets an independent bounded flush.
      // A new interruption during shutdown stops that flush promptly.
      if (!shutdownSignal?.aborted) {
        shutdownSignal?.addEventListener("abort", stopDelivery, { once: true });
      }
      let deadline: unknown;
      try {
        send(
          {
            event: "cli.command.finished",
            outcome,
            durationMs: Math.max(0, Math.floor(now() - startedAt)),
            exitCode,
            ...(outcome === "failure"
              ? safeDiagnostic(diagnosticFor(error))
              : {}),
          },
          diagnostic,
        );
        await Promise.race([
          Promise.all([...sends]),
          new Promise<void>((resolve) => {
            deadline = timers.setTimeout(resolve, 500);
          }),
        ]);
      } finally {
        timers.clearTimeout(deadline);
        shutdownSignal?.removeEventListener("abort", stopDelivery);
        stopDelivery();
      }
    },
  };
}
