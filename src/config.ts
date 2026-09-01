import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

export const configFormatVersion = 1;
export const configEnvironmentVariable = "TOUGHCROWD_CONFIG";

export interface SessionConfig {
  agentProfile?: string;
  model?: string;
  reasoningEffort?: string;
}

export interface ToughCrowdConfig {
  formatVersion: 1;
  session?: SessionConfig;
}

export type ConfigKey =
  "session.profile" | "session.model" | "session.reasoning-effort";

export class ConfigError extends Error {}
type ConfigurationEnvironment = object;

export function configPath(
  env: ConfigurationEnvironment = process.env,
): string {
  const values = env as Record<string, string | undefined>;
  const overridden = values[configEnvironmentVariable]?.trim();
  if (overridden != null && overridden.length > 0) return resolve(overridden);
  if (process.platform === "win32") {
    return resolve(
      values.APPDATA?.trim() || homedir(),
      "toughcrowd",
      "config.json",
    );
  }
  if (process.platform === "darwin") {
    return resolve(
      homedir(),
      "Library",
      "Application Support",
      "toughcrowd",
      "config.json",
    );
  }
  return resolve(
    values.XDG_CONFIG_HOME?.trim() || resolve(homedir(), ".config"),
    "toughcrowd",
    "config.json",
  );
}

export async function readConfig(
  env?: ConfigurationEnvironment,
): Promise<ToughCrowdConfig> {
  const path = configPath(env);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) return { formatVersion: configFormatVersion };
    throw new ConfigError(`Could not read configuration at ${path}.`);
  }
  try {
    return decodeConfig(JSON.parse(text));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`Configuration at ${path} is not valid JSON.`);
  }
}

export async function writeConfig(
  config: ToughCrowdConfig,
  env?: ConfigurationEnvironment,
): Promise<void> {
  const path = configPath(env);
  const directory = dirname(path);
  const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, path);
  } catch {
    throw new ConfigError(`Could not write configuration at ${path}.`);
  }
}

export function decodeConfig(value: unknown): ToughCrowdConfig {
  if (!isRecord(value) || !hasOnly(value, ["formatVersion", "session"])) {
    throw new ConfigError("Configuration contains unsupported keys.");
  }
  if (value.formatVersion !== configFormatVersion) {
    throw new ConfigError(
      `Configuration formatVersion must be ${configFormatVersion}.`,
    );
  }
  if (value.session === undefined) {
    return { formatVersion: configFormatVersion };
  }
  if (
    !isRecord(value.session) ||
    !hasOnly(value.session, ["agentProfile", "model", "reasoningEffort"])
  ) {
    throw new ConfigError("Configuration session contains unsupported keys.");
  }
  const session: SessionConfig = {};
  for (const [field, label] of [
    ["agentProfile", "Agent Profile"],
    ["model", "Model"],
    ["reasoningEffort", "Reasoning effort"],
  ] as const) {
    const entry = value.session[field];
    if (entry !== undefined) session[field] = readSelection(entry, label);
  }
  return {
    formatVersion: configFormatVersion,
    ...(Object.keys(session).length > 0 ? { session } : {}),
  };
}

export function getConfigValue(
  config: ToughCrowdConfig,
  key: ConfigKey,
): string | undefined {
  switch (key) {
    case "session.profile":
      return config.session?.agentProfile;
    case "session.model":
      return config.session?.model;
    case "session.reasoning-effort":
      return config.session?.reasoningEffort;
  }
}

export function setConfigValue(
  config: ToughCrowdConfig,
  key: ConfigKey,
  value: string,
): ToughCrowdConfig {
  const session = { ...config.session };
  const normalized = readSelection(value, key);
  if (key === "session.profile") session.agentProfile = normalized;
  if (key === "session.model") session.model = normalized;
  if (key === "session.reasoning-effort") session.reasoningEffort = normalized;
  return { formatVersion: configFormatVersion, session };
}

export function unsetConfigValue(
  config: ToughCrowdConfig,
  key: ConfigKey,
): ToughCrowdConfig {
  const session = { ...config.session };
  if (key === "session.profile") delete session.agentProfile;
  if (key === "session.model") delete session.model;
  if (key === "session.reasoning-effort") delete session.reasoningEffort;
  return {
    formatVersion: configFormatVersion,
    ...(Object.keys(session).length > 0 ? { session } : {}),
  };
}

export function parseConfigKey(value: string): ConfigKey {
  if (
    value === "session.profile" ||
    value === "session.model" ||
    value === "session.reasoning-effort"
  ) {
    return value;
  }
  throw new ConfigError(`Unknown configuration key: ${value}.`);
}

function readSelection(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > 200
  ) {
    throw new ConfigError(
      `${label} must be a non-empty string no longer than 200 characters.`,
    );
  }
  return value.trim();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnly(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
