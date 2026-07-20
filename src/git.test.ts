import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readGitOriginUrl } from "./git.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("reads origin directly from Git configuration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "toughcrowd-cli-git-"));
  temporaryDirectories.push(directory);
  execFileSync("git", ["init", "--quiet", directory]);
  execFileSync("git", [
    "-C",
    directory,
    "config",
    "remote.origin.url",
    "git@github.com:acme/web.git",
  ]);

  await expect(readGitOriginUrl({ cwd: directory })).resolves.toBe(
    "git@github.com:acme/web.git",
  );
});

it("returns null when the working directory has no Git origin", async () => {
  const directory = mkdtempSync(join(tmpdir(), "toughcrowd-cli-no-git-"));
  temporaryDirectories.push(directory);

  await expect(readGitOriginUrl({ cwd: directory })).resolves.toBeNull();
});
