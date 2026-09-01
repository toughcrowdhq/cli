import {
  resolveAuthenticatedApiRuntime,
  type AuthenticatedApiRuntime,
  type AuthenticatedCommandRuntime,
} from "../api/authenticated.js";
import { IncidentCommandError } from "./errors.js";

export interface IncidentRuntime extends AuthenticatedCommandRuntime {
  stdout: { write(value: string): unknown };
}

export type AuthenticatedIncidentApiRuntime = AuthenticatedApiRuntime;

export function resolveAuthenticatedIncidentApiRuntime(
  runtime: IncidentRuntime,
): Promise<AuthenticatedIncidentApiRuntime> {
  return resolveAuthenticatedApiRuntime(
    runtime,
    (message) => new IncidentCommandError(message),
  );
}
