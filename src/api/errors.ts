export type ApiFailureKind =
  "api" | "canceled" | "malformed-response" | "network" | "timeout";

export interface ApiErrorField {
  field: string;
  message: string;
  code?: string;
}

export interface ApiClientErrorOptions {
  kind: ApiFailureKind;
  message: string;
  status?: number;
  code?: string;
  requestId?: string;
  fields?: readonly ApiErrorField[];
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly kind: ApiFailureKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly fields: readonly ApiErrorField[];

  constructor(options: ApiClientErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.fields = options.fields ?? [];
  }
}

interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: readonly ApiErrorField[];
    requestId?: string;
  };
  requestId?: string;
}

const maxCodeLength = 80;
const maxMessageLength = 500;
const maxFieldCount = 20;
const maxFieldNameLength = 120;

export function decodeApiErrorEnvelope(
  value: unknown,
): ApiErrorEnvelope | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;

  const code = readBoundedString(value.error.code, maxCodeLength);
  const message = readBoundedString(value.error.message, maxMessageLength);
  if (code == null || message == null) return null;

  const nestedRequestId = readOptionalBoundedString(
    value.error.requestId,
    maxCodeLength,
  );
  const legacyRequestId = readOptionalBoundedString(
    value.requestId,
    maxCodeLength,
  );
  if (nestedRequestId === undefined || legacyRequestId === undefined) {
    return null;
  }

  const fields = decodeApiErrorFields(
    value.error.details ?? value.error.fields,
  );
  if (fields === undefined) return null;

  const requestId = nestedRequestId ?? legacyRequestId;

  return {
    error: {
      code,
      message,
      ...(fields.length > 0 ? { fields } : {}),
      ...(requestId != null ? { requestId } : {}),
    },
    ...(requestId != null ? { requestId } : {}),
  };
}

function decodeApiErrorFields(
  value: unknown,
): readonly ApiErrorField[] | undefined {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxFieldCount) return undefined;

  const fields: ApiErrorField[] = [];

  for (const item of value) {
    if (!isRecord(item)) return undefined;

    const field = readBoundedString(item.field, maxFieldNameLength);
    const message = readBoundedString(item.message, maxMessageLength);
    const code = readOptionalBoundedString(item.code, maxCodeLength);

    if (field == null || message == null || code === undefined) {
      return undefined;
    }

    fields.push({
      field,
      message,
      ...(code != null ? { code } : {}),
    });
  }

  return fields;
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
  if (value.length > maxLength) return null;

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
