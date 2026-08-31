import { ApiClientError } from "../api/errors.js";
import { apiKeyEnvironmentVariable } from "../auth/credentials.js";
import { AuthCommandError } from "../auth/errors.js";
import {
  adoptGitHubIssue,
  attachIssueSession,
  createIssue,
  createIssueComment,
  detachIssueSession,
  getIssue,
  listIssues,
  mirrorIssueToGitHub,
  reopenIssue,
  resolveIssue,
  retryGitHubIssue,
  summarizeIssues,
  unlinkGitHubIssue,
  updateIssue,
  verifyIssue,
  type AdoptGitHubIssueRequest,
  type AttachIssueSessionRequest,
  type CreateIssueRequest,
  type CreateIssueCommentRequest,
  type ListIssuesRequest,
  type ResolveIssueRequest,
  type SummarizeIssuesRequest,
  type UpdateIssueRequest,
  type VerifyIssueRequest,
} from "./api.js";
import { IssueCommandError } from "./errors.js";
import {
  printCount,
  printCreatedIssue,
  printCreatedIssueComment,
  printDetachedRelationship,
  printGitHubLink,
  printIssueDetail,
  printIssueList,
  printIssueSummary,
  printRelationship,
  printUpdatedIssue,
  printVerification,
} from "./output.js";
import {
  resolveAuthenticatedIssueApiRuntime,
  type IssueRuntime,
} from "./runtime.js";

interface JsonOption {
  json?: boolean;
}

export type ListIssueCommandOptions = ListIssuesRequest & JsonOption;
export type CreateIssueCommandOptions = Omit<
  CreateIssueRequest,
  "idempotencyKey"
> &
  JsonOption;
export type CommentIssueCommandOptions = Omit<
  CreateIssueCommentRequest,
  "idempotencyKey"
> &
  JsonOption;
export type ShowIssueCommandOptions = { issueId: string } & JsonOption;
export type UpdateIssueCommandOptions = UpdateIssueRequest & JsonOption;
export type ResolveIssueCommandOptions = ResolveIssueRequest & JsonOption;
export type ReopenIssueCommandOptions = {
  issueId: string;
  version: number;
} & JsonOption;
export type VerifyIssueCommandOptions = VerifyIssueRequest & JsonOption;
export type AttachIssueSessionCommandOptions = AttachIssueSessionRequest &
  JsonOption;
export type DetachIssueSessionCommandOptions = {
  issueId: string;
  sessionId: string;
  version: number;
} & JsonOption;
export type MirrorGitHubIssueCommandOptions = { issueId: string } & JsonOption;
export type AdoptGitHubIssueCommandOptions = AdoptGitHubIssueRequest &
  JsonOption;
export type RetryGitHubIssueCommandOptions = { issueId: string } & JsonOption;
export type UnlinkGitHubIssueCommandOptions = { issueId: string } & JsonOption;
export type SummarizeIssueCommandOptions = SummarizeIssuesRequest & JsonOption;

export interface CreateIssueRuntime extends IssueRuntime {
  createIdempotencyKey(): string;
}

export async function listIssueCommand(
  runtime: IssueRuntime,
  options: ListIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("list issues", runtime, async (apiRuntime) => {
    const result = await listIssues({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printIssueList(runtime.stdout, result, options.json === true);
  });
}

export async function createIssueCommand(
  runtime: CreateIssueRuntime,
  options: CreateIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("create issue", runtime, async (apiRuntime) => {
    const idempotencyKey = readIdempotencyKey(runtime.createIdempotencyKey());
    const result = await createIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
      idempotencyKey,
    });
    printCreatedIssue(runtime.stdout, result, options.json === true);
  });
}

export async function commentIssueCommand(
  runtime: CreateIssueRuntime,
  options: CommentIssueCommandOptions,
): Promise<void> {
  await runIssueOperation(
    "create issue comment",
    runtime,
    async (apiRuntime) => {
      const body = validateCommentBody(options.body);
      const idempotencyKey = readIdempotencyKey(
        runtime.createIdempotencyKey(),
        "issue comment",
      );
      const result = await createIssueComment({
        ...issueApiRuntime(apiRuntime),
        ...options,
        body,
        idempotencyKey,
      });
      printCreatedIssueComment(runtime.stdout, result, options.json === true);
    },
  );
}

export async function showIssueCommand(
  runtime: IssueRuntime,
  options: ShowIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("show issue", runtime, async (apiRuntime) => {
    const result = await getIssue({
      ...issueApiRuntime(apiRuntime),
      issueId: options.issueId,
    });
    printIssueDetail(runtime.stdout, result, options.json === true);
  });
}

export async function updateIssueCommand(
  runtime: IssueRuntime,
  options: UpdateIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("update issue", runtime, async (apiRuntime) => {
    const result = await updateIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printUpdatedIssue(runtime.stdout, result, "updated", options.json === true);
  });
}

export async function resolveIssueCommand(
  runtime: IssueRuntime,
  options: ResolveIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("resolve issue", runtime, async (apiRuntime) => {
    const result = await resolveIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printUpdatedIssue(
      runtime.stdout,
      result,
      "resolved",
      options.json === true,
    );
  });
}

export async function reopenIssueCommand(
  runtime: IssueRuntime,
  options: ReopenIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("reopen issue", runtime, async (apiRuntime) => {
    const result = await reopenIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printUpdatedIssue(
      runtime.stdout,
      result,
      "reopened",
      options.json === true,
    );
  });
}

export async function verifyIssueCommand(
  runtime: IssueRuntime,
  options: VerifyIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("verify issue", runtime, async (apiRuntime) => {
    const result = await verifyIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printVerification(runtime.stdout, result, options.json === true);
  });
}

export async function attachIssueSessionCommand(
  runtime: IssueRuntime,
  options: AttachIssueSessionCommandOptions,
): Promise<void> {
  await runIssueOperation("attach session", runtime, async (apiRuntime) => {
    const result = await attachIssueSession({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printRelationship(runtime.stdout, result, options.json === true);
  });
}

export async function detachIssueSessionCommand(
  runtime: IssueRuntime,
  options: DetachIssueSessionCommandOptions,
): Promise<void> {
  await runIssueOperation("detach session", runtime, async (apiRuntime) => {
    const result = await detachIssueSession({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printDetachedRelationship(runtime.stdout, result, options.json === true);
  });
}

export async function mirrorGitHubIssueCommand(
  runtime: IssueRuntime,
  options: MirrorGitHubIssueCommandOptions,
): Promise<void> {
  await runIssueOperation(
    "mirror issue to GitHub",
    runtime,
    async (apiRuntime) => {
      const result = await mirrorIssueToGitHub({
        ...issueApiRuntime(apiRuntime),
        issueId: options.issueId,
      });
      printGitHubLink(
        runtime.stdout,
        result,
        "mirror requested",
        options.json === true,
      );
    },
  );
}

export async function adoptGitHubIssueCommand(
  runtime: IssueRuntime,
  options: AdoptGitHubIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("adopt GitHub issue", runtime, async (apiRuntime) => {
    const result = await adoptGitHubIssue({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printGitHubLink(runtime.stdout, result, "adopted", options.json === true);
  });
}

export async function retryGitHubIssueCommand(
  runtime: IssueRuntime,
  options: RetryGitHubIssueCommandOptions,
): Promise<void> {
  await runIssueOperation(
    "retry GitHub issue sync",
    runtime,
    async (apiRuntime) => {
      const result = await retryGitHubIssue({
        ...issueApiRuntime(apiRuntime),
        issueId: options.issueId,
      });
      printCount(
        runtime.stdout,
        result,
        "retried",
        "GitHub commands retried",
        options.json === true,
      );
    },
  );
}

export async function unlinkGitHubIssueCommand(
  runtime: IssueRuntime,
  options: UnlinkGitHubIssueCommandOptions,
): Promise<void> {
  await runIssueOperation(
    "unlink GitHub issue",
    runtime,
    async (apiRuntime) => {
      const result = await unlinkGitHubIssue({
        ...issueApiRuntime(apiRuntime),
        issueId: options.issueId,
      });
      printCount(
        runtime.stdout,
        result,
        "unlinked",
        "GitHub links removed",
        options.json === true,
      );
    },
  );
}

export async function summarizeIssueCommand(
  runtime: IssueRuntime,
  options: SummarizeIssueCommandOptions,
): Promise<void> {
  await runIssueOperation("summarize issues", runtime, async (apiRuntime) => {
    const result = await summarizeIssues({
      ...issueApiRuntime(apiRuntime),
      ...options,
    });
    printIssueSummary(runtime.stdout, result, options.json === true);
  });
}

async function runIssueOperation(
  operation: string,
  runtime: IssueRuntime,
  execute: (
    apiRuntime: Awaited<ReturnType<typeof resolveAuthenticatedIssueApiRuntime>>,
  ) => Promise<void>,
): Promise<void> {
  try {
    await execute(await resolveAuthenticatedIssueApiRuntime(runtime));
  } catch (error) {
    throw formatIssueFailure(operation, error);
  }
}

function readIdempotencyKey(value: string, subject = "issue"): string {
  const key = value.trim();
  if (key.length === 0 || key.length > 200) {
    throw new IssueCommandError(
      `Could not create ${subject}: failed to generate an idempotency key.`,
    );
  }
  return key;
}

function validateCommentBody(value: string): string {
  const body = value.trim();
  if (body.length === 0) {
    throw new IssueCommandError(
      "Could not create issue comment: comment body must not be empty.",
    );
  }
  if (body.length > 10_000) {
    throw new IssueCommandError(
      "Could not create issue comment: comment body must be at most 10,000 characters.",
    );
  }
  if (Buffer.byteLength(body, "utf8") > 40_000) {
    throw new IssueCommandError(
      "Could not create issue comment: comment body must be at most 40,000 UTF-8 bytes.",
    );
  }
  return body;
}

function issueApiRuntime(
  runtime: Awaited<ReturnType<typeof resolveAuthenticatedIssueApiRuntime>>,
) {
  return {
    apiOrigin: runtime.apiOrigin,
    authorization: runtime.authorization,
    signal: runtime.signal,
    clientVersion: runtime.version,
    fetch: runtime.fetch,
    timers: runtime.timers,
  };
}

function formatIssueFailure(operation: string, error: unknown): Error {
  if (error instanceof IssueCommandError || error instanceof AuthCommandError) {
    return error;
  }
  if (error instanceof ApiClientError) {
    if (error.kind === "canceled") {
      return new IssueCommandError(`Issue operation canceled.`, 130);
    }
    if (error.kind === "timeout") {
      return new IssueCommandError(
        `Could not ${operation}: the API request timed out.`,
      );
    }
    if (error.kind === "network") {
      return new IssueCommandError(
        `Could not ${operation}: could not reach the Tough Crowd API.`,
      );
    }
    if (
      error.kind === "api" &&
      (error.status === 401 || error.code === "authentication-required")
    ) {
      return new IssueCommandError(
        `Authentication failed: ${error.message} Run \`toughcrowd auth login\` or set ${apiKeyEnvironmentVariable}.`,
      );
    }
    if (error.status != null && error.status >= 500) {
      return new IssueCommandError(
        `Could not ${operation}: the Tough Crowd API returned an internal error.`,
      );
    }
    if (error.kind === "api") {
      return new IssueCommandError(`Could not ${operation}: ${error.message}`);
    }
  }
  return new IssueCommandError(
    `Could not ${operation}: the Tough Crowd API returned an invalid response.`,
  );
}
