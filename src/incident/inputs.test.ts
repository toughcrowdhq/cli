import { describe, expect, it } from "vitest";
import { resolveCreateIncidentInputs } from "./inputs.js";

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

  it("falls back to GitHub origin and otherwise leaves repository unset", async () => {
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
    ).resolves.toEqual({
      summary: "Checkout is down",
      title: "Checkout outage",
    });
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
