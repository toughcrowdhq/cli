import { describe, expect, it } from "vitest";
import { hasChangelogEntry, validateReleaseWorkspace } from "./release.mjs";

const validWorkspace = {
  branch: "main",
  status: "",
  head: "abc123",
  originHead: "abc123",
  localTagType: null,
  localTagCommit: null,
  remoteTagExists: false,
  tag: "v0.1.1",
};

describe("release workspace policy", () => {
  it("accepts a clean synchronized main branch without a release tag", () => {
    expect(validateReleaseWorkspace(validWorkspace)).toEqual({
      reuseLocalTag: false,
    });
  });

  it("accepts an annotated local tag at HEAD after a failed push", () => {
    expect(
      validateReleaseWorkspace({
        ...validWorkspace,
        localTagType: "tag",
        localTagCommit: "abc123",
      }),
    ).toEqual({ reuseLocalTag: true });
  });

  it.each([
    [{ branch: "feature" }, "release must run from the main branch"],
    [{ status: " M package.json" }, "release worktree must be clean"],
    [
      { originHead: "def456" },
      "local main must exactly match origin/main before release",
    ],
    [{ remoteTagExists: true }, "v0.1.1 already exists on origin"],
    [
      { localTagType: "commit", localTagCommit: "abc123" },
      "v0.1.1 must be an annotated tag",
    ],
    [
      { localTagType: "tag", localTagCommit: "def456" },
      "v0.1.1 exists locally but points to a different commit",
    ],
  ])("rejects unsafe release state %#", (override, message) => {
    expect(() =>
      validateReleaseWorkspace({ ...validWorkspace, ...override }),
    ).toThrow(message);
  });

  it("requires a changelog heading for the package version", () => {
    expect(hasChangelogEntry("# Changelog\n\n## 0.1.1\n", "0.1.1")).toBe(true);
    expect(hasChangelogEntry("# Changelog\n\n## 0.1.0\n", "0.1.1")).toBe(false);
  });
});
