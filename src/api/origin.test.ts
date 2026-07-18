import { describe, expect, it } from "vitest";
import { ApiOriginError, parseApiOrigin, resolveApiOrigin } from "./origin.js";

describe("API origin parsing", () => {
  it("canonicalizes HTTPS production origins", () => {
    expect(parseApiOrigin("https://API.ToughCrowd.dev:443")).toBe(
      "https://api.toughcrowd.dev",
    );
  });

  it("allows HTTP only for loopback development origins", () => {
    expect(parseApiOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(parseApiOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(parseApiOrigin("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  it("uses the default production API origin", () => {
    expect(resolveApiOrigin()).toBe("https://api.toughcrowd.dev");
  });

  it.each([
    ["not-a-url"],
    ["ftp://api.toughcrowd.dev"],
    ["http://api.toughcrowd.dev"],
    ["https://user:secret@api.toughcrowd.dev"],
    ["https://api.toughcrowd.dev/path"],
    ["https://api.toughcrowd.dev?api_key=secret"],
    ["https://api.toughcrowd.dev#secret"],
  ])("rejects invalid or deceptive API origin %s", (input) => {
    expect(() => parseApiOrigin(input)).toThrow(ApiOriginError);
  });
});
