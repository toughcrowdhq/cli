import { describe, expect, it } from "vitest";
import {
  parseGitHubRepositoryOrigin,
  resolveCreateSessionInputs,
} from "./inputs.js";

describe("parseGitHubRepositoryOrigin", () => {
  it.each([
    ["https://github.com/Acme/Web.git", "acme/web"],
    ["git@github.com:Acme/Web.git", "acme/web"],
    ["ssh://git@github.com/Acme/Web.git", "acme/web"],
    ["ssh://git@github.com:22/Acme/Web", "acme/web"],
    ["https://github.com/Acme/.github.git", "acme/.github"],
  ])("parses %s", (origin, expected) => {
    expect(parseGitHubRepositoryOrigin(origin)).toBe(expected);
  });

  it.each([
    "http://github.com/acme/web.git",
    "https://gitlab.com/acme/web.git",
    "https://user@github.com/acme/web.git",
    "https://github.com/acme/web/extra.git",
    "git@example.com:acme/web.git",
    "ssh://root@github.com/acme/web.git",
    "file:///tmp/acme/web",
    "not a remote",
  ])("rejects %s", (origin) => {
    expect(parseGitHubRepositoryOrigin(origin)).toBeNull();
  });
});

describe("resolveCreateSessionInputs", () => {
  it("uses flags before environment and GitHub origin", async () => {
    let originReads = 0;
    const result = await resolveCreateSessionInputs({
      prompt: "  Fix checkout  ",
      repo: "Flag/Repo",
      profile: "flag-profile",
      baseBranch: " feature/base ",
      title: " Checkout fix ",
      env: {
        TOUGHCROWD_REPO: "env/repo",
        TOUGHCROWD_AGENT_PROFILE: "env-profile",
      },
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:origin/repo.git");
      },
    });

    expect(result).toEqual({
      prompt: "Fix checkout",
      repository: { value: "flag/repo", source: "flag" },
      agentProfile: { value: "flag-profile", source: "flag" },
      baseBranch: "feature/base",
      title: "Checkout fix",
    });
    expect(originReads).toBe(0);
  });

  it("uses environment before GitHub origin", async () => {
    let originReads = 0;
    const result = await resolveCreateSessionInputs({
      prompt: "Fix checkout",
      env: {
        TOUGHCROWD_REPO: "Env/Repo",
        TOUGHCROWD_AGENT_PROFILE: "env-profile",
      },
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:origin/repo.git");
      },
    });

    expect(result.repository).toEqual({
      value: "env/repo",
      source: "environment",
    });
    expect(result.agentProfile).toEqual({
      value: "env-profile",
      source: "environment",
    });
    expect(originReads).toBe(0);
  });

  it("falls back to a recognizable GitHub origin", async () => {
    const result = await resolveCreateSessionInputs({
      prompt: "Fix checkout",
      profile: "codex-cli-default",
      readGitOrigin() {
        return Promise.resolve("git@github.com:ToughCrowdHQ/CLI.git");
      },
    });

    expect(result.repository).toEqual({
      value: "toughcrowdhq/cli",
      source: "git-origin",
    });
  });

  it("leaves Agent Profile selection to the server when no override is set", async () => {
    let originReads = 0;

    const result = await resolveCreateSessionInputs({
      prompt: "Fix checkout",
      readGitOrigin() {
        originReads += 1;
        return Promise.resolve("git@github.com:acme/web.git");
      },
    });

    expect(result.repository).toEqual({
      value: "acme/web",
      source: "git-origin",
    });
    expect(result.agentProfile).toBeUndefined();
    expect(originReads).toBe(1);
  });

  it("fails with actionable guidance for a non-GitHub origin", async () => {
    await expect(
      resolveCreateSessionInputs({
        prompt: "Fix checkout",
        profile: "codex-cli-default",
        readGitOrigin() {
          return Promise.resolve("git@gitlab.com:acme/web.git");
        },
      }),
    ).rejects.toMatchObject({
      message:
        "Repository is required. Use --repo <owner/name>, set TOUGHCROWD_REPO, or run the command in a GitHub checkout with an origin remote.",
    });
  });

  it.each([
    [{ repo: "not-a-repository", profile: "valid-profile" }, "Repository"],
    [{ repo: "acme/web", profile: "bad profile" }, "Agent Profile"],
    [{ repo: "acme/web", profile: "valid-profile", title: "   " }, "Title"],
    [
      { repo: "acme/web", profile: "valid-profile", baseBranch: "   " },
      "Base branch",
    ],
  ])("rejects invalid explicit input: %s", async (input, expected) => {
    await expect(
      resolveCreateSessionInputs({
        prompt: "Fix checkout",
        ...input,
        readGitOrigin() {
          throw new Error("Git must not be read");
        },
      }),
    ).rejects.toThrow(expected);
  });
});
