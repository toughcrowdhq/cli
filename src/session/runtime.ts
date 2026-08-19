import {
  resolveAuthenticatedApiRuntime,
  type AuthenticatedApiRuntime,
  type AuthenticatedCommandRuntime,
} from "../api/authenticated.js";
import { SessionCommandError } from "./errors.js";

export interface SessionRuntime extends AuthenticatedCommandRuntime {
  stdout: { write(value: string): unknown };
}

export type AuthenticatedSessionApiRuntime = AuthenticatedApiRuntime;

export async function resolveAuthenticatedSessionApiRuntime(
  runtime: SessionRuntime,
): Promise<AuthenticatedSessionApiRuntime> {
  return resolveAuthenticatedApiRuntime(
    runtime,
    (message) => new SessionCommandError(message),
  );
}
