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
  if (selection.profile == null) return;
  const profile = catalog.profiles.find(
    (entry) => entry.id === selection.profile,
  );
  if (profile == null) {
    throw new Error(`Agent Profile ${selection.profile} is not available.`);
  }
  const modelId = selection.model ?? profile.defaultModel;
  if (modelId == null) {
    if (selection.reasoningEffort != null) {
      throw new Error(
        `Reasoning effort ${selection.reasoningEffort} requires a model for Agent Profile ${selection.profile}.`,
      );
    }
    return;
  }
  const model = profile.models.find((entry) => entry.id === modelId);
  if (model == null) {
    throw new Error(
      `Model ${modelId} is not supported by Agent Profile ${selection.profile}.`,
    );
  }
  if (
    selection.reasoningEffort != null &&
    model.reasoningEfforts.length > 0 &&
    !model.reasoningEfforts.includes(selection.reasoningEffort)
  ) {
    throw new Error(
      `Reasoning effort ${selection.reasoningEffort} is not supported by ${selection.profile}/${modelId}.`,
    );
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
