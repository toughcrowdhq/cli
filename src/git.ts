import { execFile } from "node:child_process";

export interface ReadGitOriginOptions {
  cwd?: string;
  signal?: AbortSignal;
}

export function readGitOriginUrl(
  options: ReadGitOriginOptions = {},
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: 8_192,
        signal: options.signal,
        windowsHide: true,
      },
      (error, stdout) => {
        if (options.signal?.aborted === true) {
          reject(error ?? new Error("Git origin lookup was canceled"));
          return;
        }
        if (error != null) {
          resolve(null);
          return;
        }

        const origin = stdout.trim();
        resolve(origin.length > 0 ? origin : null);
      },
    );
  });
}
