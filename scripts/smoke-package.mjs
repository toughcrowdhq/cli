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
    metadata.bin?.toughcrowd === "dist/index.js",
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
  const defaultOutput = execFileSync(executable, [], { encoding: "utf8" });
  const helpOutput = execFileSync(executable, ["--help"], { encoding: "utf8" });
  const authHelpOutput = execFileSync(executable, ["auth", "--help"], {
    encoding: "utf8",
  });
  const sessionHelpOutput = execFileSync(executable, ["session", "--help"], {
    encoding: "utf8",
  });
  const sessionNewHelpOutput = execFileSync(
    executable,
    ["session", "new", "--help"],
    { encoding: "utf8" },
  );
  const sessionCancelHelpOutput = execFileSync(
    executable,
    ["session", "cancel", "--help"],
    { encoding: "utf8" },
  );
  const deployHelpOutput = execFileSync(executable, ["deploy", "--help"], {
    encoding: "utf8",
  });
  const incidentHelpOutput = execFileSync(executable, ["incident", "--help"], {
    encoding: "utf8",
  });
  const incidentCreateHelpOutput = execFileSync(
    executable,
    ["incident", "create", "--help"],
    { encoding: "utf8" },
  );
  const incidentNoteDeleteHelpOutput = execFileSync(
    executable,
    ["incident", "note", "delete", "--help"],
    { encoding: "utf8" },
  );
  const deployReportHelpOutput = execFileSync(
    executable,
    ["deploy", "report", "--help"],
    { encoding: "utf8" },
  );
  const installedPackageDirectory =
    process.platform === "win32"
      ? resolve(installationPrefix, "node_modules", "@toughcrowd", "cli")
      : resolve(
          installationPrefix,
          "lib",
          "node_modules",
          "@toughcrowd",
          "cli",
        );
  const authSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(packageDirectory, "scripts/fixtures/package-smoke-auth.mjs"),
      resolve(installedPackageDirectory, "dist/cli.js"),
      metadata.version,
    ],
    { encoding: "utf8" },
  );
  const sessionListSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(
        packageDirectory,
        "scripts/fixtures/package-smoke-session-list.mjs",
      ),
      resolve(installedPackageDirectory, "dist/cli.js"),
      metadata.version,
    ],
    { encoding: "utf8" },
  );
  const sessionNewSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(
        packageDirectory,
        "scripts/fixtures/package-smoke-session-new.mjs",
      ),
      resolve(installedPackageDirectory, "dist/cli.js"),
      metadata.version,
    ],
    { encoding: "utf8" },
  );
  const sessionEndSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(
        packageDirectory,
        "scripts/fixtures/package-smoke-session-end.mjs",
      ),
      resolve(installedPackageDirectory, "dist/cli.js"),
      metadata.version,
    ],
    { encoding: "utf8" },
  );
  const deployReportSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(
        packageDirectory,
        "scripts/fixtures/package-smoke-deploy-report.mjs",
      ),
      resolve(installedPackageDirectory, "dist/cli.js"),
      metadata.version,
    ],
    { encoding: "utf8" },
  );
  const incidentNoteSmokeOutput = execFileSync(
    process.execPath,
    [
      resolve(
        packageDirectory,
        "scripts/fixtures/package-smoke-incident-note.mjs",
      ),
      executable,
      metadata.version,
    ],
    { encoding: "utf8" },
  );

  assert(
    versionOutput === `${metadata.version}\n`,
    "installed CLI returned the wrong version",
  );
  // Keep this release-contract assertion in sync with the root help in src/cli.ts.
  const rootHelp = `Usage: toughcrowd [options] [command]

The command-line client for Tough Crowd

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  auth            Manage Tough Crowd authentication
  config          Manage machine-local Tough Crowd preferences
  agent-profile   Discover executable Agent Profiles
  session         Work with Tough Crowd sessions
  issue           Work with Tough Crowd issues
  incident        Work with Tough Crowd incidents
  deploy          Report Tough Crowd deployments
  help [command]  display help for command
`;
  assert(
    defaultOutput === rootHelp,
    "installed CLI returned the wrong default help",
  );
  assert(
    helpOutput === rootHelp,
    "installed CLI returned the wrong --help output",
  );
  assert(
    authHelpOutput.includes("Usage: toughcrowd auth [options] [command]\n") &&
      authHelpOutput.includes(
        "  login             Authenticate through browser approval\n",
      ) &&
      authHelpOutput.includes(
        "  status [options]  Show the active Tough Crowd authentication status\n",
      ),
    "installed CLI returned the wrong auth help output",
  );
  assert(
    sessionHelpOutput.includes(
      "  new [options] <prompt>          Create a new coding-agent session\n",
    ) &&
      sessionHelpOutput.includes(
        "  cancel [options] <session-id>   Cancel an active session\n",
      ) &&
      sessionHelpOutput.includes(
        "  abandon [options] <session-id>  Abandon an unshipped session\n",
      ) &&
      sessionNewHelpOutput.includes(
        "Usage: toughcrowd session new [options] <prompt>\n",
      ) &&
      sessionNewHelpOutput.includes(
        "  --profile <profile-id>       Agent Profile to use\n",
      ) &&
      sessionCancelHelpOutput.includes(
        "Usage: toughcrowd session cancel [options] <session-id>\n",
      ),
    "installed CLI returned the wrong session help output",
  );
  assert(
    incidentHelpOutput.includes(
      "Usage: toughcrowd incident [options] [command]\n",
    ) &&
      incidentHelpOutput.includes(
        "  create [options] <summary>           Create an incident\n",
      ) &&
      incidentHelpOutput.includes(
        "  note [options] <incident-id> [body]  Add, edit, or delete incident notes\n",
      ) &&
      incidentCreateHelpOutput.includes(
        "Usage: toughcrowd incident create [options] <summary>\n",
      ) &&
      incidentCreateHelpOutput.includes(
        "  --resolution-summary <text>  resolution summary\n",
      ) &&
      incidentNoteDeleteHelpOutput.includes(
        "Usage: toughcrowd incident note delete [options] <incident-id> <note-id>\n",
      ),
    "installed CLI returned the wrong incident help output",
  );
  assert(
    deployHelpOutput.includes(
      "Usage: toughcrowd deploy [options] [command]\n",
    ) &&
      deployHelpOutput.includes(
        "  report [options]  Report a production deployment from GitHub Actions\n",
      ) &&
      deployReportHelpOutput.includes(
        "Usage: toughcrowd deploy report [options]\n",
      ) &&
      deployReportHelpOutput.includes(
        "  --json      print machine-readable JSON\n",
      ),
    "installed CLI returned the wrong deploy help output",
  );
  assert(
    authSmokeOutput === "Verified installed browser login\n",
    "installed CLI failed the browser-login smoke test",
  );
  assert(
    sessionListSmokeOutput === "Verified installed session list\n",
    "installed CLI failed the authenticated session-list smoke test",
  );
  assert(
    sessionNewSmokeOutput === "Verified installed session new\n",
    "installed CLI failed the authenticated session-new smoke test",
  );
  assert(
    sessionEndSmokeOutput === "Verified installed session end\n",
    "installed CLI failed the authenticated session-end smoke test",
  );
  assert(
    deployReportSmokeOutput === "Verified installed deploy report\n",
    "installed CLI failed the authenticated deploy-report smoke test",
  );
  assert(
    incidentNoteSmokeOutput === "Verified installed 256 KiB incident note\n",
    "installed CLI failed the 256 KiB incident-note smoke test",
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
