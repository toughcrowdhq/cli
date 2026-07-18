import { requestJson, type RequestJsonOptions } from "../api/request.js";

export interface AuthIdentity {
  user: {
    id: string;
    email?: string;
    name?: string;
  };
  account?: {
    id: string;
    name?: string;
  };
  key: {
    id?: string;
    name?: string;
    expiresAt?: string | null;
  };
}

export interface ValidateApiKeyOptions {
  apiOrigin: string;
  apiKey: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<AuthIdentity>["fetch"];
  timers?: RequestJsonOptions<AuthIdentity>["timers"];
}

export async function validateApiKey(
  options: ValidateApiKeyOptions,
): Promise<AuthIdentity> {
  return requestJson({
    origin: options.apiOrigin,
    method: "GET",
    path: "/api/cli/auth/identity",
    authorization: `Bearer ${options.apiKey}`,
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeAuthIdentity,
  });
}

export function decodeAuthIdentity(value: unknown): AuthIdentity {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.key)) {
    throw new TypeError("identity response must contain user and key");
  }

  const userId = readBoundedString(value.user.id, 120);
  if (userId == null) throw new TypeError("identity user id is required");

  const account = decodeOptionalAccount(value.account);
  if (account === undefined) throw new TypeError("identity account is invalid");

  const key = decodeKey(value.key);

  return {
    user: {
      id: userId,
      ...readOptionalProperty(value.user.email, "email", 320),
      ...readOptionalProperty(value.user.name, "name", 200),
    },
    ...(account != null ? { account } : {}),
    key,
  };
}

function decodeOptionalAccount(
  value: unknown,
): AuthIdentity["account"] | null | undefined {
  if (value == null) return null;
  if (!isRecord(value)) return undefined;

  const id = readBoundedString(value.id, 120);
  if (id == null) return undefined;

  return {
    id,
    ...readOptionalProperty(value.name, "name", 200),
  };
}

function decodeKey(value: Record<string, unknown>): AuthIdentity["key"] {
  const id = readOptionalBoundedString(value.id, 120);
  const name = readOptionalBoundedString(value.name, 200);
  const expiresAt = readOptionalNullableString(value.expiresAt, 80);
  if (id === undefined || name === undefined || expiresAt === undefined) {
    throw new TypeError("identity key is invalid");
  }

  return {
    ...(id != null ? { id } : {}),
    ...(name != null ? { name } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

function readOptionalProperty<const K extends string>(
  value: unknown,
  key: K,
  maxLength: number,
): { readonly [P in K]?: string } {
  const text = readOptionalBoundedString(value, maxLength);
  if (text == null) return {};

  return { [key]: text } as { readonly [P in K]?: string };
}

function readOptionalNullableString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value == null) return null;

  return readBoundedString(value, maxLength) ?? undefined;
}

function readOptionalBoundedString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value == null) return null;

  return readBoundedString(value, maxLength) ?? undefined;
}

function readBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > maxLength) return null;

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
