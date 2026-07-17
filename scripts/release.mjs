import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { validateRelease } from "./release-policy.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validateReleaseWorkspace({
  branch,
  status,
  head,
  originHead,
  localTagType,
  localTagCommit,
  remoteTagExists,
  tag,
}) {
  assert(branch === "main", "release must run from the main branch");
  assert(status === "", "release worktree must be clean");
  assert(
    head === originHead,
    "local main must exactly match origin/main before release",
  );
  assert(!remoteTagExists, `${tag} already exists on origin`);

  if (localTagType !== null) {
    assert(localTagType === "tag", `${tag} must be an annotated tag`);
    assert(
      localTagCommit === head,
      `${tag} exists locally but points to a different commit`,
    );
  }

  return { reuseLocalTag: localTagType === "tag" };
}

export function hasChangelogEntry(changelog, version) {
  return changelog
    .split("\n")
    .some((line) => line.trimEnd() === `## ${version}`);
}

async function run() {
  const metadata = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  const tag = `v${metadata.version}`;
  validateRelease({
    metadata,
    tag,
    repositorySlug: "toughcrowdhq/cli",
    licenseExists: existsSync(resolve(packageDirectory, "LICENSE")),
  });

  const changelog = readFileSync(
    resolve(packageDirectory, "CHANGELOG.md"),
    "utf8",
  );
  assert(
    hasChangelogEntry(changelog, metadata.version),
    `CHANGELOG.md has no ${metadata.version} release entry`,
  );
  assert(
    process.stdin.isTTY && process.stdout.isTTY,
    "release confirmation requires an interactive terminal",
  );

  runGit(["fetch", "--quiet", "origin", "main"]);

  const head = gitOutput(["rev-parse", "HEAD"]);
  const localTag = localTagState(tag);
  const workspace = validateReleaseWorkspace({
    branch: gitOutput(["branch", "--show-current"]),
    status: gitOutput(["status", "--porcelain=v1"]),
    head,
    originHead: gitOutput(["rev-parse", "origin/main"]),
    localTagType: localTag.type,
    localTagCommit: localTag.commit,
    remoteTagExists: hasRemoteTag(tag),
    tag,
  });

  for (const [command, args] of [
    ["pnpm", ["install", "--frozen-lockfile"]],
    ["pnpm", ["format:check"]],
    ["pnpm", ["lint"]],
    ["pnpm", ["typecheck"]],
    ["pnpm", ["test"]],
    ["pnpm", ["build"]],
    ["pnpm", ["smoke:package"]],
  ]) {
    execFileSync(command, args, { cwd: packageDirectory, stdio: "inherit" });
  }

  const shortHead = gitOutput(["rev-parse", "--short", "HEAD"]);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let answer;
  try {
    answer = await prompt.question(
      `Push ${tag} for @toughcrowd/cli@${metadata.version} from ${shortHead}? [y/N] `,
    );
  } finally {
    prompt.close();
  }
  assert(
    ["y", "yes"].includes(answer.trim().toLowerCase()),
    "release cancelled",
  );

  if (!workspace.reuseLocalTag) {
    runGit(["tag", "-a", tag, "-m", `Tough Crowd CLI ${metadata.version}`]);
  }
  runGit(["push", "origin", `refs/tags/${tag}`], { inherit: true });
  console.log(
    `Pushed ${tag}; follow the publish workflow at https://github.com/toughcrowdhq/cli/actions/workflows/publish-cli.yml`,
  );
}

function localTagState(tag) {
  const result = spawnGit(["cat-file", "-t", `refs/tags/${tag}`]);
  if (result.status !== 0) {
    return { type: null, commit: null };
  }
  return {
    type: result.stdout.trim(),
    commit: gitOutput(["rev-list", "-n", "1", tag]),
  };
}

function hasRemoteTag(tag) {
  const result = spawnGit([
    "ls-remote",
    "--exit-code",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
  ]);
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  throw new Error(
    result.stderr.trim() || `could not inspect origin for ${tag}`,
  );
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: packageDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function spawnGit(args) {
  return spawnSync("git", args, {
    cwd: packageDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runGit(args, { inherit = false } = {}) {
  execFileSync("git", args, {
    cwd: packageDirectory,
    stdio: inherit ? "inherit" : "pipe",
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
