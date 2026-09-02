import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/request.js";
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
} from "./api.js";

const issueId = "11111111-1111-4111-8111-111111111111";
const repositoryId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const relationshipId = "44444444-4444-4444-8444-444444444444";
const resolutionEventId = "55555555-5555-4555-8555-555555555555";
const verificationId = "66666666-6666-4666-8666-666666666666";
const linkId = "77777777-7777-4777-8777-777777777777";
const commandId = "88888888-8888-4888-8888-888888888888";

describe("issue API", () => {
  it("maps list, create, detail, update, lifecycle, and summary calls", async () => {
    const fetch = createFetch([
      { issues: [createIssueRecord()] },
      { issue: createIssueRecord(), titlingState: "ready" },
      createDetailResponse(),
      { issue: createIssueRecord({ version: 2 }) },
      {
        issue: createIssueRecord({
          state: "resolved",
          resolutionDisposition: "fixed",
          version: 3,
        }),
      },
      { issue: createIssueRecord({ version: 4 }) },
      createSummaryResponse(),
    ]);
    const runtime = createRuntime(fetch);

    await listIssues({
      ...runtime,
      repositoryId,
      state: "open",
    });
    await createIssue({
      ...runtime,
      repositoryId,
      description: "Production checkout fails.",
      title: "Checkout failure",
      type: "bug",
      priority: "high",
      mirrorToGitHub: true,
      idempotencyKey: "issue-key",
    });
    await getIssue({ ...runtime, issueId });
    await updateIssue({
      ...runtime,
      issueId,
      version: 1,
      title: "Updated title",
      categorization: {
        type: "bug",
        priority: "high",
      },
    });
    await resolveIssue({
      ...runtime,
      issueId,
      version: 2,
      disposition: "fixed",
      note: "Shipped",
    });
    await reopenIssue({ ...runtime, issueId, version: 3 });
    await summarizeIssues({
      ...runtime,
      repositoryId,
      createdFrom: "2026-08-01T00:00:00.000Z",
      createdTo: "2026-08-18T23:59:59.000Z",
    });

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      [
        "GET",
        `https://api.toughcrowd.dev/api/issues?repositoryId=${repositoryId}&state=open`,
      ],
      ["POST", "https://api.toughcrowd.dev/api/issues"],
      ["GET", `https://api.toughcrowd.dev/api/issues/${issueId}`],
      ["PATCH", `https://api.toughcrowd.dev/api/issues/${issueId}`],
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/resolution`],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/resolution?version=3`,
      ],
      [
        "GET",
        `https://api.toughcrowd.dev/api/issues/summary?repositoryId=${repositoryId}&createdFrom=2026-08-01T00%3A00%3A00.000Z&createdTo=2026-08-18T23%3A59%3A59.000Z`,
      ],
    ]);
    expect(fetch.calls[1].idempotencyKey).toBe("issue-key");
    expect(fetch.calls[1].body).toEqual({
      repositoryId,
      description: "Production checkout fails.",
      title: "Checkout failure",
      type: "bug",
      priority: "high",
      mirrorToGitHub: true,
    });
    expect(fetch.calls[3].body).toEqual({
      version: 1,
      title: "Updated title",
      categorization: {
        type: "bug",
        priority: "high",
      },
    });
    expect(fetch.calls[4].body).toEqual({
      version: 2,
      disposition: "fixed",
      note: "Shipped",
    });
  });

  it("maps comment creation with an idempotency key and optional session", async () => {
    const fetch = createFetch(
      [
        { comment: createComment() },
        {
          comment: createComment({
            session: { id: sessionId, title: "Race investigation" },
          }),
        },
      ],
      201,
    );
    const runtime = createRuntime(fetch);
    await createIssueComment({
      ...runtime,
      issueId,
      body: "Observed",
      idempotencyKey: "comment-key",
    });
    await createIssueComment({
      ...runtime,
      issueId,
      body: "Linked",
      sessionId,
      idempotencyKey: "comment-key-2",
    });
    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/comments`],
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/comments`],
    ]);
    expect(fetch.calls[0]).toMatchObject({
      idempotencyKey: "comment-key",
      body: { body: "Observed" },
    });
    expect(fetch.calls[1].body).toEqual({ body: "Linked", sessionId });
  });

  it("maps verification, relationship, and GitHub link calls", async () => {
    const fetch = createFetch([
      { verification: createVerification() },
      { relationship: createRelationship() },
      { detached: 1 },
      { link: null, command: createGitHubCommand() },
      { link: createExternalLink(), command: null },
      { retried: 2 },
      { unlinked: 1 },
    ]);
    const runtime = createRuntime(fetch);

    await verifyIssue({
      ...runtime,
      issueId,
      version: 4,
      result: "passed",
      environment: "production",
      note: "Checked canary",
      sessionId,
      deploymentEvidenceId: relationshipId,
    });
    await attachIssueSession({
      ...runtime,
      issueId,
      sessionId,
      version: 5,
      role: "implemented",
    });
    await detachIssueSession({
      ...runtime,
      issueId,
      sessionId,
      version: 6,
    });
    await mirrorIssueToGitHub({ ...runtime, issueId });
    await adoptGitHubIssue({
      ...runtime,
      issueId,
      externalScopeId: "123",
      externalIssueId: "456",
      externalKey: "#42",
      url: "https://github.com/acme/web/issues/42",
      externalTitle: "GitHub title",
      stateCategory: "open",
      providerState: { locked: false },
    });
    await retryGitHubIssue({ ...runtime, issueId });
    await unlinkGitHubIssue({ ...runtime, issueId });

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/verifications`,
      ],
      ["POST", `https://api.toughcrowd.dev/api/issues/${issueId}/sessions`],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/sessions/${sessionId}?version=6`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github/adopt`,
      ],
      [
        "POST",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github/retry`,
      ],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/issues/${issueId}/external-links/github`,
      ],
    ]);
    expect(fetch.calls[0].body).toEqual({
      version: 4,
      result: "passed",
      environment: "production",
      note: "Checked canary",
      sessionId,
      deploymentEvidenceId: relationshipId,
    });
    expect(fetch.calls[4].body).toEqual({
      externalScopeId: "123",
      externalIssueId: "456",
      externalKey: "#42",
      url: "https://github.com/acme/web/issues/42",
      externalTitle: "GitHub title",
      stateCategory: "open",
      providerState: { locked: false },
    });
  });
});

function createRuntime(fetch: FetchLike) {
  return {
    apiOrigin: "https://api.toughcrowd.dev",
    authorization: "Bearer tc_secret",
    signal: new AbortController().signal,
    clientVersion: "0.4.0-test",
    fetch,
  };
}

function createIssueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    githubRepositoryId: repositoryId,
    title: "Checkout failure",
    description: "Production checkout fails.",
    type: "task",
    priority: null,
    state: "open",
    resolutionDisposition: null,
    resolutionNote: null,
    version: 1,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:01:02.000Z",
    repositoryFullName: "acme/web",
    relationships: [],
    verifications: [],
    externalLinks: [],
    ...overrides,
  };
}

function createRelationship() {
  return {
    id: relationshipId,
    issueId,
    sessionId,
    role: "implemented",
    createdAt: "2026-08-18T20:02:00.000Z",
    detachedAt: null,
  };
}

function createVerification() {
  return {
    id: verificationId,
    issueId,
    resolutionEventId,
    sessionId,
    deploymentEvidenceId: relationshipId,
    environment: "production",
    result: "passed",
    note: "Checked canary",
    verifiedAt: "2026-08-18T20:03:00.000Z",
  };
}

function createExternalLink() {
  return {
    id: linkId,
    issueId,
    provider: "github",
    externalScopeId: "123",
    externalIssueId: "456",
    externalKey: "#42",
    url: "https://github.com/acme/web/issues/42",
    externalTitle: "GitHub title",
    externalStateCategory: "open",
    syncState: "synced",
    lifecycleSyncState: "in_sync",
  };
}

function createGitHubCommand() {
  return {
    id: commandId,
    issueId,
    provider: "github",
    operation: "create",
    state: "pending",
  };
}

function createDetailResponse() {
  return {
    issue: createIssueRecord(),
    events: [
      {
        id: resolutionEventId,
        issueId,
        eventType: "issue.created",
        origin: "local",
        createdAt: "2026-08-18T20:01:02.000Z",
      },
    ],
    relationships: [createRelationship()],
    verifications: [createVerification()],
    externalLinks: [createExternalLink()],
    comments: [],
    commentCapacity: {
      count: 0,
      countLimit: 500,
      serializedBodyBytes: 0,
      serializedBodyBytesLimit: 2_000_000,
      acceptingComments: true,
    },
    repository: {
      id: repositoryId,
      fullName: "acme/web",
      defaultBranch: "main",
    },
  };
}

function createComment(overrides: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    issueId,
    body: "Observed",
    createdAt: "2026-08-18T20:04:00.000Z",
    createdBy: { id: repositoryId, name: "Ada" },
    submittedVia: { type: "browser" },
    session: null,
    ...overrides,
  };
}

function createSummaryResponse() {
  const set = { count: 1, issueIds: [issueId] };
  const empty = { count: 0, issueIds: [] };
  return {
    range: {
      createdFrom: "2026-08-01T00:00:00.000Z",
      createdTo: "2026-08-18T23:59:59.000Z",
      durationMs: 1_555_199_000,
    },
    created: set,
    fixed: set,
    fixedAndVerified: set,
    nonFixed: empty,
    mergedUnverified: empty,
    deployedUnverified: empty,
  };
}

interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
  idempotencyKey?: string;
}

function createFetch(
  responses: readonly unknown[],
  status = 200,
): FetchLike & {
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImplementation = ((url: URL, init: RequestInit) => {
    const body: unknown =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      url: url.toString(),
      method: init.method ?? "GET",
      ...(body === undefined ? {} : { body }),
      idempotencyKey:
        new Headers(init.headers).get("idempotency-key") ?? undefined,
    });
    const responseBody = responses[calls.length - 1];
    return Promise.resolve(
      new Response(JSON.stringify(responseBody), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as FetchLike & { calls: FetchCall[] };
  fetchImplementation.calls = calls;
  return fetchImplementation;
}
