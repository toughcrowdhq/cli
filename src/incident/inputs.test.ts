import { describe, expect, it } from "vitest";
import {
  readComponentName,
  readOptionalComponentDescription,
  readOptionalImpacts,
  readOptionalOperationalTimestamp,
  readRequiredIncidentNoteBody,
  resolveCreateIncidentInputs,
} from "./inputs.js";

describe("resolveCreateIncidentInputs", () => {
  it("uses --repo before TOUGHCROWD_REPO and GitHub origin", async () => {
    let originReads = 0;
    const result = await resolveCreateIncidentInputs({
      summary: "  Checkout is down  ",
      title: " Checkout outage ",
      repo: "Flag/Repo",
      env: { TOUGHCROWD_REPO: "env/repo" },
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:origin/repo.git");
      },
    });

    expect(result).toEqual({
      summary: "Checkout is down",
      title: "Checkout outage",
      repo: "flag/repo",
    });
    expect(originReads).toBe(0);
  });

  it("uses TOUGHCROWD_REPO before GitHub origin", async () => {
    let originReads = 0;
    const result = await resolveCreateIncidentInputs({
      summary: "Checkout is down",
      title: "Checkout outage",
      env: { TOUGHCROWD_REPO: "Env/Repo" },
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:origin/repo.git");
      },
    });

    expect(result.repo).toBe("env/repo");
    expect(originReads).toBe(0);
  });

  it("falls back to GitHub origin and requires a repository otherwise", async () => {
    await expect(
      resolveCreateIncidentInputs({
        summary: "Checkout is down",
        title: "Checkout outage",
        readGitOrigin: () =>
          Promise.resolve("git@github.com:ToughCrowdHQ/CLI.git"),
      }),
    ).resolves.toMatchObject({ repo: "toughcrowdhq/cli" });

    await expect(
      resolveCreateIncidentInputs({
        summary: "Checkout is down",
        title: "Checkout outage",
        readGitOrigin: () => Promise.resolve("git@gitlab.com:acme/web.git"),
      }),
    ).rejects.toThrow(
      "Repository is required. Use --repo <owner/name>, set TOUGHCROWD_REPO, or run the command in a GitHub checkout with an origin remote.",
    );
  });

  it("rejects invalid bounded input", async () => {
    await expect(
      resolveCreateIncidentInputs({
        summary: " ",
        title: "Checkout outage",
        readGitOrigin: () => Promise.resolve(null),
      }),
    ).rejects.toThrow("Summary must not be empty.");
    await expect(
      resolveCreateIncidentInputs({
        summary: "Checkout is down",
        title: "t".repeat(301),
        readGitOrigin: () => Promise.resolve(null),
      }),
    ).rejects.toThrow("Title is too long.");
    await expect(
      resolveCreateIncidentInputs({
        summary: "Checkout is down",
        title: "Checkout outage",
        repo: "not-a-repository",
        readGitOrigin: () => Promise.resolve(null),
      }),
    ).rejects.toThrow("Repository from --repo must use the owner/name form.");
  });
});

describe("richer incident inputs", () => {
  it("normalizes offset timestamps and preserves explicit null", () => {
    expect(
      readOptionalOperationalTimestamp(
        "2026-08-18T12:55:00-07:00",
        "Started time",
      ),
    ).toBe("2026-08-18T19:55:00.000Z");
    expect(readOptionalOperationalTimestamp(null, "Started time")).toBeNull();
    expect(() =>
      readOptionalOperationalTimestamp("2026-08-18 12:55", "Started time"),
    ).toThrow("Started time must be an ISO 8601 timestamp with an offset.");
  });

  it("validates complete impact replacements", () => {
    expect(
      readOptionalImpacts([
        {
          componentId: "55555555-5555-4555-8555-555555555555",
          condition: "degraded",
        },
        { condition: "unknown" },
      ]),
    ).toEqual([
      {
        componentId: "55555555-5555-4555-8555-555555555555",
        condition: "degraded",
      },
      { condition: "unknown" },
    ]);
    expect(() =>
      readOptionalImpacts([
        { condition: "unknown" },
        { componentId: null, condition: "degraded" },
      ]),
    ).toThrow("Impacts must contain each component at most once.");
  });

  it("bounds component names and descriptions", () => {
    expect(readComponentName("  Checkout API  ")).toBe("Checkout API");
    expect(readOptionalComponentDescription(null)).toBeNull();
    expect(() => readComponentName("x".repeat(121))).toThrow(
      "Component name is too long.",
    );
    expect(() => readOptionalComponentDescription(" ")).toThrow(
      "Component description must not be empty.",
    );
  });

  it("accepts report-grade note Markdown up to 256 KiB of UTF-8", () => {
    const overLegacyLimit = `# Investigation\n\n${"x".repeat(10_001)}`;
    expect(readRequiredIncidentNoteBody(overLegacyLimit)).toBe(overLegacyLimit);

    const exactByteLimit = "😀".repeat(65_536);
    expect(readRequiredIncidentNoteBody(exactByteLimit)).toBe(exactByteLimit);
    expect(() => readRequiredIncidentNoteBody(`${exactByteLimit}x`)).toThrow(
      "Note body must not exceed 256 KiB when encoded as UTF-8.",
    );
  });
});
