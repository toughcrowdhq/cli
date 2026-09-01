import { requestJson, type RequestJsonOptions } from "./api/request.js";

export interface AgentProfileCatalogEntry {
  id: string;
  name: string;
  authenticationMode: string;
  defaultModel: string | null;
  models: readonly { id: string; reasoningEfforts: readonly string[] }[];
}
export interface AgentProfileCatalog {
  profiles: readonly AgentProfileCatalogEntry[];
}

export function listAgentProfiles(options: {
  apiOrigin: string;
  authorization: string;
  signal: AbortSignal;
  version: string;
  fetch?: RequestJsonOptions<AgentProfileCatalog>["fetch"];
  timers?: RequestJsonOptions<AgentProfileCatalog>["timers"];
}): Promise<AgentProfileCatalog> {
  return requestJson({
    origin: options.apiOrigin,
    method: "GET",
    path: "/api/agent-profiles",
    authorization: options.authorization,
    signal: options.signal,
    fetch: options.fetch,
    timers: options.timers,
    metadata: { cliVersion: options.version },
    decode: decodeAgentProfileCatalog,
  });
}

export function decodeAgentProfileCatalog(value: unknown): AgentProfileCatalog {
  if (!record(value) || !Array.isArray(value.profiles)) {
    throw new TypeError("agent profile catalog is invalid");
  }
  const profiles = value.profiles.map((raw): AgentProfileCatalogEntry => {
    if (!record(raw) || !text(raw.id) || !text(raw.name)) {
      throw new TypeError("agent profile is invalid");
    }
    const authenticationMode =
      text(raw.authenticationMode) ?? text(raw.authMode) ?? "unknown";
    const defaultModel =
      raw.defaultModel === null || raw.defaultModel === undefined
        ? null
        : text(raw.defaultModel);
    if (defaultModel === undefined) {
      throw new TypeError("agent profile is invalid");
    }
    const rawModels = Array.isArray(raw.models)
      ? raw.models
      : Array.isArray(raw.supportedModels)
        ? raw.supportedModels
        : [];
    const models = rawModels.map(
      (model): { id: string; reasoningEfforts: readonly string[] } => {
        if (typeof model === "string") {
          return { id: model, reasoningEfforts: [] };
        }
        if (!record(model) || !text(model.id)) {
          throw new TypeError("agent profile model is invalid");
        }
        const efforts =
          model.reasoningEfforts ?? model.supportedReasoningEfforts ?? [];
        if (
          !Array.isArray(efforts) ||
          !efforts.every((effort) => text(effort))
        ) {
          throw new TypeError("agent profile model is invalid");
        }
        return {
          id: text(model.id)!,
          reasoningEfforts: efforts.map((effort) => (effort as string).trim()),
        };
      },
    );
    return {
      id: text(raw.id)!,
      name: text(raw.name)!,
      authenticationMode,
      defaultModel,
      models,
    };
  });
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    throw new TypeError("agent profile catalog has duplicate profiles");
  }
  return { profiles };
}
export function validateSelection(
  catalog: AgentProfileCatalog,
  selection: { profile?: string; model?: string; reasoningEffort?: string },
): void {
  const profiles = selectProfiles(catalog, selection.profile);
  if (selection.model == null && selection.reasoningEffort == null) return;
  const candidates = profiles.flatMap((profile) => {
    const modelId = selection.model ?? profile.defaultModel;
    if (modelId == null) return [];
    const model = profile.models.find((entry) => entry.id === modelId);
    return model == null ? [] : [{ profile, model }];
  });

  if (candidates.length === 0) {
    throwSelectionFailure(catalog, selection);
  }

  const reasoningEffort = selection.reasoningEffort;
  if (reasoningEffort == null) return;
  const supported = candidates.some(
    ({ model }) =>
      model.reasoningEfforts.length === 0 ||
      model.reasoningEfforts.includes(reasoningEffort),
  );
  if (supported) return;

  if (selection.profile != null) {
    const modelId = selection.model ?? profiles[0].defaultModel;
    throw new Error(
      `Reasoning effort ${selection.reasoningEffort} is not supported by ${selection.profile}/${modelId}.`,
    );
  }
  throw new Error(
    `Reasoning effort ${selection.reasoningEffort} is not supported by any compatible Agent Profile.`,
  );
}

function selectProfiles(
  catalog: AgentProfileCatalog,
  profileId: string | undefined,
): readonly AgentProfileCatalogEntry[] {
  if (profileId == null) return catalog.profiles;
  const profile = catalog.profiles.find((entry) => entry.id === profileId);
  if (profile == null) {
    throw new Error(`Agent Profile ${profileId} is not available.`);
  }
  return [profile];
}

function throwSelectionFailure(
  catalog: AgentProfileCatalog,
  selection: { profile?: string; model?: string; reasoningEffort?: string },
): never {
  if (selection.profile != null) {
    if (selection.model != null) {
      throw new Error(
        `Model ${selection.model} is not supported by Agent Profile ${selection.profile}.`,
      );
    }
    throw new Error(
      `Reasoning effort ${selection.reasoningEffort} requires a model for Agent Profile ${selection.profile}.`,
    );
  }
  if (selection.model != null) {
    throw new Error(
      `Model ${selection.model} is not supported by any Agent Profile.`,
    );
  }
  if (selection.reasoningEffort != null) {
    throw new Error(
      `Reasoning effort ${selection.reasoningEffort} is not supported by any profile default model.`,
    );
  }
  if (catalog.profiles.length === 0) {
    throw new Error("No Agent Profiles are available.");
  }
  throw new Error("Session selection is invalid.");
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
