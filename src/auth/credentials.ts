import { Entry } from "@napi-rs/keyring";
import { AuthCommandError } from "./errors.js";

export const apiKeyEnvironmentVariable = "TOUGHCROWD_API_KEY";

export type CredentialSource = "environment" | "stored";

export interface CredentialStore {
  read(apiOrigin: string): Promise<string | null>;
  write(apiOrigin: string, apiKey: string): Promise<void>;
}

export interface CredentialResolution {
  apiKey: string;
  source: CredentialSource;
}

export interface CredentialEnvironment {
  readonly [apiKeyEnvironmentVariable]?: string;
}

interface StoredApiKeyRecord {
  formatVersion: 1;
  kind: "api-key";
  apiOrigin: string;
  apiKey: string;
}

const servicePrefix = "com.toughcrowd.cli";

export async function resolveCredential(options: {
  env?: CredentialEnvironment;
  store: CredentialStore;
  apiOrigin: string;
}): Promise<CredentialResolution | null> {
  const environmentKey = options.env?.[apiKeyEnvironmentVariable];
  if (environmentKey != null && environmentKey.length > 0) {
    return { apiKey: environmentKey, source: "environment" };
  }

  const storedKey = await options.store.read(options.apiOrigin);
  if (storedKey == null) return null;

  return { apiKey: storedKey, source: "stored" };
}

export function createKeyringCredentialStore(): CredentialStore {
  return {
    read(apiOrigin) {
      try {
        const serialized = new Entry(
          serviceFor(apiOrigin),
          accountFor(),
        ).getPassword();
        if (serialized == null) return Promise.resolve(null);

        return Promise.resolve(decodeStoredApiKeyRecord(serialized, apiOrigin));
      } catch (error) {
        if (error instanceof AuthCommandError) throw error;
        throw unavailableCredentialStoreError(error);
      }
    },
    write(apiOrigin, apiKey) {
      try {
        new Entry(serviceFor(apiOrigin), accountFor()).setPassword(
          JSON.stringify(encodeStoredApiKeyRecord(apiOrigin, apiKey)),
        );
        return Promise.resolve();
      } catch (error) {
        throw unavailableCredentialStoreError(error);
      }
    },
  };
}

export function encodeStoredApiKeyRecord(
  apiOrigin: string,
  apiKey: string,
): StoredApiKeyRecord {
  return {
    formatVersion: 1,
    kind: "api-key",
    apiOrigin,
    apiKey,
  };
}

export function decodeStoredApiKeyRecord(
  serialized: string,
  expectedApiOrigin: string,
): string {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new AuthCommandError(
      "Stored Tough Crowd credential has an unsupported format. Use TOUGHCROWD_API_KEY or replace the stored key with `toughcrowd auth login`.",
    );
  }

  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    value.kind !== "api-key" ||
    value.apiOrigin !== expectedApiOrigin ||
    typeof value.apiKey !== "string" ||
    value.apiKey.length === 0
  ) {
    throw new AuthCommandError(
      "Stored Tough Crowd credential has an unsupported format. Use TOUGHCROWD_API_KEY or replace the stored key with `toughcrowd auth login`.",
    );
  }

  return value.apiKey;
}

function serviceFor(apiOrigin: string): string {
  return `${servicePrefix}:${Buffer.from(apiOrigin).toString("base64url")}`;
}

function accountFor(): string {
  return "api-key";
}

function unavailableCredentialStoreError(_cause: unknown): AuthCommandError {
  return new AuthCommandError(
    `The operating-system credential store is unavailable. Use ${apiKeyEnvironmentVariable} for non-interactive authentication, or try again after enabling the OS credential store.`,
    1,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
