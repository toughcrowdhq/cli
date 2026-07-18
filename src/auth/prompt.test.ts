import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { AuthCommandError } from "./errors.js";
import { createTerminalPrompt, type PromptInput } from "./prompt.js";

describe("terminal prompt", () => {
  it("reads hidden input without echoing it and restores raw mode", async () => {
    const input = createFakeInput();
    const output = createOutput();
    const prompt = createTerminalPrompt(input.stream, output);

    const result = prompt.readHiddenLine(
      "Paste API key: ",
      new AbortController().signal,
    );
    input.emit("tc_secret\n");

    await expect(result).resolves.toBe("tc_secret");
    expect(output.value).toBe("Paste API key: \n");
    expect(output.value).not.toContain("tc_secret");
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(1);
  });

  it("restores raw mode after abort cancellation", async () => {
    const input = createFakeInput();
    const output = createOutput();
    const abortController = new AbortController();
    const prompt = createTerminalPrompt(input.stream, output);

    const result = prompt.readHiddenLine(
      "Paste API key: ",
      abortController.signal,
    );
    abortController.abort();

    await expect(result).rejects.toMatchObject({
      name: "AuthCommandError",
      exitCode: 130,
    } satisfies Partial<AuthCommandError>);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(1);
  });

  it("restores raw mode after Ctrl-C", async () => {
    const input = createFakeInput();
    const output = createOutput();
    const prompt = createTerminalPrompt(input.stream, output);

    const result = prompt.readHiddenLine(
      "Paste API key: ",
      new AbortController().signal,
    );
    input.emit(Buffer.from([3]));

    await expect(result).rejects.toMatchObject({
      name: "AuthCommandError",
      exitCode: 130,
    } satisfies Partial<AuthCommandError>);
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(1);
  });

  it("restores raw mode after an input stream error", async () => {
    const input = createFakeInput();
    const output = createOutput();
    const prompt = createTerminalPrompt(input.stream, output);

    const result = prompt.readHiddenLine(
      "Paste API key: ",
      new AbortController().signal,
    );
    input.emitError(new Error("tty failed"));

    await expect(result).rejects.toThrow("tty failed");
    expect(input.rawModes).toEqual([true, false]);
    expect(input.paused).toBe(1);
    expect(output.value).toBe("Paste API key: \n");
  });
});

function createFakeInput(): {
  stream: PromptInput;
  rawModes: boolean[];
  paused: number;
  emit(value: string | Buffer): void;
  emitError(error: Error): void;
} {
  const events = new EventEmitter();
  const state = {
    rawModes: [] as boolean[],
    paused: 0,
  };

  const stream = {
    isTTY: true,
    isRaw: false,
    on(event: string, listener: (...args: unknown[]) => void) {
      events.on(event, listener);
      return this;
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      events.off(event, listener);
      return this;
    },
    resume() {
      return this;
    },
    pause() {
      state.paused += 1;
      return this;
    },
    setRawMode(enabled: boolean) {
      state.rawModes.push(enabled);
      return this;
    },
  } as unknown as PromptInput;

  return {
    stream,
    get rawModes() {
      return state.rawModes;
    },
    get paused() {
      return state.paused;
    },
    emit(value) {
      events.emit(
        "data",
        typeof value === "string" ? Buffer.from(value) : value,
      );
    },
    emitError(error) {
      events.emit("error", error);
    },
  };
}

function createOutput(): { value: string; write(value: string): void } {
  return {
    value: "",
    write(value) {
      this.value += value;
    },
  };
}
