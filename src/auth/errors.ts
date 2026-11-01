export type AuthDiagnostic =
  | { kind: "authentication"; code: "unknown" }
  | { kind: "local-I/O"; code: "credential-store-unavailable" };

export class AuthCommandError extends Error {
  readonly exitCode: number;

  constructor(
    message: string,
    exitCode = 1,
    readonly diagnostic: AuthDiagnostic = {
      kind: "authentication",
      code: "unknown",
    },
  ) {
    super(message);
    this.name = "AuthCommandError";
    this.exitCode = exitCode;
  }
}
