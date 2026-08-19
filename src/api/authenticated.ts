import { ApiOriginError } from "./origin.js";
import type { FetchLike, TimerCapabilities } from "./request.js";
import {
  apiKeyEnvironmentVariable,
  resolveCredential,
  type CredentialEnvironment,
  type CredentialStore,
} from "../auth/credentials.js";
import { resolveAuthOrigin, type OriginEnvironment } from "../auth/origins.js";

export interface AuthenticatedCommandRuntime {
  version: string;
  signal: AbortSignal;
  env?: OriginEnvironment & CredentialEnvironment;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  credentialStore: CredentialStore;
}

export interface AuthenticatedApiRuntime {
  apiOrigin: string;
  authorization: string;
  version: string;
  signal: AbortSignal;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
}

export async function resolveAuthenticatedApiRuntime(
  runtime: AuthenticatedCommandRuntime,
  createError: (message: string) => Error,
): Promise<AuthenticatedApiRuntime> {
  let apiOrigin: string;
  try {
    apiOrigin = resolveAuthOrigin(runtime.env);
  } catch (error) {
    if (error instanceof ApiOriginError) throw createError(error.message);
    throw error;
  }

  const credential = await resolveCredential({
    env: runtime.env,
    store: runtime.credentialStore,
    apiOrigin,
  });

  if (credential == null) {
    throw createError(
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
