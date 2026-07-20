export const sessionStatuses = [
  "queued",
  "initializing",
  "running",
  "ready",
  "failed",
  "cancelling",
  "cancelled",
  "merged",
  "abandoned",
  "archived",
] as const;

export type SessionStatus = (typeof sessionStatuses)[number];

export const sessionStatusFilters = [
  "all",
  "queued",
  "initializing",
  "running",
  "ready",
  "failed",
  "cancelled",
  "merged",
  "abandoned",
  "archived",
] as const;

export type SessionStatusFilter = (typeof sessionStatusFilters)[number];

export interface SessionSummary {
  id: string;
  title: string | null;
  status: SessionStatus;
  repository: {
    fullName: string;
  } | null;
  createdAt: string;
}

export type SessionStatusCounts = Record<SessionStatusFilter, number>;

export interface SessionListPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SessionList {
  sessions: readonly SessionSummary[];
  counts: SessionStatusCounts;
  pageInfo: SessionListPageInfo;
}

export interface CreatedSession {
  id: string;
  status: SessionStatus;
  repository: {
    fullName: string;
  };
  agentProfile: {
    id: string;
    name: string;
  };
  title: string | null;
}

export interface CreateSessionResponse {
  session: CreatedSession;
}

const maximumPageSize = 100;
const maximumTitleLength = 500;
const maximumRepositoryNameLength = 255;
const maximumCursorLength = 4_096;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function decodeSessionList(value: unknown): SessionList {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > maximumPageSize ||
    !isRecord(value.counts) ||
    !isRecord(value.pageInfo)
  ) {
    throw new TypeError("session list response is invalid");
  }

  const sessions = value.sessions.map(decodeSessionSummary);
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
    throw new TypeError("session list contains duplicate sessions");
  }
  const counts = decodeSessionStatusCounts(value.counts);
  const pageInfo = decodeSessionListPageInfo(value.pageInfo);

  return { sessions, counts, pageInfo };
}

export function decodeCreateSessionResponse(
  value: unknown,
): CreateSessionResponse {
  if (!isRecord(value) || !isRecord(value.session)) {
    throw new TypeError("create session response is invalid");
  }

  const id = readUuid(value.session.id);
  const status = readSessionStatus(value.session.status);
  const repository = decodeRepository(value.session.repository);
  const agentProfile = decodeAgentProfile(value.session.agentProfile);
  const title = readNullableString(value.session.title, maximumTitleLength);

  if (
    id == null ||
    status == null ||
    repository == null ||
    agentProfile == null ||
    title === undefined
  ) {
    throw new TypeError("created session is invalid");
  }

  return {
    session: {
      id,
      status,
      repository,
      agentProfile,
      title,
    },
  };
}

function decodeSessionSummary(value: unknown): SessionSummary {
  if (!isRecord(value)) {
    throw new TypeError("session summary is invalid");
  }

  const id = readUuid(value.id);
  const title = readNullableString(value.title, maximumTitleLength);
  const status = readSessionStatus(value.status);
  const repository = decodeRepository(value.repository);
  const createdAt = readIsoTimestamp(value.createdAt);

  if (
    id == null ||
    title === undefined ||
    status == null ||
    repository === undefined ||
    createdAt == null
  ) {
    throw new TypeError("session summary is invalid");
  }

  return { id, title, status, repository, createdAt };
}

function decodeRepository(
  value: unknown,
): SessionSummary["repository"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const fullName = readNonemptyString(
    value.fullName,
    maximumRepositoryNameLength,
  );
  if (fullName == null) return undefined;

  return { fullName };
}

function decodeAgentProfile(
  value: unknown,
): CreatedSession["agentProfile"] | null {
  if (!isRecord(value)) return null;

  const id = readNonemptyString(value.id, 120);
  const name = readNonemptyString(value.name, 200);
  if (id == null || name == null) return null;

  return { id, name };
}

function decodeSessionStatusCounts(
  value: Record<string, unknown>,
): SessionStatusCounts {
  const entries = sessionStatusFilters.map((status) => {
    const count = readNonnegativeInteger(value[status]);
    if (count == null) {
      throw new TypeError("session status counts are invalid");
    }
    return [status, count] as const;
  });

  return Object.fromEntries(entries) as SessionStatusCounts;
}

function decodeSessionListPageInfo(
  value: Record<string, unknown>,
): SessionListPageInfo {
  const nextCursor =
    value.nextCursor === null
      ? null
      : readSafeCursor(value.nextCursor, maximumCursorLength);
  const hasMore = value.hasMore;

  if (
    nextCursor === undefined ||
    typeof hasMore !== "boolean" ||
    (hasMore && nextCursor === null) ||
    (!hasMore && nextCursor !== null)
  ) {
    throw new TypeError("session list pagination is invalid");
  }

  return { nextCursor, hasMore };
}

function readSessionStatus(value: unknown): SessionStatus | null {
  return typeof value === "string" &&
    (sessionStatuses as readonly string[]).includes(value)
    ? (value as SessionStatus)
    : null;
}

function readUuid(value: unknown): string | null {
  const text = readNonemptyString(value, 36);
  return text != null && uuidPattern.test(text) ? text : null;
}

function readIsoTimestamp(value: unknown): string | null {
  const text = readNonemptyString(value, 80);
  if (text == null) return null;

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toISOString() === text ? text : null;
}

function readNullableString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maximumLength) {
    return undefined;
  }
  return value;
}

function readNonemptyString(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    return null;
  }
  return value;
}

function readSafeCursor(
  value: unknown,
  maximumLength: number,
): string | undefined {
  const text = readNonemptyString(value, maximumLength);
  if (text == null || containsControlCharacter(text)) return undefined;
  return text;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint != null &&
      (codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
    ) {
      return true;
    }
  }
  return false;
}

function readNonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
