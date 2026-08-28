import {
  resolveAuthenticatedApiRuntime,
  type AuthenticatedApiRuntime,
  type AuthenticatedCommandRuntime,
} from "../api/authenticated.js";
import { DeployCommandError } from "./errors.js";

export interface DeployRuntime extends AuthenticatedCommandRuntime {
  stdout: { write(value: string): unknown };
}

export type AuthenticatedDeployApiRuntime = AuthenticatedApiRuntime;

export async function resolveAuthenticatedDeployApiRuntime(
  runtime: DeployRuntime,
): Promise<AuthenticatedDeployApiRuntime> {
  return resolveAuthenticatedApiRuntime(
    runtime,
    (message) => new DeployCommandError(message),
  );
}
