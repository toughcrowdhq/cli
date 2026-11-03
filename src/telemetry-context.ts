import { AsyncLocalStorage } from "node:async_hooks";

// Credentials already resolved by normal command work stay invocation-local.
// Never serialize this context.
export interface DiagnosticContext {
  reportRequestEvent?: (event: RequestTelemetryEvent) => void;
  reportRelayEvent?: (event: RelayTelemetryEvent) => void;
  credential?: { origin: string; key: string };
}
export const diagnosticContext = new AsyncLocalStorage<DiagnosticContext>();

const originalDiagnostics = new WeakMap<Error, unknown>();

// Preserve only an internal reference, never serialize arbitrary causes.
export function preserveDiagnostic<T extends Error>(
  original: unknown,
  rendered: T,
): T {
  originalDiagnostics.set(rendered, diagnosticFor(original));
  return rendered;
}

export function diagnosticFor(error: unknown): unknown {
  return error instanceof Error
    ? (originalDiagnostics.get(error) ?? error)
    : error;
}

export function observeCredential(origin: string, key: string): void {
  const context = diagnosticContext.getStore();
  if (context != null) context.credential = { origin, key };
}

export type RelayTelemetryEvent =
  | { event: "redirect_sent" }
  | {
      event: "request_rejected";
      reason:
        | "invalid_request"
        | "invalid_url"
        | "not_ready"
        | "invalid_callback"
        | "redirect_failed";
    };

export function observeRelayEvent(event: RelayTelemetryEvent): void {
  try {
    diagnosticContext.getStore()?.reportRelayEvent?.(event);
  } catch {
    // Diagnostics must never change relay behavior.
  }
}

export type RequestTelemetryEvent = {
  api: {
    cliRequestId: string;
    method: string;
    route: string;
    requestId?: string;
    status?: number;
  };
} & (
  | { event: "cli.request.started" }
  | { event: "cli.request.response"; durationMs: number }
  | {
      event: "cli.request.failed";
      durationMs: number;
      reason: "network" | "timeout" | "canceled";
    }
);

export function observeRequestEvent(event: RequestTelemetryEvent): void {
  try {
    diagnosticContext.getStore()?.reportRequestEvent?.(event);
  } catch {
    // Telemetry must never change request behavior.
  }
}
