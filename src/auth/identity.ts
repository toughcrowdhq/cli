import { requestJson, type RequestJsonOptions } from "../api/request.js";

export interface AuthIdentity {
  user: {
    id: string;
    email: string;
    name: string;
  };
  key: {
    id: string;
    name: string;
    createdAt: string;
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
    path: "/api/me",
    authorization: `Bearer ${options.apiKey}`,
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeAuthIdentity,
  });
}

export function decodeAuthIdentity(value: unknown): AuthIdentity {
  if (
    !isRecord(value) ||
    value.authenticated !== true ||
    !isRecord(value.user) ||
    !isRecord(value.impersonation) ||
    !isRecord(value.credential)
  ) {
    throw new TypeError("identity response must contain API-key identity");
  }

  const userId = readBoundedString(value.user.id, 120);
  const userEmail = readBoundedString(value.user.email, 320);
  const userName = readBoundedString(value.user.name, 200);
  const userRole = value.user.role;
  if (
    userId == null ||
    userEmail == null ||
    userName == null ||
    (userRole !== "user" && userRole !== "admin")
  ) {
    throw new TypeError("identity user is invalid");
  }

  if (
    value.impersonation.isImpersonating !== false ||
    value.impersonation.impersonatedBy !== null
  ) {
    throw new TypeError("API-key identity cannot be impersonated");
  }

  return {
    user: {
      id: userId,
      email: userEmail,
      name: userName,
    },
    key: decodeKey(value.credential),
  };
}

function decodeKey(value: Record<string, unknown>): AuthIdentity["key"] {
  const id = readBoundedString(value.id, 120);
  const name = readBoundedString(value.name, 200);
  const createdAt = readIsoTimestamp(value.createdAt);
  if (
    value.type !== "api-key" ||
    id == null ||
    name == null ||
    createdAt == null
  ) {
    throw new TypeError("identity key is invalid");
  }

  return { id, name, createdAt };
}

function readIsoTimestamp(value: unknown): string | null {
  const text = readBoundedString(value, 80);
  if (text == null) return null;

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toISOString() === text ? text : null;
}

function readBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > maxLength) return null;

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
