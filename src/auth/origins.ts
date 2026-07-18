import { parseApiOrigin, resolveApiOrigin } from "../api/origin.js";

export const defaultWebOrigin = "https://app.toughcrowd.com";
export const apiOriginEnvironmentVariable = "TOUGHCROWD_API_ORIGIN";
export const webOriginEnvironmentVariable = "TOUGHCROWD_WEB_ORIGIN";

export interface OriginEnvironment {
  readonly [apiOriginEnvironmentVariable]?: string;
  readonly [webOriginEnvironmentVariable]?: string;
}

export interface ResolvedOrigins {
  apiOrigin: string;
  webOrigin: string;
}

export function resolveAuthOrigins(
  env: OriginEnvironment = {},
): ResolvedOrigins {
  const apiOrigin = resolveApiOrigin(env[apiOriginEnvironmentVariable]);
  const webOrigin = parseWebOrigin(
    env[webOriginEnvironmentVariable] ?? deriveDefaultWebOrigin(apiOrigin),
  );

  return { apiOrigin, webOrigin };
}

export function createApiKeyPageUrl(webOrigin: string): string {
  return new URL("/settings/api-keys/new", webOrigin).toString();
}

function deriveDefaultWebOrigin(apiOrigin: string): string {
  if (apiOrigin === "https://api.toughcrowd.com") return defaultWebOrigin;

  const url = new URL(apiOrigin);
  return url.origin;
}

function parseWebOrigin(input: string): string {
  return parseApiOrigin(input);
}
