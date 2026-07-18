import { ApiClientError } from "../api/errors.js";
import { ApiOriginError } from "../api/origin.js";
import type { FetchLike, TimerCapabilities } from "../api/request.js";
import { AuthCommandError } from "./errors.js";
import {
  createApiKeyPageUrl,
  resolveAuthOrigins,
  type OriginEnvironment,
} from "./origins.js";
import {
  apiKeyEnvironmentVariable,
  resolveCredential,
  type CredentialEnvironment,
  type CredentialResolution,
  type CredentialStore,
} from "./credentials.js";
import { validateApiKey, type AuthIdentity } from "./identity.js";
import type { HiddenPrompt } from "./prompt.js";

export interface AuthRuntime {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
  version: string;
  signal: AbortSignal;
  env?: OriginEnvironment & CredentialEnvironment;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  credentialStore: CredentialStore;
  prompt: HiddenPrompt;
  openUrl(url: string): Promise<boolean>;
}

export interface AuthStatusOptions {
  json?: boolean;
}

export async function login(runtime: AuthRuntime): Promise<void> {
  const { apiOrigin, webOrigin } = resolveOrigins(runtime.env);

  if (!runtime.prompt.isInteractive) {
    throw new AuthCommandError(
      `Interactive login requires a TTY. Use ${apiKeyEnvironmentVariable} for non-interactive authentication.`,
    );
  }

  const apiKeyUrl = createApiKeyPageUrl(webOrigin);
  runtime.stdout.write(`Create an API key: ${apiKeyUrl}\n`);
  await runtime.openUrl(apiKeyUrl);

  const apiKey = await runtime.prompt.readHiddenLine(
    "Paste API key: ",
    runtime.signal,
  );
  if (apiKey.trim().length === 0) {
    throw new AuthCommandError("API key is required.");
  }

  const identity = await validate(apiOrigin, apiKey.trim(), runtime);
  const existing = await runtime.credentialStore.read(apiOrigin);
  if (existing != null) {
    const replace = await runtime.prompt.confirm(
      `Replace the stored API key for ${apiOrigin}? [y/N] `,
      runtime.signal,
    );
    if (!replace) {
      throw new AuthCommandError(
        "Authentication canceled. Existing credential was left unchanged.",
      );
    }
  }

  await runtime.credentialStore.write(apiOrigin, apiKey.trim());
  printHumanStatus(runtime.stdout, {
    apiOrigin,
    source: "stored",
    identity,
  });
}

export async function status(
  runtime: AuthRuntime,
  options: AuthStatusOptions = {},
): Promise<void> {
  const { apiOrigin } = resolveOrigins(runtime.env);
  const credential = await resolveCredential({
    env: runtime.env,
    store: runtime.credentialStore,
    apiOrigin,
  });

  if (credential == null) {
    throw new AuthCommandError(
      `Not authenticated for ${apiOrigin}. Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
    );
  }

  const identity = await validate(apiOrigin, credential.apiKey, runtime);
  if (options.json === true) {
    printJsonStatus(runtime.stdout, {
      apiOrigin,
      source: credential.source,
      identity,
    });
    return;
  }

  printHumanStatus(runtime.stdout, {
    apiOrigin,
    source: credential.source,
    identity,
  });
}

function resolveOrigins(
  env: AuthRuntime["env"],
): ReturnType<typeof resolveAuthOrigins> {
  try {
    return resolveAuthOrigins(env);
  } catch (error) {
    if (error instanceof ApiOriginError) {
      throw new AuthCommandError(error.message);
    }
    throw error;
  }
}

async function validate(
  apiOrigin: string,
  apiKey: string,
  runtime: AuthRuntime,
): Promise<AuthIdentity> {
  try {
    return await validateApiKey({
      apiOrigin,
      apiKey,
      signal: runtime.signal,
      version: runtime.version,
      fetch: runtime.fetch,
      timers: runtime.timers,
    });
  } catch (error) {
    throw formatValidationFailure(error);
  }
}

function formatValidationFailure(error: unknown): AuthCommandError {
  if (error instanceof ApiClientError) {
    if (error.kind === "api") {
      return new AuthCommandError(`Authentication failed: ${error.message}`);
    }
    if (error.kind === "canceled") {
      return new AuthCommandError("Authentication canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new AuthCommandError(
        "Authentication failed: API request timed out.",
      );
    }
    if (error.kind === "network") {
      return new AuthCommandError(
        "Authentication failed: could not reach the Tough Crowd API.",
      );
    }
  }

  if (error instanceof AuthCommandError) return error;

  return new AuthCommandError(
    "Authentication failed: API response was invalid.",
  );
}

function printHumanStatus(
  stdout: AuthRuntime["stdout"],
  result: {
    apiOrigin: string;
    source: CredentialResolution["source"];
    identity: AuthIdentity;
  },
): void {
  stdout.write(`Authenticated as ${formatUser(result.identity)}\n`);
  stdout.write(`API origin: ${result.apiOrigin}\n`);
  stdout.write(`Credential source: ${result.source}\n`);
  stdout.write(`API key: ${result.identity.key.name ?? "(unnamed)"}\n`);
  stdout.write(
    `Expires: ${result.identity.key.expiresAt ?? "never or not reported"}\n`,
  );
}

function printJsonStatus(
  stdout: AuthRuntime["stdout"],
  result: {
    apiOrigin: string;
    source: CredentialResolution["source"];
    identity: AuthIdentity;
  },
): void {
  stdout.write(
    `${JSON.stringify({
      authenticated: true,
      apiOrigin: result.apiOrigin,
      credentialSource: result.source,
      user: result.identity.user,
      ...(result.identity.account != null
        ? { account: result.identity.account }
        : {}),
      key: {
        name: result.identity.key.name ?? null,
        expiresAt: result.identity.key.expiresAt ?? null,
      },
    })}\n`,
  );
}

function formatUser(identity: AuthIdentity): string {
  return identity.user.email ?? identity.user.name ?? identity.user.id;
}
