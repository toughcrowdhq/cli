export interface DeploymentRecordResponse {
  deployment: {
    id: string;
    repository: {
      id: string;
      githubRepositoryId: string;
      fullName: string;
    };
    commitSha: string;
    githubActionsRunId: string;
    githubActionsRunAttempt: number;
    workflowRunUrl: string;
    deployedAt: string;
  };
  associatedSessions: {
    count: number;
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const shaPattern = /^[0-9a-f]{40}$/iu;

export function decodeDeploymentRecordResponse(
  value: unknown,
): DeploymentRecordResponse {
  if (!isRecord(value) || !isRecord(value.deployment)) {
    throw new TypeError("deployment response is invalid");
  }

  const deployment = value.deployment;
  if (!isRecord(deployment.repository)) {
    throw new TypeError("deployment response is invalid");
  }

  const id = readUuid(deployment.id);
  const repositoryId = readUuid(deployment.repository.id);
  const githubRepositoryId = readBoundedString(
    deployment.repository.githubRepositoryId,
    255,
  );
  const fullName = readBoundedString(deployment.repository.fullName, 255);
  const commitSha = readCommitSha(deployment.commitSha);
  const githubActionsRunId = readBoundedString(
    deployment.githubActionsRunId,
    255,
  );
  const githubActionsRunAttempt = readPositiveInteger(
    deployment.githubActionsRunAttempt,
  );
  const workflowRunUrl = readUrl(deployment.workflowRunUrl);
  const deployedAt = readDateTime(deployment.deployedAt);
  const associatedSessions = isRecord(value.associatedSessions)
    ? readNonnegativeInteger(value.associatedSessions.count)
    : null;

  if (
    id == null ||
    repositoryId == null ||
    githubRepositoryId == null ||
    fullName == null ||
    commitSha == null ||
    githubActionsRunId == null ||
    githubActionsRunAttempt == null ||
    workflowRunUrl == null ||
    deployedAt == null ||
    associatedSessions == null
  ) {
    throw new TypeError("deployment response is invalid");
  }

  return {
    deployment: {
      id,
      repository: {
        id: repositoryId,
        githubRepositoryId,
        fullName,
      },
      commitSha,
      githubActionsRunId,
      githubActionsRunAttempt,
      workflowRunUrl,
      deployedAt,
    },
    associatedSessions: { count: associatedSessions },
  };
}

function readUuid(value: unknown): string | null {
  const text = readBoundedString(value, 36);
  return text != null && uuidPattern.test(text) ? text : null;
}

function readCommitSha(value: unknown): string | null {
  const text = readBoundedString(value, 40);
  return text != null && shaPattern.test(text) ? text.toLowerCase() : null;
}

function readBoundedString(
  value: unknown,
  maximumLength: number,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    containsControlCharacter(value)
  ) {
    return null;
  }
  return value;
}

function readNonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function readUrl(value: unknown): string | null {
  const text = readBoundedString(value, 2_048);
  if (text == null) return null;
  try {
    return new URL(text).toString() === text ? text : null;
  } catch {
    return null;
  }
}

function readDateTime(value: unknown): string | null {
  const text = readBoundedString(value, 64);
  return text != null && !Number.isNaN(Date.parse(text)) ? text : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
