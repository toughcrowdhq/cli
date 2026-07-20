export class SessionCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "SessionCommandError";
    this.exitCode = exitCode;
  }
}
