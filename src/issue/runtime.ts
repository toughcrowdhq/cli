import {
  resolveAuthenticatedApiRuntime,
  type AuthenticatedApiRuntime,
  type AuthenticatedCommandRuntime,
} from "../api/authenticated.js";
import { IssueCommandError } from "./errors.js";

export interface IssueRuntime extends AuthenticatedCommandRuntime {
  stdout: { write(value: string): unknown };
}

export type AuthenticatedIssueApiRuntime = AuthenticatedApiRuntime;

export function resolveAuthenticatedIssueApiRuntime(
  runtime: IssueRuntime,
): Promise<AuthenticatedIssueApiRuntime> {
  return resolveAuthenticatedApiRuntime(
    runtime,
    (message) => new IssueCommandError(message),
  );
}
