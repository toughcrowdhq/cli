import { describe, expect, it } from "vitest";
import { printIssueList, printIssueSummary } from "./output.js";
import type { Issue, IssueSummary } from "./types.js";

describe("issue output", () => {
  it("prints a bounded human-readable issue list without terminal controls", () => {
    const stdout = new MemoryWriter();

    printIssueList(stdout, { issues: [createIssue()] }, false);

    expect(stdout.output).toBe(
      "ID                                    STATE       REPOSITORY                    TITLE                                             VERSION  CREATED                 \n" +
        "11111111-1111-4111-8111-111111111111  open        acme/web                      Checkout failure requires a bounded but visib...  7        2026-08-18T20:01:02.000Z\n",
    );
    expect(stdout.output).not.toContain("\u001B");
  });

  it("prints literal summary counts and stable JSON", () => {
    const human = new MemoryWriter();
    const json = new MemoryWriter();
    const summary = createSummary();

    printIssueSummary(human, summary, false);
    printIssueSummary(json, summary, true);

    expect(human.output).toBe(
      "Created: 2\n" +
        "Fixed: 1\n" +
        "Fixed and verified: 1\n" +
        "Non-fixed: 0\n" +
        "Merged, unverified: 1\n" +
        "Deployed, unverified: 0\n",
    );
    expect(JSON.parse(json.output)).toEqual(summary);
  });
});

class MemoryWriter {
  output = "";

  write(value: string): void {
    this.output += value;
  }
}

function createIssue(): Issue {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    githubRepositoryId: "22222222-2222-4222-8222-222222222222",
    title: "Checkout failure requires a bounded but visible title\u001B[31m",
    description: "Production checkout fails.",
    type: "bug",
    priority: "high",
    state: "open",
    resolutionDisposition: null,
    resolutionNote: null,
    version: 7,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:01:02.000Z",
    repositoryFullName: "acme/web",
    relationships: [],
    verifications: [],
    externalLinks: [],
  };
}

function createSummary(): IssueSummary {
  const issueId = "11111111-1111-4111-8111-111111111111";
  const otherIssueId = "22222222-2222-4222-8222-222222222222";
  const empty = { count: 0, issueIds: [] };
  return {
    range: { createdFrom: null, createdTo: null, durationMs: null },
    created: { count: 2, issueIds: [issueId, otherIssueId] },
    fixed: { count: 1, issueIds: [issueId] },
    fixedAndVerified: { count: 1, issueIds: [issueId] },
    nonFixed: empty,
    mergedUnverified: { count: 1, issueIds: [otherIssueId] },
    deployedUnverified: empty,
  };
}
