export class IncidentCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "IncidentCommandError";
    this.exitCode = exitCode;
  }
}
