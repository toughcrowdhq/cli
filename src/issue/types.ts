export const issueStates = ["open", "resolved"] as const;
export type IssueState = (typeof issueStates)[number];

export const issueDispositions = [
  "fixed",
  "duplicate",
  "not_planned",
  "cannot_reproduce",
] as const;
export type IssueDisposition = (typeof issueDispositions)[number];

export const issueRelationshipRoles = [
  "discovered",
  "investigated",
  "implemented",
  "verified",
] as const;
export type IssueRelationshipRole = (typeof issueRelationshipRoles)[number];

export const issueVerificationResults = ["passed", "failed"] as const;
export type IssueVerificationResult = (typeof issueVerificationResults)[number];

export interface Issue {
  id: string;
  githubRepositoryId: string;
  title: string | null;
  description: string;
  state: IssueState;
  resolutionDisposition: IssueDisposition | null;
  resolutionNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  repositoryFullName?: string;
  relationships: readonly IssueRelationship[];
  verifications: readonly IssueVerification[];
  externalLinks: readonly ExternalIssueLink[];
}

export interface IssueRelationship {
  id: string;
  issueId: string;
  sessionId: string;
  role: IssueRelationshipRole;
  sessionTitle?: string | null;
  sessionStatus?: string;
  createdAt: string;
  detachedAt: string | null;
}

export interface IssueVerification {
  id: string;
  issueId: string;
  resolutionEventId: string;
  sessionId: string | null;
  deploymentEvidenceId: string | null;
  environment: string;
  result: IssueVerificationResult;
  note: string | null;
  verifiedAt: string;
}

export interface ExternalIssueLink {
  id: string;
  issueId: string;
  provider: string;
  externalScopeId: string;
  externalIssueId: string;
  externalKey: string;
  url: string;
  externalTitle: string | null;
  externalStateCategory: string | null;
  syncState: string;
  lifecycleSyncState: string;
}

export interface IssueEvent {
  id: string;
  issueId: string;
  eventType: string;
  origin: "local" | "provider" | "system";
  createdAt: string;
}

export interface IssueRepository {
  id: string;
  fullName: string;
  defaultBranch: string;
}

export interface IssueDetail {
  issue: Issue;
  events: readonly IssueEvent[];
  relationships: readonly IssueRelationship[];
  verifications: readonly IssueVerification[];
  externalLinks: readonly ExternalIssueLink[];
  repository: IssueRepository | null;
}

export interface IssueList {
  issues: readonly Issue[];
}

export interface CreateIssueResponse {
  issue: Issue;
  titlingState: "ready" | "pending";
}

export interface IssueResponse {
  issue: Issue;
}

export interface RelationshipResponse {
  relationship: IssueRelationship;
}

export interface DetachedRelationshipResponse {
  detached: number;
}

export interface VerificationResponse {
  verification: IssueVerification;
}

export interface GitHubCommand {
  id: string;
  issueId: string;
  provider: string;
  operation: "create" | "close" | "reopen" | "add_reference";
  state:
    | "pending"
    | "leased"
    | "retrying"
    | "succeeded"
    | "failed"
    | "ambiguous"
    | "paused";
}

export interface GitHubLinkResponse {
  link: ExternalIssueLink | null;
  command: GitHubCommand | null;
}

export interface CountResponse {
  retried?: number;
  unlinked?: number;
}

export interface IssueSummarySet {
  count: number;
  issueIds: readonly string[];
}

export interface IssueSummary {
  range: {
    createdFrom: string | null;
    createdTo: string | null;
    durationMs: number | null;
  };
  created: IssueSummarySet;
  fixed: IssueSummarySet;
  fixedAndVerified: IssueSummarySet;
  nonFixed: IssueSummarySet;
  mergedUnverified: IssueSummarySet;
  deployedUnverified: IssueSummarySet;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function decodeIssueList(value: unknown): IssueList {
  if (!isRecord(value) || !Array.isArray(value.issues)) {
    throw new TypeError("issue list response is invalid");
  }
  const issues = value.issues.map((issue) => decodeIssue(issue));
  if (new Set(issues.map((issue) => issue.id)).size !== issues.length) {
    throw new TypeError("issue list contains duplicate issues");
  }
  return { issues };
}

export function decodeCreateIssueResponse(value: unknown): CreateIssueResponse {
  if (
    !isRecord(value) ||
    (value.titlingState !== "ready" && value.titlingState !== "pending")
  ) {
    throw new TypeError("create issue response is invalid");
  }
  return { issue: decodeIssue(value.issue), titlingState: value.titlingState };
}

export function decodeIssueResponse(value: unknown): IssueResponse {
  if (!isRecord(value)) throw new TypeError("issue response is invalid");
  return { issue: decodeIssue(value.issue) };
}

export function decodeIssueDetail(value: unknown): IssueDetail {
  if (
    !isRecord(value) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.relationships) ||
    !Array.isArray(value.verifications) ||
    !Array.isArray(value.externalLinks)
  ) {
    throw new TypeError("issue detail response is invalid");
  }
  const relationships = value.relationships.map(decodeRelationship);
  const verifications = value.verifications.map(decodeVerification);
  const externalLinks = value.externalLinks.map(decodeExternalLink);
  const repository =
    value.repository === null ? null : decodeRepository(value.repository);
  return {
    issue: decodeIssue(value.issue, {
      relationships,
      verifications,
      externalLinks,
      repositoryFullName: repository?.fullName,
    }),
    events: value.events.map(decodeEvent),
    relationships,
    verifications,
    externalLinks,
    repository,
  };
}

export function decodeRelationshipResponse(
  value: unknown,
): RelationshipResponse {
  if (!isRecord(value)) throw new TypeError("relationship response is invalid");
  return { relationship: decodeRelationship(value.relationship) };
}

export function decodeDetachedRelationshipResponse(
  value: unknown,
): DetachedRelationshipResponse {
  if (!isRecord(value)) throw new TypeError("detach response is invalid");
  return { detached: readPositiveInteger(value.detached, "detached") };
}

export function decodeVerificationResponse(
  value: unknown,
): VerificationResponse {
  if (!isRecord(value)) throw new TypeError("verification response is invalid");
  return { verification: decodeVerification(value.verification) };
}

export function decodeGitHubLinkResponse(value: unknown): GitHubLinkResponse {
  if (!isRecord(value)) throw new TypeError("GitHub link response is invalid");
  return {
    link: value.link === null ? null : decodeExternalLink(value.link),
    command: value.command === null ? null : decodeGitHubCommand(value.command),
  };
}

export function decodeRetryResponse(value: unknown): CountResponse {
  if (!isRecord(value)) throw new TypeError("retry response is invalid");
  return { retried: readPositiveInteger(value.retried, "retried") };
}

export function decodeUnlinkResponse(value: unknown): CountResponse {
  if (!isRecord(value)) throw new TypeError("unlink response is invalid");
  return { unlinked: readPositiveInteger(value.unlinked, "unlinked") };
}

export function decodeIssueSummary(value: unknown): IssueSummary {
  if (!isRecord(value) || !isRecord(value.range)) {
    throw new TypeError("issue summary response is invalid");
  }
  const createdFrom = readNullableTimestamp(value.range.createdFrom);
  const createdTo = readNullableTimestamp(value.range.createdTo);
  const durationMs = value.range.durationMs;
  if (
    createdFrom === undefined ||
    createdTo === undefined ||
    (durationMs !== null &&
      (typeof durationMs !== "number" ||
        !Number.isFinite(durationMs) ||
        durationMs < 0))
  ) {
    throw new TypeError("issue summary range is invalid");
  }
  return {
    range: { createdFrom, createdTo, durationMs },
    created: decodeSummarySet(value.created),
    fixed: decodeSummarySet(value.fixed),
    fixedAndVerified: decodeSummarySet(value.fixedAndVerified),
    nonFixed: decodeSummarySet(value.nonFixed),
    mergedUnverified: decodeSummarySet(value.mergedUnverified),
    deployedUnverified: decodeSummarySet(value.deployedUnverified),
  };
}

function decodeIssue(
  value: unknown,
  projections?: Pick<
    Issue,
    "relationships" | "verifications" | "externalLinks" | "repositoryFullName"
  >,
): Issue {
  if (!isRecord(value)) throw new TypeError("issue is invalid");
  const title = readNullableString(value.title, 500);
  const resolutionDisposition = readNullableChoice(
    value.resolutionDisposition,
    issueDispositions,
  );
  const resolutionNote = readNullableString(value.resolutionNote, 2_000);
  const state = readChoice(value.state, issueStates);
  const repositoryFullName =
    projections?.repositoryFullName ??
    readOptionalString(value.repositoryFullName, 255);
  if (
    title === undefined ||
    resolutionDisposition === undefined ||
    resolutionNote === undefined ||
    state == null
  ) {
    throw new TypeError("issue is invalid");
  }
  return {
    id: readUuid(value.id),
    githubRepositoryId: readUuid(value.githubRepositoryId),
    title,
    description: readString(value.description, 20_000, false),
    state,
    resolutionDisposition,
    resolutionNote,
    version: readPositiveInteger(value.version, "version"),
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
    ...(repositoryFullName == null ? {} : { repositoryFullName }),
    relationships:
      projections?.relationships ??
      decodeOptionalArray(value.relationships, decodeRelationship),
    verifications:
      projections?.verifications ??
      decodeOptionalArray(value.verifications, decodeVerification),
    externalLinks:
      projections?.externalLinks ??
      decodeOptionalArray(value.externalLinks, decodeExternalLink),
  };
}

function decodeRelationship(value: unknown): IssueRelationship {
  if (!isRecord(value)) throw new TypeError("issue relationship is invalid");
  const role = readChoice(value.role, issueRelationshipRoles);
  const sessionTitle = readOptionalNullableString(value.sessionTitle, 500);
  const sessionStatus = readOptionalString(value.sessionStatus, 100);
  if (role == null || sessionTitle === undefined) {
    throw new TypeError("issue relationship is invalid");
  }
  return {
    id: readUuid(value.id),
    issueId: readUuid(value.issueId),
    sessionId: readUuid(value.sessionId),
    role,
    ...(sessionTitle === absent ? {} : { sessionTitle }),
    ...(sessionStatus == null ? {} : { sessionStatus }),
    createdAt: readTimestamp(value.createdAt),
    detachedAt: readNullableTimestampRequired(value.detachedAt),
  };
}

function decodeVerification(value: unknown): IssueVerification {
  if (!isRecord(value)) throw new TypeError("issue verification is invalid");
  const result = readChoice(value.result, issueVerificationResults);
  const note = readNullableString(value.note, 2_000);
  if (result == null || note === undefined) {
    throw new TypeError("issue verification is invalid");
  }
  return {
    id: readUuid(value.id),
    issueId: readUuid(value.issueId),
    resolutionEventId: readUuid(value.resolutionEventId),
    sessionId: readNullableUuid(value.sessionId),
    deploymentEvidenceId: readNullableUuid(value.deploymentEvidenceId),
    environment: readString(value.environment, 80, false),
    result,
    note,
    verifiedAt: readTimestamp(value.verifiedAt),
  };
}

function decodeExternalLink(value: unknown): ExternalIssueLink {
  if (!isRecord(value)) throw new TypeError("external issue link is invalid");
  const externalTitle = readNullableString(value.externalTitle, 2_000);
  const externalStateCategory = readNullableString(
    value.externalStateCategory,
    200,
  );
  if (externalTitle === undefined || externalStateCategory === undefined) {
    throw new TypeError("external issue link is invalid");
  }
  return {
    id: readUuid(value.id),
    issueId: readUuid(value.issueId),
    provider: readString(value.provider, 100, false),
    externalScopeId: readString(value.externalScopeId, 500, false),
    externalIssueId: readString(value.externalIssueId, 500, false),
    externalKey: readString(value.externalKey, 500, false),
    url: readHttpsUrl(value.url),
    externalTitle,
    externalStateCategory,
    syncState: readString(value.syncState, 100, false),
    lifecycleSyncState: readString(value.lifecycleSyncState, 100, false),
  };
}

function decodeGitHubCommand(value: unknown): GitHubCommand {
  if (!isRecord(value)) throw new TypeError("GitHub command is invalid");
  const operation = readChoice(value.operation, [
    "create",
    "close",
    "reopen",
    "add_reference",
  ] as const);
  const state = readChoice(value.state, [
    "pending",
    "leased",
    "retrying",
    "succeeded",
    "failed",
    "ambiguous",
    "paused",
  ] as const);
  if (operation == null || state == null) {
    throw new TypeError("GitHub command is invalid");
  }
  return {
    id: readUuid(value.id),
    issueId: readUuid(value.issueId),
    provider: readString(value.provider, 100, false),
    operation,
    state,
  };
}

function decodeEvent(value: unknown): IssueEvent {
  if (!isRecord(value)) throw new TypeError("issue event is invalid");
  const origin = readChoice(value.origin, [
    "local",
    "provider",
    "system",
  ] as const);
  if (origin == null) throw new TypeError("issue event is invalid");
  return {
    id: readUuid(value.id),
    issueId: readUuid(value.issueId),
    eventType: readString(value.eventType, 200, false),
    origin,
    createdAt: readTimestamp(value.createdAt),
  };
}

function decodeRepository(value: unknown): IssueRepository {
  if (!isRecord(value)) throw new TypeError("issue repository is invalid");
  return {
    id: readUuid(value.id),
    fullName: readString(value.fullName, 255, false),
    defaultBranch: readString(value.defaultBranch, 255, false),
  };
}

function decodeSummarySet(value: unknown): IssueSummarySet {
  if (!isRecord(value) || !Array.isArray(value.issueIds)) {
    throw new TypeError("issue summary set is invalid");
  }
  const issueIds = value.issueIds.map(readUuid);
  const count = readNonnegativeInteger(value.count, "count");
  if (count !== issueIds.length || new Set(issueIds).size !== issueIds.length) {
    throw new TypeError("issue summary set is inconsistent");
  }
  return { count, issueIds };
}

function decodeOptionalArray<T>(
  value: unknown,
  decode: (item: unknown) => T,
): readonly T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("issue projection is invalid");
  return value.map(decode);
}

const absent = Symbol("absent");

function readOptionalNullableString(
  value: unknown,
  maximumLength: number,
): string | null | typeof absent | undefined {
  if (value === undefined) return absent;
  return readNullableString(value, maximumLength);
}

function readNullableString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.length <= maximumLength
    ? value
    : undefined;
}

function readOptionalString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return readString(value, maximumLength, false);
}

function readString(
  value: unknown,
  maximumLength: number,
  allowEmpty: boolean,
): string {
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new TypeError("string field is invalid");
  }
  return value;
}

function readUuid(value: unknown): string {
  const text = readString(value, 36, false);
  if (!uuidPattern.test(text)) throw new TypeError("UUID field is invalid");
  return text;
}

function readNullableUuid(value: unknown): string | null {
  return value === null ? null : readUuid(value);
}

function readTimestamp(value: unknown): string {
  const text = readString(value, 80, false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(text)) {
    throw new TypeError("timestamp field is invalid");
  }
  try {
    new Date(text).toISOString();
  } catch {
    throw new TypeError("timestamp field is invalid");
  }
  return text;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return readTimestamp(value);
}

function readNullableTimestampRequired(value: unknown): string | null {
  const result = readNullableTimestamp(value);
  if (result === undefined) throw new TypeError("timestamp field is invalid");
  return result;
}

function readChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] | null {
  return typeof value === "string" && choices.includes(value) ? value : null;
}

function readNullableChoice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] | null | undefined {
  if (value === null) return null;
  return readChoice(value, choices) ?? undefined;
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} is invalid`);
  }
  return value;
}

function readNonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} is invalid`);
  }
  return value;
}

function readHttpsUrl(value: unknown): string {
  const text = readString(value, 2_048, false);
  const url = new URL(text);
  if (url.protocol !== "https:") throw new TypeError("URL field is invalid");
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
