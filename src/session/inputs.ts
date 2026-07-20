import { SessionCommandError } from "./errors.js";

export const repositoryEnvironmentVariable = "TOUGHCROWD_REPO";
export const agentProfileEnvironmentVariable = "TOUGHCROWD_AGENT_PROFILE";

export type CreationInputSource = "environment" | "flag" | "git-origin";

export interface CreationEnvironment {
  readonly [repositoryEnvironmentVariable]?: string;
  readonly [agentProfileEnvironmentVariable]?: string;
}

export interface CreateSessionInputOptions {
  prompt: string;
  repo?: string;
  profile?: string;
  baseBranch?: string;
  title?: string;
  env?: CreationEnvironment;
  readGitOrigin(): Promise<string | null>;
}

export interface ResolvedCreateSessionInputs {
  prompt: string;
  repository: {
    value: string;
    source: CreationInputSource;
  };
  agentProfile?: {
    value: string;
    source: Exclude<CreationInputSource, "git-origin">;
  };
  baseBranch?: string;
  title?: string;
}

const maximumPromptLength = 100_000;
const maximumRepositoryLength = 255;
const maximumAgentProfileLength = 120;
const maximumBranchLength = 255;
const maximumTitleLength = 500;
const repositoryPattern = /^[a-z0-9._-]+\/[a-z0-9._-]+$/u;
const agentProfilePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export async function resolveCreateSessionInputs(
  options: CreateSessionInputOptions,
): Promise<ResolvedCreateSessionInputs> {
  const prompt = readRequiredText(
    options.prompt,
    "Prompt",
    maximumPromptLength,
  );
  const baseBranch = readOptionalText(
    options.baseBranch,
    "Base branch",
    maximumBranchLength,
  );
  const title = readOptionalText(options.title, "Title", maximumTitleLength);
  const agentProfile = resolveAgentProfile(options);
  const repository = await resolveRepository(options);

  return {
    prompt,
    repository,
    ...(agentProfile != null ? { agentProfile } : {}),
    ...(baseBranch != null ? { baseBranch } : {}),
    ...(title != null ? { title } : {}),
  };
}

export function parseGitHubRepositoryOrigin(origin: string): string | null {
  const scpMatch = /^git@github\.com:([^/]+)\/([^/]+)$/iu.exec(origin.trim());
  if (scpMatch != null) {
    return normalizeRemotePath(scpMatch[1], scpMatch[2]);
  }

  let url: URL;
  try {
    url = new URL(origin.trim());
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== "github.com") return null;
  if (url.search !== "" || url.hash !== "") return null;

  if (url.protocol === "https:") {
    if (
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443")
    ) {
      return null;
    }
  } else if (url.protocol === "ssh:") {
    if (
      url.username !== "git" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "22")
    ) {
      return null;
    }
  } else {
    return null;
  }

  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2) return null;

  return normalizeRemotePath(parts[0], parts[1]);
}

function resolveAgentProfile(
  options: CreateSessionInputOptions,
): ResolvedCreateSessionInputs["agentProfile"] {
  if (options.profile != null) {
    return {
      value: readAgentProfile(options.profile, "--profile"),
      source: "flag",
    };
  }

  const environmentProfile = options.env?.[agentProfileEnvironmentVariable];
  if (environmentProfile != null && environmentProfile.trim().length > 0) {
    return {
      value: readAgentProfile(
        environmentProfile,
        agentProfileEnvironmentVariable,
      ),
      source: "environment",
    };
  }

  return undefined;
}

async function resolveRepository(
  options: CreateSessionInputOptions,
): Promise<ResolvedCreateSessionInputs["repository"]> {
  if (options.repo != null) {
    return {
      value: readRepository(options.repo, "--repo"),
      source: "flag",
    };
  }

  const environmentRepository = options.env?.[repositoryEnvironmentVariable];
  if (
    environmentRepository != null &&
    environmentRepository.trim().length > 0
  ) {
    return {
      value: readRepository(
        environmentRepository,
        repositoryEnvironmentVariable,
      ),
      source: "environment",
    };
  }

  const origin = await options.readGitOrigin();
  if (origin != null) {
    const repository = parseGitHubRepositoryOrigin(origin);
    if (repository != null) {
      return { value: repository, source: "git-origin" };
    }
  }

  throw new SessionCommandError(
    `Repository is required. Use --repo <owner/name>, set ${repositoryEnvironmentVariable}, or run the command in a GitHub checkout with an origin remote.`,
  );
}

function readRepository(value: string, source: string): string {
  const repository = value.trim().toLowerCase();
  if (
    repository.length === 0 ||
    repository.length > maximumRepositoryLength ||
    !repositoryPattern.test(repository)
  ) {
    throw new SessionCommandError(
      `Repository from ${source} must use the owner/name form.`,
    );
  }
  return repository;
}

function readAgentProfile(value: string, source: string): string {
  const agentProfile = value.trim();
  if (
    agentProfile.length === 0 ||
    agentProfile.length > maximumAgentProfileLength ||
    !agentProfilePattern.test(agentProfile)
  ) {
    throw new SessionCommandError(`Agent Profile from ${source} is invalid.`);
  }
  return agentProfile;
}

function normalizeRemotePath(
  rawOwner: string | undefined,
  rawRepository: string | undefined,
): string | null {
  if (rawOwner == null || rawRepository == null) return null;

  const repositoryWithoutSuffix = rawRepository.toLowerCase().endsWith(".git")
    ? rawRepository.slice(0, -4)
    : rawRepository;

  try {
    return readRepository(
      `${rawOwner}/${repositoryWithoutSuffix}`,
      "GitHub origin",
    );
  } catch (error) {
    if (error instanceof SessionCommandError) return null;
    throw error;
  }
}

function readRequiredText(
  value: string,
  name: string,
  maximumLength: number,
): string {
  const text = value.trim();
  if (text.length === 0) {
    throw new SessionCommandError(`${name} must not be empty.`, 2);
  }
  if (text.length > maximumLength) {
    throw new SessionCommandError(`${name} is too long.`, 2);
  }
  return text;
}

function readOptionalText(
  value: string | undefined,
  name: string,
  maximumLength: number,
): string | undefined {
  if (value == null) return undefined;
  return readRequiredText(value, name, maximumLength);
}
