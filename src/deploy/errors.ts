export class DeployCommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "DeployCommandError";
    this.exitCode = exitCode;
  }
}
