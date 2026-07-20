import { describe, expect, it } from "vitest";
import { decodeCreateSessionResponse, decodeSessionList } from "./types.js";

describe("decodeCreateSessionResponse", () => {
  it("decodes only the bounded public creation contract", () => {
    expect(
      decodeCreateSessionResponse({
        session: {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Fix checkout",
          status: "queued",
          repository: {
            fullName: "acme/web",
            privateServerField: "discarded",
          },
          agentProfile: {
            id: "codex-cli-default",
            name: "Codex CLI",
            model: "server-only",
          },
          initialPrompt: "discarded",
          events: [],
        },
      }),
    ).toEqual({
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "queued",
        repository: { fullName: "acme/web" },
        agentProfile: {
          id: "codex-cli-default",
          name: "Codex CLI",
        },
        title: "Fix checkout",
      },
    });
  });

  it.each([
    ["a non-object envelope", null],
    ["a missing session", {}],
    ["a malformed ID", createCreatedSessionResponse({ id: "not-a-uuid" })],
    ["an unknown status", createCreatedSessionResponse({ status: "waiting" })],
    [
      "a missing repository",
      createCreatedSessionResponse({ repository: null }),
    ],
    [
      "a malformed Agent Profile",
      createCreatedSessionResponse({ agentProfile: { id: "", name: "" } }),
    ],
    [
      "an overlong title",
      createCreatedSessionResponse({ title: "t".repeat(501) }),
    ],
  ])("rejects %s", (_description, value) => {
    expect(() => decodeCreateSessionResponse(value)).toThrow(TypeError);
  });
});

describe("decodeSessionList", () => {
  it("decodes only the bounded public list contract", () => {
    const result = decodeSessionList({
      sessions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Fix checkout",
          status: "running",
          repository: {
            fullName: "acme/web",
            privateServerField: "discarded",
          },
          createdAt: "2026-07-18T20:01:02.000Z",
          initialPrompt: "private from the CLI contract",
        },
      ],
      counts: createCounts({ all: 1, running: 1 }),
      pageInfo: {
        nextCursor: "opaque.cursor-value",
        hasMore: true,
      },
      serverOnly: true,
    });

    expect(result).toEqual({
      sessions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Fix checkout",
          status: "running",
          repository: { fullName: "acme/web" },
          createdAt: "2026-07-18T20:01:02.000Z",
        },
      ],
      counts: {
        all: 1,
        queued: 0,
        initializing: 0,
        running: 1,
        ready: 0,
        failed: 0,
        cancelled: 0,
        merged: 0,
        abandoned: 0,
        archived: 0,
      },
      pageInfo: {
        nextCursor: "opaque.cursor-value",
        hasMore: true,
      },
    });
  });

  it("accepts null titles and unavailable repositories", () => {
    const value = createValidList();
    value.sessions[0] = {
      ...value.sessions[0],
      title: null,
      repository: null,
      status: "cancelling",
    };

    expect(decodeSessionList(value).sessions[0]).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      title: null,
      status: "cancelling",
      repository: null,
      createdAt: "2026-07-18T20:01:02.000Z",
    });
  });

  it.each([
    ["a non-object envelope", null],
    [
      "too many sessions",
      {
        ...createValidList(),
        sessions: Array.from({ length: 101 }, () => createSession()),
      },
    ],
    ["a malformed session ID", withSession({ id: "not-a-uuid" })],
    ["an unknown session status", withSession({ status: "waiting" })],
    ["an overlong title", withSession({ title: "t".repeat(501) })],
    [
      "a noncanonical timestamp",
      withSession({ createdAt: "2026-07-18T20:01:02Z" }),
    ],
    ["a malformed repository", withSession({ repository: { fullName: "" } })],
    [
      "a missing count",
      {
        ...createValidList(),
        counts: { ...createCounts({ all: 1 }), archived: undefined },
      },
    ],
    [
      "a fractional count",
      {
        ...createValidList(),
        counts: createCounts({ all: 1.5 }),
      },
    ],
    [
      "an unsafe cursor",
      {
        ...createValidList(),
        pageInfo: { nextCursor: "cursor\nvalue", hasMore: true },
      },
    ],
    [
      "hasMore without a cursor",
      {
        ...createValidList(),
        pageInfo: { nextCursor: null, hasMore: true },
      },
    ],
    [
      "a terminal page with a cursor",
      {
        ...createValidList(),
        pageInfo: { nextCursor: "unexpected", hasMore: false },
      },
    ],
    [
      "duplicate session IDs",
      {
        ...createValidList(),
        sessions: [createSession(), createSession()],
      },
    ],
  ])("rejects %s", (_description, value) => {
    expect(() => decodeSessionList(value)).toThrow(TypeError);
  });
});

function withSession(
  overrides: Record<string, unknown>,
): ReturnType<typeof createValidList> {
  const value = createValidList();
  value.sessions[0] = { ...value.sessions[0], ...overrides };
  return value;
}

function createValidList() {
  return {
    sessions: [createSession()],
    counts: createCounts({ all: 1, running: 1 }),
    pageInfo: { nextCursor: null as string | null, hasMore: false },
  };
}

function createSession() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Fix checkout" as string | null,
    status: "running",
    repository: { fullName: "acme/web" } as { fullName: string } | null,
    createdAt: "2026-07-18T20:01:02.000Z",
  };
}

function createCreatedSessionResponse(overrides: Record<string, unknown>) {
  return {
    session: {
      id: "33333333-3333-4333-8333-333333333333",
      status: "queued",
      repository: { fullName: "acme/web" },
      agentProfile: {
        id: "codex-cli-default",
        name: "Codex CLI",
      },
      title: null,
      ...overrides,
    },
  };
}

function createCounts(overrides: Record<string, number> = {}) {
  return {
    all: 0,
    queued: 0,
    initializing: 0,
    running: 0,
    ready: 0,
    failed: 0,
    cancelled: 0,
    merged: 0,
    abandoned: 0,
    archived: 0,
    ...overrides,
  };
}
