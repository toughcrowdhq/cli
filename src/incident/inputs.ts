import { readFile } from "node:fs/promises";
import { parseGitHubRepositoryOrigin } from "../session/inputs.js";
import { IncidentCommandError } from "./errors.js";
import {
  incidentImpactConditions,
  isIncidentId,
  type IncidentImpactInput,
} from "./types.js";
import { incidentNoteBodyBytes, incidentNoteBodyMaxBytes } from "./limits.js";

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
  repo: string;
  resolutionSummary?: string;
}

const maximumRepositoryLength = 255;
const maximumTitleLength = 300;
const maximumNarrativeLength = 10_000;
const maximumCursorLength = 512;
const maximumComponentNameLength = 120;
const maximumComponentDescriptionLength = 1_000;
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

export function readOptionalNullableNarrative(
  value: string | null | undefined,
  name: string,
): string | null | undefined {
  return value === null ? null : readOptionalNarrative(value, name);
}

export function readRequiredIncidentNoteBody(value: string): string {
  const body = value.trim();
  if (body.length === 0) {
    throw new IncidentCommandError("Note body must not be empty.", 2);
  }
  if (incidentNoteBodyBytes(body) > incidentNoteBodyMaxBytes) {
    throw new IncidentCommandError(
      "Note body must not exceed 256 KiB when encoded as UTF-8.",
      2,
    );
  }
  return body;
}

export async function readIncidentNoteBodyFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new IncidentCommandError("Note body file could not be read.", 2);
  }
}

export function readComponentName(value: string): string {
  return readRequiredText(value, "Component name", maximumComponentNameLength);
}

export function readOptionalComponentName(
  value: string | undefined,
): string | undefined {
  return value === undefined ? undefined : readComponentName(value);
}

export function readOptionalComponentDescription(
  value: string | null | undefined,
): string | null | undefined {
  return value == null
    ? value
    : readRequiredText(
        value,
        "Component description",
        maximumComponentDescriptionLength,
      );
}

export function readOptionalOperationalTimestamp(
  value: string | null | undefined,
  name: string,
): string | null | undefined {
  if (value == null) return value;
  const match =
    /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (match == null) {
    throw new IncidentCommandError(
      `${name} must be an ISO 8601 timestamp with an offset.`,
      2,
    );
  }

  const [
    ,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(value.slice(0, 4));
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText == null ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText == null ? 0 : Number(offsetMinuteText);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new IncidentCommandError(
      `${name} must be an ISO 8601 timestamp with an offset.`,
      2,
    );
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new IncidentCommandError(
      `${name} must be an ISO 8601 timestamp with an offset.`,
      2,
    );
  }
  return timestamp.toISOString();
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function readOptionalImpacts(
  value: readonly IncidentImpactInput[] | undefined,
): readonly IncidentImpactInput[] | undefined {
  if (value === undefined) return undefined;
  if (value.length > 100) {
    throw new IncidentCommandError(
      "Impacts must contain at most 100 entries.",
      2,
    );
  }
  const seen = new Set<string>();
  return value.map((impact) => {
    const componentId = impact.componentId ?? null;
    if (componentId !== null && !isIncidentId(componentId)) {
      throw new IncidentCommandError("Impact component IDs must be UUIDs.", 2);
    }
    if (!incidentImpactConditions.includes(impact.condition)) {
      throw new IncidentCommandError("Impact condition is invalid.", 2);
    }
    const key = componentId ?? "system";
    if (seen.has(key)) {
      throw new IncidentCommandError(
        "Impacts must contain each component at most once.",
        2,
      );
    }
    seen.add(key);
    return {
      ...(componentId === null ? {} : { componentId }),
      condition: impact.condition,
    };
  });
}

export function readCursor(value: string): string {
  return readRequiredText(value, "Cursor", maximumCursorLength);
}

async function resolveRepository(
  options: CreateIncidentInputOptions,
): Promise<{ repo: string }> {
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

  throw new IncidentCommandError(
    `Repository is required. Use --repo <owner/name>, set ${repositoryEnvironmentVariable}, or run the command in a GitHub checkout with an origin remote.`,
    2,
  );
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
