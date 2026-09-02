import { describe, expect, it } from "vitest";
import {
  decodeDetachedRelationshipResponse,
  decodeIssueDetail,
  decodeIssueList,
  decodeIssueSummary,
  decodeRetryResponse,
  decodeUnlinkResponse,
} from "./types.js";

const issueId = "11111111-1111-4111-8111-111111111111";
const repositoryId = "22222222-2222-4222-8222-222222222222";

describe("issue response decoding", () => {
  it("keeps only bounded client-facing issue fields", () => {
    const result = decodeIssueList({
      issues: [
        {
          ...createIssue(),
          userId: "33333333-3333-4333-8333-333333333333",
          createdByUserId: "44444444-4444-4444-8444-444444444444",
          providerState: { secret: "server-only" },
        },
      ],
    });

    expect(result.issues[0]).toEqual(createIssue());
    expect(result.issues[0]).not.toHaveProperty("userId");
    expect(result.issues[0]).not.toHaveProperty("providerState");
  });

  it("rejects invalid and duplicate issue identities", () => {
    expect(() =>
      decodeIssueList({ issues: [{ ...createIssue(), id: "not-a-uuid" }] }),
    ).toThrow("UUID field is invalid");
    expect(() =>
      decodeIssueList({ issues: [createIssue(), createIssue()] }),
    ).toThrow("issue list contains duplicate issues");
  });

  it("rejects summary counts that do not match their literal issue IDs", () => {
    const empty = { count: 0, issueIds: [] };
    expect(() =>
      decodeIssueSummary({
        range: { createdFrom: null, createdTo: null, durationMs: null },
        created: { count: 2, issueIds: [issueId] },
        fixed: empty,
        fixedAndVerified: empty,
        nonFixed: empty,
        mergedUnverified: empty,
        deployedUnverified: empty,
      }),
    ).toThrow("issue summary set is inconsistent");
  });

  it("accepts zero-count mutation responses", () => {
    expect(decodeDetachedRelationshipResponse({ detached: 0 })).toEqual({
      detached: 0,
    });
    expect(decodeRetryResponse({ retried: 0 })).toEqual({ retried: 0 });
    expect(decodeUnlinkResponse({ unlinked: 0 })).toEqual({ unlinked: 0 });
  });

  it("sanitizes issue detail instead of forwarding arbitrary event payloads", () => {
    const result = decodeIssueDetail({
      issue: createIssue(),
      events: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          issueId,
          eventType: "issue.created",
          origin: "local",
          createdAt: "2026-08-18T20:01:02.000Z",
          payload: { credential: "must-not-leak" },
        },
      ],
      relationships: [],
      verifications: [],
      externalLinks: [],
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
    });

    expect(result.events[0]).toEqual({
      id: "55555555-5555-4555-8555-555555555555",
      issueId,
      eventType: "issue.created",
      origin: "local",
      createdAt: "2026-08-18T20:01:02.000Z",
    });
    expect(result.events[0]).not.toHaveProperty("payload");
  });

  it("validates issue comments and capacity metadata", () => {
    const comment = {
      id: "55555555-5555-4555-8555-555555555555",
      issueId,
      body: "A comment",
      createdAt: "2026-08-18T20:01:02.000Z",
      createdBy: { id: repositoryId, name: "Ada" },
      submittedVia: { type: "api_key", name: "CI" },
      session: { id: repositoryId, title: null },
    };
    const detail = {
      issue: createIssue(),
      events: [],
      relationships: [],
      verifications: [],
      externalLinks: [],
      comments: [comment],
      commentCapacity: {
        count: 1,
        countLimit: 500,
        serializedBodyBytes: 42,
        serializedBodyBytesLimit: 2_000_000,
        acceptingComments: true,
      },
      repository: null,
    };
    expect(decodeIssueDetail(detail).comments[0]).toEqual(comment);
    expect(() =>
      decodeIssueDetail({
        ...detail,
        comments: [comment, comment],
        commentCapacity: { ...detail.commentCapacity, count: 2 },
      }),
    ).toThrow("issue comments are inconsistent");
    expect(() =>
      decodeIssueDetail({
        ...detail,
        comments: [{ ...comment, issueId: repositoryId }],
      }),
    ).toThrow("issue comments are inconsistent");
    expect(() =>
      decodeIssueDetail({
        ...detail,
        commentCapacity: { ...detail.commentCapacity, count: 2 },
      }),
    ).toThrow("issue comments are inconsistent");
  });
});

function createIssue() {
  return {
    id: issueId,
    githubRepositoryId: repositoryId,
    title: "Checkout failure",
    description: "Production checkout fails.",
    type: "task" as const,
    priority: null,
    state: "open" as const,
    resolutionDisposition: null,
    resolutionNote: null,
    version: 1,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:01:02.000Z",
    repositoryFullName: "acme/web",
    relationships: [],
    verifications: [],
    externalLinks: [],
  };
}
