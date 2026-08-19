import {
  requestJson,
  type JsonValue,
  type RequestJsonOptions,
} from "../api/request.js";
import {
  decodeCreateIssueResponse,
  decodeDetachedRelationshipResponse,
  decodeGitHubLinkResponse,
  decodeIssueDetail,
  decodeIssueList,
  decodeIssueResponse,
  decodeIssueSummary,
  decodeRelationshipResponse,
  decodeRetryResponse,
  decodeUnlinkResponse,
  decodeVerificationResponse,
  type CountResponse,
  type CreateIssueResponse,
  type DetachedRelationshipResponse,
  type GitHubLinkResponse,
  type IssueDetail,
  type IssueDisposition,
  type IssueList,
  type IssueRelationshipRole,
  type IssueResponse,
  type IssueState,
  type IssueSummary,
  type IssueVerificationResult,
  type RelationshipResponse,
  type VerificationResponse,
} from "./types.js";

interface IssueApiRuntime<T> {
  apiOrigin: string;
  authorization: string;
  signal: AbortSignal;
  clientVersion: string;
  fetch?: RequestJsonOptions<T>["fetch"];
  timers?: RequestJsonOptions<T>["timers"];
}

export interface ListIssuesRequest {
  repositoryId?: string;
  state?: IssueState;
}

export function listIssues(
  options: IssueApiRuntime<IssueList> & ListIssuesRequest,
): Promise<IssueList> {
  const query = new URLSearchParams();
  if (options.repositoryId != null) {
    query.set("repositoryId", options.repositoryId);
  }
  if (options.state != null) query.set("state", options.state);
  return issueRequest(options, {
    method: "GET",
    path: withQuery("/api/issues", query),
    decode: decodeIssueList,
  });
}

export interface CreateIssueRequest {
  repositoryId: string;
  description: string;
  title?: string;
  mirrorToGitHub?: boolean;
  idempotencyKey: string;
}

export function createIssue(
  options: IssueApiRuntime<CreateIssueResponse> & CreateIssueRequest,
): Promise<CreateIssueResponse> {
  return issueRequest(options, {
    method: "POST",
    path: "/api/issues",
    idempotencyKey: options.idempotencyKey,
    body: {
      repositoryId: options.repositoryId,
      description: options.description,
      ...(options.title == null ? {} : { title: options.title }),
      mirrorToGitHub: options.mirrorToGitHub === true,
    },
    decode: decodeCreateIssueResponse,
  });
}

export function getIssue(
  options: IssueApiRuntime<IssueDetail> & { issueId: string },
): Promise<IssueDetail> {
  return issueRequest(options, {
    method: "GET",
    path: issuePath(options.issueId),
    decode: decodeIssueDetail,
  });
}

export interface UpdateIssueRequest {
  issueId: string;
  version: number;
  title?: string;
  description?: string;
}

export function updateIssue(
  options: IssueApiRuntime<IssueResponse> & UpdateIssueRequest,
): Promise<IssueResponse> {
  return issueRequest(options, {
    method: "PATCH",
    path: issuePath(options.issueId),
    body: {
      version: options.version,
      ...(options.title == null ? {} : { title: options.title }),
      ...(options.description == null
        ? {}
        : { description: options.description }),
    },
    decode: decodeIssueResponse,
  });
}

export interface ResolveIssueRequest {
  issueId: string;
  version: number;
  disposition: IssueDisposition;
  note?: string;
}

export function resolveIssue(
  options: IssueApiRuntime<IssueResponse> & ResolveIssueRequest,
): Promise<IssueResponse> {
  return issueRequest(options, {
    method: "POST",
    path: `${issuePath(options.issueId)}/resolution`,
    body: {
      version: options.version,
      disposition: options.disposition,
      ...(options.note == null ? {} : { note: options.note }),
    },
    decode: decodeIssueResponse,
  });
}

export function reopenIssue(
  options: IssueApiRuntime<IssueResponse> & {
    issueId: string;
    version: number;
  },
): Promise<IssueResponse> {
  const query = new URLSearchParams({ version: String(options.version) });
  return issueRequest(options, {
    method: "DELETE",
    path: withQuery(`${issuePath(options.issueId)}/resolution`, query),
    decode: decodeIssueResponse,
  });
}

export interface VerifyIssueRequest {
  issueId: string;
  version: number;
  result: IssueVerificationResult;
  environment: string;
  note?: string;
  sessionId?: string;
  deploymentEvidenceId?: string;
}

export function verifyIssue(
  options: IssueApiRuntime<VerificationResponse> & VerifyIssueRequest,
): Promise<VerificationResponse> {
  return issueRequest(options, {
    method: "POST",
    path: `${issuePath(options.issueId)}/verifications`,
    body: {
      version: options.version,
      result: options.result,
      environment: options.environment,
      ...(options.note == null ? {} : { note: options.note }),
      ...(options.sessionId == null ? {} : { sessionId: options.sessionId }),
      ...(options.deploymentEvidenceId == null
        ? {}
        : { deploymentEvidenceId: options.deploymentEvidenceId }),
    },
    decode: decodeVerificationResponse,
  });
}

export interface AttachIssueSessionRequest {
  issueId: string;
  sessionId: string;
  version: number;
  role: IssueRelationshipRole;
}

export function attachIssueSession(
  options: IssueApiRuntime<RelationshipResponse> & AttachIssueSessionRequest,
): Promise<RelationshipResponse> {
  return issueRequest(options, {
    method: "POST",
    path: `${issuePath(options.issueId)}/sessions`,
    body: {
      sessionId: options.sessionId,
      version: options.version,
      role: options.role,
    },
    decode: decodeRelationshipResponse,
  });
}

export function detachIssueSession(
  options: IssueApiRuntime<DetachedRelationshipResponse> & {
    issueId: string;
    sessionId: string;
    version: number;
  },
): Promise<DetachedRelationshipResponse> {
  const query = new URLSearchParams({ version: String(options.version) });
  return issueRequest(options, {
    method: "DELETE",
    path: withQuery(
      `${issuePath(options.issueId)}/sessions/${encodeURIComponent(options.sessionId)}`,
      query,
    ),
    decode: decodeDetachedRelationshipResponse,
  });
}

export function mirrorIssueToGitHub(
  options: IssueApiRuntime<GitHubLinkResponse> & { issueId: string },
): Promise<GitHubLinkResponse> {
  return issueRequest(options, {
    method: "POST",
    path: githubLinkPath(options.issueId),
    decode: decodeGitHubLinkResponse,
  });
}

export interface AdoptGitHubIssueRequest {
  issueId: string;
  externalScopeId: string;
  externalIssueId: string;
  externalKey: string;
  url: string;
  externalTitle?: string;
  stateCategory?: string;
  providerState?: { readonly [key: string]: JsonValue };
}

export function adoptGitHubIssue(
  options: IssueApiRuntime<GitHubLinkResponse> & AdoptGitHubIssueRequest,
): Promise<GitHubLinkResponse> {
  return issueRequest(options, {
    method: "POST",
    path: `${githubLinkPath(options.issueId)}/adopt`,
    body: {
      externalScopeId: options.externalScopeId,
      externalIssueId: options.externalIssueId,
      externalKey: options.externalKey,
      url: options.url,
      ...(options.externalTitle == null
        ? {}
        : { externalTitle: options.externalTitle }),
      ...(options.stateCategory == null
        ? {}
        : { stateCategory: options.stateCategory }),
      ...(options.providerState == null
        ? {}
        : { providerState: options.providerState }),
    },
    decode: decodeGitHubLinkResponse,
  });
}

export function retryGitHubIssue(
  options: IssueApiRuntime<CountResponse> & { issueId: string },
): Promise<CountResponse> {
  return issueRequest(options, {
    method: "POST",
    path: `${githubLinkPath(options.issueId)}/retry`,
    decode: decodeRetryResponse,
  });
}

export function unlinkGitHubIssue(
  options: IssueApiRuntime<CountResponse> & { issueId: string },
): Promise<CountResponse> {
  return issueRequest(options, {
    method: "DELETE",
    path: githubLinkPath(options.issueId),
    decode: decodeUnlinkResponse,
  });
}

export interface SummarizeIssuesRequest {
  repositoryId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export function summarizeIssues(
  options: IssueApiRuntime<IssueSummary> & SummarizeIssuesRequest,
): Promise<IssueSummary> {
  const query = new URLSearchParams();
  if (options.repositoryId != null) {
    query.set("repositoryId", options.repositoryId);
  }
  if (options.createdFrom != null) {
    query.set("createdFrom", options.createdFrom);
  }
  if (options.createdTo != null) {
    query.set("createdTo", options.createdTo);
  }
  return issueRequest(options, {
    method: "GET",
    path: withQuery("/api/issues/summary", query),
    decode: decodeIssueSummary,
  });
}

function issueRequest<T>(
  runtime: IssueApiRuntime<T>,
  request: Pick<
    RequestJsonOptions<T>,
    "method" | "path" | "body" | "idempotencyKey" | "decode"
  >,
): Promise<T> {
  return requestJson({
    ...request,
    origin: runtime.apiOrigin,
    authorization: runtime.authorization,
    signal: runtime.signal,
    fetch: runtime.fetch,
    timers: runtime.timers,
    metadata: { cliVersion: runtime.clientVersion },
  });
}

function issuePath(issueId: string): string {
  return `/api/issues/${encodeURIComponent(issueId)}`;
}

function githubLinkPath(issueId: string): string {
  return `${issuePath(issueId)}/external-links/github`;
}

function withQuery(path: string, query: URLSearchParams): string {
  const encoded = query.toString();
  return encoded.length === 0 ? path : `${path}?${encoded}`;
}
