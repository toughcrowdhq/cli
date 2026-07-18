export class AuthCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "AuthCommandError";
    this.exitCode = exitCode;
  }
}
