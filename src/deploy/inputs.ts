import { DeployCommandError } from "./errors.js";

export interface GitHubActionsDeploymentEnvironment {
  GITHUB_REPOSITORY?: string;
  GITHUB_SHA?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_RUN_ATTEMPT?: string;
  GITHUB_SERVER_URL?: string;
}

export interface DeploymentReportInputs {
  repository: string;
  commitSha: string;
  source: {
    provider: "github_actions";
    runId: string;
    runAttempt: string;
    workflowRunUrl: string;
  };
  idempotencyKey: string;
}

const repositoryPattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/u;
const shaPattern = /^[0-9a-f]{40}$/iu;
const positiveIntegerPattern = /^[1-9][0-9]*$/u;

export function resolveDeploymentReportInputs(
  env: GitHubActionsDeploymentEnvironment | undefined,
): DeploymentReportInputs {
  const repository = readRequired(env?.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const commitSha = readRequired(env?.GITHUB_SHA, "GITHUB_SHA");
  const runId = readRequired(env?.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const runAttempt = readRequired(
    env?.GITHUB_RUN_ATTEMPT,
    "GITHUB_RUN_ATTEMPT",
  );
  const serverUrl = readRequired(env?.GITHUB_SERVER_URL, "GITHUB_SERVER_URL");

  if (
    !repositoryPattern.test(repository) ||
    containsControlCharacter(repository)
  ) {
    throw invalidContext(
      "GITHUB_REPOSITORY must be an owner/name repository such as toughcrowdhq/cli.",
    );
  }
  if (!shaPattern.test(commitSha)) {
    throw invalidContext(
      "GITHUB_SHA must be the full 40-character commit SHA.",
    );
  }
  if (!positiveIntegerPattern.test(runId)) {
    throw invalidContext(
      "GITHUB_RUN_ID must be a positive GitHub Actions run ID.",
    );
  }
  if (!positiveIntegerPattern.test(runAttempt)) {
    throw invalidContext(
      "GITHUB_RUN_ATTEMPT must be a positive GitHub Actions run attempt.",
    );
  }

  const normalizedRepository = repository.toLowerCase();
  const normalizedCommitSha = commitSha.toLowerCase();
  const workflowRunUrl = createWorkflowRunUrl(
    serverUrl,
    normalizedRepository,
    runId,
  );

  return {
    repository: normalizedRepository,
    commitSha: normalizedCommitSha,
    source: {
      provider: "github_actions",
      runId,
      runAttempt,
      workflowRunUrl,
    },
    idempotencyKey: [
      "github-actions",
      normalizedRepository,
      normalizedCommitSha,
      runId,
      runAttempt,
    ].join(":"),
  };
}

function readRequired(value: string | undefined, name: string): string {
  const text = value?.trim();
  if (text == null || text.length === 0) {
    throw invalidContext(
      `${name} is required. Run \`toughcrowd deploy report\` from a GitHub Actions workflow after deployment health checks succeed.`,
    );
  }
  return text;
}

function createWorkflowRunUrl(
  serverUrlValue: string,
  repository: string,
  runId: string,
): string {
  let serverUrl: URL;
  try {
    serverUrl = new URL(serverUrlValue);
  } catch {
    throw invalidContext("GITHUB_SERVER_URL must be a valid URL.");
  }

  if (serverUrl.protocol !== "https:") {
    throw invalidContext("GITHUB_SERVER_URL must be an HTTPS URL.");
  }

  return new URL(
    `${repository}/actions/runs/${runId}`,
    withTrailingSlash(serverUrl),
  ).toString();
}

function withTrailingSlash(url: URL): URL {
  const copy = new URL(url.toString());
  copy.pathname = copy.pathname.endsWith("/")
    ? copy.pathname
    : `${copy.pathname}/`;
  copy.search = "";
  copy.hash = "";
  return copy;
}

function invalidContext(message: string): DeployCommandError {
  return new DeployCommandError(`Could not report deployment: ${message}`);
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint != null &&
      (codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029)
    ) {
      return true;
    }
  }
  return false;
}
