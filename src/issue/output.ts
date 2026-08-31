import type {
  CountResponse,
  CreateIssueResponse,
  IssueComment,
  IssueCommentResponse,
  DetachedRelationshipResponse,
  GitHubLinkResponse,
  Issue,
  IssueDetail,
  IssueList,
  IssueResponse,
  IssueSummary,
  RelationshipResponse,
  VerificationResponse,
} from "./types.js";

type Writable = { write(value: string): unknown };

const columnWidths = {
  id: 36,
  state: 10,
  repository: 28,
  title: 48,
  version: 7,
  createdAt: 24,
} as const;

export function printIssueList(
  stdout: Writable,
  result: IssueList,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  if (result.issues.length === 0) {
    stdout.write("No issues found.\n");
    return;
  }
  stdout.write(
    formatRow({
      id: "ID",
      state: "STATE",
      repository: "REPOSITORY",
      title: "TITLE",
      version: "VERSION",
      createdAt: "CREATED",
    }),
  );
  for (const issue of result.issues) stdout.write(formatIssue(issue));
}

export function printCreatedIssue(
  stdout: Writable,
  result: CreateIssueResponse,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write("Issue created\n");
  printIssueFields(stdout, result.issue);
  stdout.write(`Title: ${formatTitle(result.issue, result.titlingState)}\n`);
}

export function printIssueDetail(
  stdout: Writable,
  detail: IssueDetail,
  json: boolean,
): void {
  if (json) return printJson(stdout, detail);
  printIssueFields(stdout, detail.issue);
  stdout.write(
    `Title: ${formatValue(detail.issue.title ?? "(untitled)", 500)}\n`,
  );
  stdout.write(
    `Description: ${formatValue(detail.issue.description, 2_000)}\n`,
  );
  stdout.write(`Sessions: ${detail.relationships.length}\n`);
  stdout.write(`Verifications: ${detail.verifications.length}\n`);
  stdout.write(`External links: ${detail.externalLinks.length}\n`);
  stdout.write(`Events: ${detail.events.length}\n`);
  stdout.write(
    `Comment capacity: ${detail.commentCapacity.count}/${detail.commentCapacity.countLimit}; ${detail.commentCapacity.serializedBodyBytes}/${detail.commentCapacity.serializedBodyBytesLimit} bytes; ${detail.commentCapacity.acceptingComments ? "accepting comments" : "comments closed"}\n`,
  );
  stdout.write(`Comments: ${detail.comments.length}\n`);
  for (const comment of detail.comments) printComment(stdout, comment);
}

export function printCreatedIssueComment(
  stdout: Writable,
  result: IssueCommentResponse,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write("Issue comment created\n");
  printComment(stdout, result.comment);
}

export function printUpdatedIssue(
  stdout: Writable,
  result: IssueResponse,
  action: "updated" | "resolved" | "reopened",
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Issue ${action}\n`);
  printIssueFields(stdout, result.issue);
}

export function printRelationship(
  stdout: Writable,
  result: RelationshipResponse,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write("Session attached\n");
  stdout.write(`Issue ID: ${result.relationship.issueId}\n`);
  stdout.write(`Session ID: ${result.relationship.sessionId}\n`);
  stdout.write(`Role: ${result.relationship.role}\n`);
}

export function printDetachedRelationship(
  stdout: Writable,
  result: DetachedRelationshipResponse,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Session relationships detached: ${result.detached}\n`);
}

export function printVerification(
  stdout: Writable,
  result: VerificationResponse,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write("Verification recorded\n");
  stdout.write(`Result: ${result.verification.result}\n`);
  stdout.write(
    `Environment: ${formatValue(result.verification.environment, 80)}\n`,
  );
}

export function printGitHubLink(
  stdout: Writable,
  result: GitHubLinkResponse,
  action: "mirror requested" | "adopted",
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`GitHub issue ${action}\n`);
  if (result.link != null) {
    stdout.write(`Link: ${formatValue(result.link.url, 2_048)}\n`);
  }
  if (result.command != null) {
    stdout.write(`Sync state: ${result.command.state}\n`);
  }
}

export function printCount(
  stdout: Writable,
  result: CountResponse,
  key: "retried" | "unlinked",
  label: string,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`${label}: ${result[key] ?? 0}\n`);
}

export function printIssueSummary(
  stdout: Writable,
  result: IssueSummary,
  json: boolean,
): void {
  if (json) return printJson(stdout, result);
  stdout.write(`Created: ${result.created.count}\n`);
  stdout.write(`Fixed: ${result.fixed.count}\n`);
  stdout.write(`Fixed and verified: ${result.fixedAndVerified.count}\n`);
  stdout.write(`Non-fixed: ${result.nonFixed.count}\n`);
  stdout.write(`Merged, unverified: ${result.mergedUnverified.count}\n`);
  stdout.write(`Deployed, unverified: ${result.deployedUnverified.count}\n`);
}

function printJson(stdout: Writable, value: unknown): void {
  stdout.write(`${JSON.stringify(value)}\n`);
}

function printIssueFields(stdout: Writable, issue: Issue): void {
  stdout.write(`ID: ${issue.id}\n`);
  stdout.write(`State: ${issue.state}\n`);
  stdout.write(`Version: ${issue.version}\n`);
  stdout.write(
    `Repository: ${formatValue(issue.repositoryFullName ?? issue.githubRepositoryId, 255)}\n`,
  );
}

function formatTitle(issue: Issue, titlingState: "ready" | "pending"): string {
  if (issue.title == null && titlingState === "pending") return "(generating)";
  return formatValue(issue.title ?? "(untitled)", 500);
}

function formatIssue(issue: Issue): string {
  return formatRow({
    id: issue.id,
    state: issue.state,
    repository: issue.repositoryFullName ?? issue.githubRepositoryId,
    title: issue.title ?? "(untitled)",
    version: String(issue.version),
    createdAt: issue.createdAt,
  });
}

function formatRow(values: Record<keyof typeof columnWidths, string>): string {
  return (
    (Object.keys(columnWidths) as Array<keyof typeof columnWidths>)
      .map((key) => formatColumn(values[key], columnWidths[key]))
      .join("  ") + "\n"
  );
}

function formatColumn(value: string, width: number): string {
  const safe = formatValue(value, width);
  const bounded =
    safe.length <= width ? safe : `${safe.slice(0, width - 3)}...`;
  return bounded.padEnd(width);
}

function formatValue(value: string, maximumLength: number): string {
  const safe = formatTerminalValue(value);
  return safe.length <= maximumLength
    ? safe
    : `${safe.slice(0, maximumLength - 3)}...`;
}

function printComment(stdout: Writable, comment: IssueComment): void {
  stdout.write(`Comment ID: ${comment.id}\n`);
  stdout.write(`Issue ID: ${comment.issueId}\n`);
  stdout.write(`Author: ${formatTerminalValue(comment.createdBy.name)}\n`);
  stdout.write(`Created: ${comment.createdAt}\n`);
  stdout.write(`Submitted via: ${formatProvenance(comment)}\n`);
  if (comment.session != null) {
    stdout.write(
      `Session: ${comment.session.id}${comment.session.title == null ? "" : ` (${formatTerminalValue(comment.session.title)})`}\n`,
    );
  }
  stdout.write("Body:\n");
  stdout.write(`${formatMultilineValue(comment.body)}\n`);
}

function formatProvenance(comment: IssueComment): string {
  return comment.submittedVia.type === "browser"
    ? "browser"
    : `API key (${formatTerminalValue(comment.submittedVia.name)})`;
}

function formatMultilineValue(value: string): string {
  return value
    .split(/\r\n|\r|\n/u)
    .map(formatTerminalValue)
    .join("\n");
}

function formatTerminalValue(value: string): string {
  let safe = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    safe +=
      codePoint != null &&
      (codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
        ? " "
        : character;
  }
  return safe;
}
