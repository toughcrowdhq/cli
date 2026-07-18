import { describe, expect, it } from "vitest";
import { ApiOriginError } from "../api/origin.js";
import { resolveAuthOrigin } from "./origins.js";

describe("auth origin resolution", () => {
  it("uses the production API origin by default", () => {
    expect(resolveAuthOrigin()).toBe("https://api.toughcrowd.dev");
  });

  it("accepts a loopback API origin for local development", () => {
    expect(
      resolveAuthOrigin({
        TOUGHCROWD_API_ORIGIN: "http://localhost:3001",
      }),
    ).toBe("http://localhost:3001");
  });

  it.each([
    ["https://evil.test/path"],
    ["https://evil.test?api_key=tc_secret"],
    ["https://user:secret@evil.test"],
  ])("rejects a deceptive API origin %s", (input) => {
    expect(() => resolveAuthOrigin({ TOUGHCROWD_API_ORIGIN: input })).toThrow(
      ApiOriginError,
    );
  });
});
