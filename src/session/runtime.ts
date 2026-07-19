import { ApiOriginError } from "../api/origin.js";
import type { FetchLike, TimerCapabilities } from "../api/request.js";
import {
  apiKeyEnvironmentVariable,
  resolveCredential,
  type CredentialEnvironment,
  type CredentialStore,
} from "../auth/credentials.js";
import { resolveAuthOrigin, type OriginEnvironment } from "../auth/origins.js";
import { SessionCommandError } from "./errors.js";

export interface SessionRuntime {
  stdout: { write(value: string): unknown };
  version: string;
  signal: AbortSignal;
  env?: OriginEnvironment & CredentialEnvironment;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  credentialStore: CredentialStore;
}

export interface AuthenticatedSessionApiRuntime {
  apiOrigin: string;
  authorization: string;
  version: string;
  signal: AbortSignal;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
}

export async function resolveAuthenticatedSessionApiRuntime(
  runtime: SessionRuntime,
): Promise<AuthenticatedSessionApiRuntime> {
  let apiOrigin: string;
  try {
    apiOrigin = resolveAuthOrigin(runtime.env);
  } catch (error) {
    if (error instanceof ApiOriginError) {
      throw new SessionCommandError(error.message);
    }
    throw error;
  }

  const credential = await resolveCredential({
    env: runtime.env,
    store: runtime.credentialStore,
    apiOrigin,
  });

  if (credential == null) {
    throw new SessionCommandError(
      `Not authenticated for ${apiOrigin}. Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
    );
  }

  return {
    apiOrigin,
    authorization: `Bearer ${credential.apiKey}`,
    version: runtime.version,
    signal: runtime.signal,
    fetch: runtime.fetch,
    timers: runtime.timers,
  };
}
