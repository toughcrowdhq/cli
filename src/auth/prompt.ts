import type { Readable } from "node:stream";
import { AuthCommandError } from "./errors.js";

export interface HiddenPrompt {
  readHiddenLine(prompt: string, signal: AbortSignal): Promise<string>;
  confirm(prompt: string, signal: AbortSignal): Promise<boolean>;
  readonly isInteractive: boolean;
}

export interface PromptInput extends Readable {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(enabled: boolean): this;
}

export interface PromptOutput {
  write(value: string): unknown;
}

export function createTerminalPrompt(
  input: PromptInput,
  output: PromptOutput,
): HiddenPrompt {
  return {
    isInteractive:
      input.isTTY === true && typeof input.setRawMode === "function",
    readHiddenLine(prompt, signal) {
      return readLineRaw({ input, output, prompt, signal, hidden: true });
    },
    confirm(prompt, signal) {
      return readLineRaw({ input, output, prompt, signal, hidden: false }).then(
        (value) => /^y(?:es)?$/i.test(value.trim()),
      );
    },
  };
}

async function readLineRaw(options: {
  input: PromptInput;
  output: PromptOutput;
  prompt: string;
  signal: AbortSignal;
  hidden: boolean;
}): Promise<string> {
  const { input, output, prompt, signal, hidden } = options;
  if (input.isTTY !== true || typeof input.setRawMode !== "function") {
    throw new AuthCommandError(
      "Interactive login requires a TTY. Use TOUGHCROWD_API_KEY for non-interactive authentication.",
    );
  }

  if (signal.aborted) {
    throw new AuthCommandError("Authentication canceled.", 130);
  }

  const setRawMode = input.setRawMode.bind(input);
  const wasRaw = input.isRaw === true;
  let value = "";

  return new Promise<string>((resolve, reject) => {
    const cleanup = (): void => {
      input.off("data", onData);
      signal.removeEventListener("abort", onAbort);
      setRawMode(wasRaw);
      input.pause();
    };

    const finish = (): void => {
      cleanup();
      output.write("\n");
      resolve(value);
    };

    const fail = (error: Error): void => {
      cleanup();
      output.write("\n");
      reject(error);
    };

    const onAbort = (): void => {
      fail(new AuthCommandError("Authentication canceled.", 130));
    };

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          fail(new AuthCommandError("Authentication canceled.", 130));
          return;
        }
        if (byte === 13 || byte === 10) {
          finish();
          return;
        }
        if (byte === 127 || byte === 8) {
          value = value.slice(0, -1);
          if (!hidden) output.write("\b \b");
          continue;
        }
        if (byte >= 32 && byte <= 126) {
          value += String.fromCharCode(byte);
          if (!hidden) output.write(String.fromCharCode(byte));
        }
      }
    };

    output.write(prompt);
    signal.addEventListener("abort", onAbort, { once: true });
    input.on("data", onData);
    input.resume();
    setRawMode(true);
  });
}
