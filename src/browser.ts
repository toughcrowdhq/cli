import { spawn } from "node:child_process";

export function openUrl(url: string): Promise<boolean> {
  const command = selectOpenCommand(url);
  if (command == null) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const child = spawn(command.command, command.args, {
      stdio: "ignore",
    });
    child.once("error", () => {
      resolve(false);
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

function selectOpenCommand(
  url: string,
): { command: string; args: readonly string[] } | null {
  if (process.platform === "darwin") return { command: "open", args: [url] };
  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}
