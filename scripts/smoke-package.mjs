import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(
  readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
);
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "toughcrowd-cli-package-"),
);
const npmEnvironment = {
  ...process.env,
  npm_config_cache: resolve(temporaryDirectory, "npm-cache"),
};

assert(
  Object.keys(metadata.bin ?? {}).length === 1 &&
    metadata.bin?.toughcrowd === "./dist/index.js",
  "CLI package must expose only the toughcrowd executable",
);

try {
  const packResult = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        temporaryDirectory,
      ],
      { cwd: packageDirectory, encoding: "utf8", env: npmEnvironment },
    ),
  );
  const packed = packResult[0];
  assert(
    packed && typeof packed.filename === "string",
    "npm pack did not return a tarball",
  );

  const packedPaths = new Set(packed.files.map((file) => file.path));
  for (const requiredPath of [
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "dist/index.js",
    "package.json",
  ]) {
    assert(
      packedPaths.has(requiredPath),
      `packed CLI is missing ${requiredPath}`,
    );
  }

  const unexpectedPaths = [...packedPaths].filter(
    (path) =>
      path !== "README.md" &&
      path !== "CHANGELOG.md" &&
      path !== "LICENSE" &&
      path !== "package.json" &&
      !path.startsWith("dist/"),
  );
  assert(
    unexpectedPaths.length === 0,
    `packed CLI has unexpected files: ${unexpectedPaths.join(", ")}`,
  );

  const tarballPath = resolve(temporaryDirectory, packed.filename);
  const installationPrefix = resolve(temporaryDirectory, "installation");
  execFileSync(
    "npm",
    [
      "install",
      "--global",
      "--prefix",
      installationPrefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarballPath,
    ],
    { stdio: "pipe", env: npmEnvironment },
  );

  const executable =
    process.platform === "win32"
      ? resolve(installationPrefix, "toughcrowd.cmd")
      : resolve(installationPrefix, "bin", "toughcrowd");
  const versionOutput = execFileSync(executable, ["--version"], {
    encoding: "utf8",
  });
  const greetingOutput = execFileSync(executable, [], { encoding: "utf8" });

  assert(
    versionOutput === `${metadata.version}\n`,
    "installed CLI returned the wrong version",
  );
  // Keep this release-contract assertion in sync with the default output in src/cli.ts.
  assert(
    greetingOutput === "Hello, world!\n",
    "installed CLI returned the wrong greeting",
  );
  console.log(`Verified packed toughcrowd ${metadata.version}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
