export class IssueCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "IssueCommandError";
    this.exitCode = exitCode;
  }
}
