import { ApiClientError } from "../api/errors.js";
import { ApiOriginError } from "../api/origin.js";
import type { FetchLike, TimerCapabilities } from "../api/request.js";
import {
  exchangeCliAuthorization,
  startCliAuthorization,
} from "./authorization.js";
import { AuthCommandError } from "./errors.js";
import {
  LoopbackAuthorizationError,
  type LoopbackListener,
  type LoopbackListenerFactory,
} from "./loopback.js";
import { resolveAuthOrigin, type OriginEnvironment } from "./origins.js";
import {
  apiKeyEnvironmentVariable,
  resolveCredential,
  type CredentialEnvironment,
  type CredentialResolution,
  type CredentialStore,
} from "./credentials.js";
import { validateApiKey, type AuthIdentity } from "./identity.js";
import type { AuthorizationSecrets } from "./pkce.js";

export interface AuthRuntime {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
  version: string;
  signal: AbortSignal;
  env?: OriginEnvironment & CredentialEnvironment;
  fetch?: FetchLike;
  timers?: TimerCapabilities;
  credentialStore: CredentialStore;
  createAuthorizationSecrets(): AuthorizationSecrets;
  bindLoopbackListener: LoopbackListenerFactory;
  openUrl(url: string): Promise<boolean>;
}

export interface AuthStatusOptions {
  json?: boolean;
}

export async function login(runtime: AuthRuntime): Promise<void> {
  const apiOrigin = resolveOrigin(runtime.env);
  const secrets = runtime.createAuthorizationSecrets();
  let listener: LoopbackListener;

  try {
    listener = await runtime.bindLoopbackListener({
      state: secrets.state,
      signal: runtime.signal,
    });
  } catch (error) {
    throw formatAuthorizationFailure(error);
  }

  try {
    const started = await startCliAuthorization({
      apiOrigin,
      callbackUri: listener.callbackUri,
      codeChallenge: secrets.codeChallenge,
      state: secrets.state,
      clientName: createClientName(runtime.version),
      signal: runtime.signal,
      version: runtime.version,
      fetch: runtime.fetch,
      timers: runtime.timers,
    }).catch((error: unknown) => {
      throw formatAuthorizationFailure(error);
    });

    runtime.stdout.write(
      `Authorize Tough Crowd CLI: ${started.authorizationUrl}\n`,
    );
    const browserOpened = await tryOpenBrowser(
      started.authorizationUrl,
      runtime,
    );
    if (!browserOpened) {
      runtime.stderr.write(
        "Could not open a browser automatically. Open the authorization URL shown above to continue.\n",
      );
    }

    const callback = await listener
      .waitForCallback()
      .catch((error: unknown) => {
        throw formatAuthorizationFailure(error);
      });
    if (callback.kind === "denied") {
      throw new AuthCommandError(
        "Authentication was denied. Existing credential was left unchanged.",
      );
    }

    const exchanged = await exchangeCliAuthorization({
      apiOrigin,
      code: callback.code,
      codeVerifier: secrets.codeVerifier,
      signal: runtime.signal,
      version: runtime.version,
      fetch: runtime.fetch,
      timers: runtime.timers,
    }).catch((error: unknown) => {
      throw formatAuthorizationFailure(error);
    });

    await runtime.credentialStore.write(apiOrigin, exchanged.apiKey);
    printHumanStatus(runtime.stdout, {
      apiOrigin,
      source: "stored",
      identity: {
        user: exchanged.user,
        key: exchanged.key,
      },
    });
  } finally {
    try {
      await listener.close();
    } catch {
      // A terminal auth failure has already been selected. Cleanup must not
      // replace it with an unformatted listener shutdown error.
    }
  }
}

export async function status(
  runtime: AuthRuntime,
  options: AuthStatusOptions = {},
): Promise<void> {
  const apiOrigin = resolveOrigin(runtime.env);
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

function resolveOrigin(env: AuthRuntime["env"]): string {
  try {
    return resolveAuthOrigin(env);
  } catch (error) {
    if (error instanceof ApiOriginError) {
      throw new AuthCommandError(error.message);
    }
    throw error;
  }
}

function createClientName(version: string): string {
  return `Tough Crowd CLI ${version}`.slice(0, 80);
}

async function tryOpenBrowser(
  url: string,
  runtime: AuthRuntime,
): Promise<boolean> {
  try {
    return await runtime.openUrl(url);
  } catch {
    return false;
  }
}

function formatAuthorizationFailure(error: unknown): AuthCommandError {
  if (error instanceof LoopbackAuthorizationError) {
    if (error.kind === "canceled") {
      return new AuthCommandError("Authentication canceled.", 130);
    }
    if (error.kind === "timeout") {
      return new AuthCommandError(
        "Authentication timed out. Existing credential was left unchanged.",
      );
    }
    if (error.kind === "close") {
      return new AuthCommandError(
        "Authentication failed: the local callback listener could not close safely. Existing credential was left unchanged.",
      );
    }
    return new AuthCommandError(
      `Authentication failed: could not start the local callback listener. Use ${apiKeyEnvironmentVariable} for non-interactive authentication.`,
    );
  }

  return formatValidationFailure(error);
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
    if (error.status != null && error.status >= 500) {
      return new AuthCommandError(
        "Authentication failed: the Tough Crowd API returned an internal error.",
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
  stdout.write(`API key: ${result.identity.key.name}\n`);
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
      key: {
        name: result.identity.key.name,
      },
    })}\n`,
  );
}

function formatUser(identity: AuthIdentity): string {
  return identity.user.email;
}
