export interface CliOutput {
  write(value: string): unknown;
}

export interface RunOptions {
  args?: readonly string[];
  output?: CliOutput;
  version?: string;
}

export function run(options: RunOptions = {}): void {
  const { args = [], output = process.stdout, version = "unknown" } = options;

  if (args.includes("--version") || args.includes("-v")) {
    output.write(`${version}\n`);
    return;
  }

  output.write("Hello, world!\n");
}
