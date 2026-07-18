import { resolveApiOrigin } from "../api/origin.js";

export const apiOriginEnvironmentVariable = "TOUGHCROWD_API_ORIGIN";

export interface OriginEnvironment {
  readonly [apiOriginEnvironmentVariable]?: string;
}

export function resolveAuthOrigin(env: OriginEnvironment = {}): string {
  return resolveApiOrigin(env[apiOriginEnvironmentVariable]);
}
