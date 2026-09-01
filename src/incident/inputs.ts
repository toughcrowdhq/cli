import { parseGitHubRepositoryOrigin } from "../session/inputs.js";
import { IncidentCommandError } from "./errors.js";

export const repositoryEnvironmentVariable = "TOUGHCROWD_REPO";

export interface IncidentCreationEnvironment {
  readonly [repositoryEnvironmentVariable]?: string;
}

export interface CreateIncidentInputOptions {
  summary: string;
  title: string;
  repo?: string;
  resolutionSummary?: string;
  env?: IncidentCreationEnvironment;
  readGitOrigin(): Promise<string | null>;
}

export interface ResolvedCreateIncidentInputs {
  summary: string;
  title: string;
  repo?: string;
  resolutionSummary?: string;
}

const maximumRepositoryLength = 255;
const maximumTitleLength = 300;
const maximumNarrativeLength = 10_000;
const maximumCursorLength = 512;
const repositoryPattern = /^[a-z0-9._-]+\/[a-z0-9._-]+$/u;

export async function resolveCreateIncidentInputs(
  options: CreateIncidentInputOptions,
): Promise<ResolvedCreateIncidentInputs> {
  return {
    summary: readRequiredText(
      options.summary,
      "Summary",
      maximumNarrativeLength,
    ),
    title: readRequiredText(options.title, "Title", maximumTitleLength),
    ...(await resolveRepository(options)),
    ...(options.resolutionSummary == null
      ? {}
      : {
          resolutionSummary: readRequiredText(
            options.resolutionSummary,
            "Resolution summary",
            maximumNarrativeLength,
          ),
        }),
  };
}

export function readOptionalRepository(
  value: string | undefined,
  source = "--repo",
): string | undefined {
  if (value == null) return undefined;
  return readRepository(value, source);
}

export function readOptionalTitle(
  value: string | undefined,
): string | undefined {
  if (value == null) return undefined;
  return readRequiredText(value, "Title", maximumTitleLength);
}

export function readOptionalNarrative(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value == null) return undefined;
  return readRequiredText(value, name, maximumNarrativeLength);
}

export function readRequiredNarrative(value: string, name: string): string {
  return readRequiredText(value, name, maximumNarrativeLength);
}

export function readCursor(value: string): string {
  return readRequiredText(value, "Cursor", maximumCursorLength);
}

async function resolveRepository(
  options: CreateIncidentInputOptions,
): Promise<{ repo?: string }> {
  if (options.repo != null) {
    return { repo: readRepository(options.repo, "--repo") };
  }

  const environmentRepository = options.env?.[repositoryEnvironmentVariable];
  if (
    environmentRepository != null &&
    environmentRepository.trim().length > 0
  ) {
    return {
      repo: readRepository(
        environmentRepository,
        repositoryEnvironmentVariable,
      ),
    };
  }

  const origin = await options.readGitOrigin();
  if (origin != null) {
    const repository = parseGitHubRepositoryOrigin(origin);
    if (repository != null) return { repo: repository };
  }

  return {};
}

function readRepository(value: string, source: string): string {
  const repository = value.trim().toLowerCase();
  if (
    repository.length === 0 ||
    repository.length > maximumRepositoryLength ||
    !repositoryPattern.test(repository)
  ) {
    throw new IncidentCommandError(
      `Repository from ${source} must use the owner/name form.`,
      2,
    );
  }
  return repository;
}

function readRequiredText(
  value: string,
  name: string,
  maximumLength: number,
): string {
  const text = value.trim();
  if (text.length === 0) {
    throw new IncidentCommandError(`${name} must not be empty.`, 2);
  }
  if (text.length > maximumLength) {
    throw new IncidentCommandError(`${name} is too long.`, 2);
  }
  return text;
}
