import { AsyncLocalStorage } from "node:async_hooks";

// Credentials already resolved by normal command work stay invocation-local.
// Never serialize this context.
export interface DiagnosticContext {
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
