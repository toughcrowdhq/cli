export interface DeploymentRecordResponse {
  deployment: {
    id: string;
    repository: {
      fullName: string;
    };
    commitSha: string;
    environment: "production";
    newlyDeployedSessions: number;
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
  const fullName = readBoundedString(deployment.repository.fullName, 255);
  const commitSha = readCommitSha(deployment.commitSha);
  const newlyDeployedSessions = readNonnegativeInteger(
    deployment.newlyDeployedSessions,
  );

  if (
    id == null ||
    fullName == null ||
    commitSha == null ||
    deployment.environment !== "production" ||
    newlyDeployedSessions == null
  ) {
    throw new TypeError("deployment response is invalid");
  }

  return {
    deployment: {
      id,
      repository: { fullName },
      commitSha,
      environment: "production",
      newlyDeployedSessions,
    },
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
