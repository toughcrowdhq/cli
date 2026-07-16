import { describe, expect, it, vi } from "vitest";
import { run } from "./cli.js";

describe("Tough Crowd CLI", () => {
  it("prints the v0.1 greeting", () => {
    const write = vi.fn();

    run({ output: { write } });

    expect(write).toHaveBeenCalledExactlyOnceWith("Hello, world!\n");
  });

  it.each(["--version", "-v"])("prints the package version for %s", (flag) => {
    const write = vi.fn();

    run({ args: [flag], output: { write }, version: "0.1.0" });

    expect(write).toHaveBeenCalledExactlyOnceWith("0.1.0\n");
  });
});
