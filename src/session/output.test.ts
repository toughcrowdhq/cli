import { expect, it } from "vitest";
import { printHumanCreatedSession, printHumanSessionList } from "./output.js";

it("keeps created-session fields bounded and strips terminal controls", () => {
  let output = "";

  printHumanCreatedSession(
    {
      write(value) {
        output += value;
      },
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      status: "queued",
      repository: { fullName: "acme/web\u001b[31m" },
      agentProfile: {
        id: "codex-cli-default",
        name: "Codex\nCLI",
      },
      title: "t".repeat(200),
    },
  );

  expect(output).not.toContain("\u001b");
  expect(output).toContain("Repository: acme/web [31m\n");
  expect(output).toContain("Agent Profile: Codex CLI (codex-cli-default)\n");
  expect(output).toContain(`Title: ${"t".repeat(117)}...\n`);
});

it("keeps human session rows bounded and strips terminal controls", () => {
  let output = "";

  printHumanSessionList(
    {
      write(value) {
        output += value;
      },
    },
    {
      sessions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "unsafe\n\u001b[31m" + "x".repeat(100),
          status: "running",
          repository: { fullName: "acme/" + "repository".repeat(10) },
          createdAt: "2026-07-18T20:01:02.000Z",
        },
      ],
      counts: {
        all: 1,
        queued: 0,
        initializing: 0,
        running: 1,
        needs_input: 0,
        awaiting_checks: 0,
        ready: 0,
        failed: 0,
        cancelled: 0,
        merged: 0,
        abandoned: 0,
        archived: 0,
      },
      pageInfo: { nextCursor: null, hasMore: false },
    },
  );

  const lines = output.trimEnd().split("\n");
  expect(lines).toHaveLength(2);
  expect(lines[0]).toHaveLength(162);
  expect(lines[1]).toHaveLength(162);
  expect(output).not.toContain("\u001b");
  expect(lines[1]).toContain("...");
});

it("prints full IDs when their leading UUID components collide", () => {
  let output = "";
  const counts = {
    all: 2,
    queued: 0,
    initializing: 0,
    running: 2,
    needs_input: 0,
    awaiting_checks: 0,
    ready: 0,
    failed: 0,
    cancelled: 0,
    merged: 0,
    abandoned: 0,
    archived: 0,
  };

  printHumanSessionList(
    {
      write(value) {
        output += value;
      },
    },
    {
      sessions: [
        {
          id: "019f76eb-1111-4111-8111-111111111111",
          title: "First",
          status: "running",
          repository: { fullName: "acme/web" },
          createdAt: "2026-07-18T20:30:01.151Z",
        },
        {
          id: "019f76eb-2222-4222-8222-222222222222",
          title: "Second",
          status: "running",
          repository: { fullName: "acme/web" },
          createdAt: "2026-07-18T20:29:18.333Z",
        },
      ],
      counts,
      pageInfo: { nextCursor: null, hasMore: false },
    },
  );

  const lines = output.trimEnd().split("\n");
  expect(lines[0]).toMatch(/^ID {36}STATUS/u);
  expect(lines[1]).toMatch(/^019f76eb-1111-4111-8111-111111111111 {2}running/u);
  expect(lines[2]).toMatch(/^019f76eb-2222-4222-8222-222222222222 {2}running/u);
});

it("renders awaiting_checks as Waiting for checks", () => {
  let output = "";

  printHumanSessionList(
    {
      write(value) {
        output += value;
      },
    },
    {
      sessions: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Add merge confidence",
          status: "awaiting_checks",
          repository: { fullName: "toughcrowdhq/app" },
          createdAt: "2026-07-25T18:42:00.000Z",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Choose a migration strategy",
          status: "needs_input",
          repository: { fullName: "toughcrowdhq/app" },
          createdAt: "2026-07-25T18:43:00.000Z",
        },
      ],
      counts: {
        all: 2,
        queued: 0,
        initializing: 0,
        running: 0,
        needs_input: 1,
        awaiting_checks: 1,
        ready: 0,
        failed: 0,
        cancelled: 0,
        merged: 0,
        abandoned: 0,
        archived: 0,
      },
      pageInfo: { nextCursor: null, hasMore: false },
    },
  );

  expect(output).toBe(
    "ID                                    STATUS              REPOSITORY                    TITLE                                             CREATED                 \n" +
      "33333333-3333-4333-8333-333333333333  Waiting for checks  toughcrowdhq/app              Add merge confidence                              2026-07-25T18:42:00.000Z\n" +
      "44444444-4444-4444-8444-444444444444  Needs input         toughcrowdhq/app              Choose a migration strategy                       2026-07-25T18:43:00.000Z\n",
  );
});
