import type {
  CreatedSession,
  CreateSessionResponse,
  SessionList,
  SessionSummary,
} from "./types.js";

const columnWidths = {
  id: 36,
  status: 12,
  repository: 28,
  title: 48,
  createdAt: 24,
} as const;

export function printHumanSessionList(
  stdout: { write(value: string): unknown },
  result: SessionList,
): void {
  if (result.sessions.length === 0) {
    stdout.write("No sessions found.\n");
  } else {
    stdout.write(
      formatRow({
        id: "ID",
        status: "STATUS",
        repository: "REPOSITORY",
        title: "TITLE",
        createdAt: "CREATED",
      }),
    );
    for (const session of result.sessions) {
      stdout.write(formatSession(session));
    }
  }

  if (result.pageInfo.nextCursor != null) {
    stdout.write(
      `Next page: toughcrowd session list --cursor ${JSON.stringify(result.pageInfo.nextCursor)}\n`,
    );
  }
}

export function printJsonSessionList(
  stdout: { write(value: string): unknown },
  result: SessionList,
): void {
  stdout.write(`${JSON.stringify(result)}\n`);
}

export function printHumanCreatedSession(
  stdout: { write(value: string): unknown },
  session: CreatedSession,
): void {
  stdout.write("Session created\n");
  stdout.write(`ID: ${session.id}\n`);
  stdout.write(`Status: ${session.status}\n`);
  stdout.write(
    `Repository: ${formatBoundedValue(session.repository.fullName, 255)}\n`,
  );
  stdout.write(
    `Agent Profile: ${formatBoundedValue(session.agentProfile.name, 200)} (${formatBoundedValue(session.agentProfile.id, 120)})\n`,
  );
  stdout.write(
    `Title: ${session.title == null ? "(generating)" : formatBoundedValue(session.title, 120)}\n`,
  );
}

export function printJsonCreatedSession(
  stdout: { write(value: string): unknown },
  result: CreateSessionResponse,
): void {
  stdout.write(`${JSON.stringify(result)}\n`);
}

function formatSession(session: SessionSummary): string {
  return formatRow({
    id: session.id,
    status: session.status,
    repository: session.repository?.fullName ?? "(unavailable)",
    title: session.title ?? "(untitled)",
    createdAt: session.createdAt,
  });
}

function formatRow(values: {
  id: string;
  status: string;
  repository: string;
  title: string;
  createdAt: string;
}): string {
  return (
    [
      formatColumn(values.id, columnWidths.id),
      formatColumn(values.status, columnWidths.status),
      formatColumn(values.repository, columnWidths.repository),
      formatColumn(values.title, columnWidths.title),
      formatColumn(values.createdAt, columnWidths.createdAt),
    ].join("  ") + "\n"
  );
}

function formatColumn(value: string, width: number): string {
  const safeValue = replaceTerminalControlCharacters(value);
  const bounded =
    safeValue.length <= width
      ? safeValue
      : `${safeValue.slice(0, width - 3)}...`;
  return bounded.padEnd(width);
}

function formatBoundedValue(value: string, maximumLength: number): string {
  const safeValue = replaceTerminalControlCharacters(value);
  return safeValue.length <= maximumLength
    ? safeValue
    : `${safeValue.slice(0, maximumLength - 3)}...`;
}

function replaceTerminalControlCharacters(value: string): string {
  let safeValue = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    safeValue +=
      codePoint != null &&
      (codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
        ? " "
        : character;
  }
  return safeValue;
}
