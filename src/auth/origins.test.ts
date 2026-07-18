import { describe, expect, it } from "vitest";
import { ApiOriginError } from "../api/origin.js";
import {
  createApiKeyPageUrl,
  resolveAuthOrigins,
  webOriginEnvironmentVariable,
} from "./origins.js";

describe("auth origin resolution", () => {
  it("uses production API and web origins by default", () => {
    expect(resolveAuthOrigins()).toEqual({
      apiOrigin: "https://api.toughcrowd.com",
      webOrigin: "https://app.toughcrowd.com",
    });
  });

  it("keeps loopback API and web origins local for development", () => {
    expect(
      resolveAuthOrigins({
        TOUGHCROWD_API_ORIGIN: "http://localhost:3000",
      }),
    ).toEqual({
      apiOrigin: "http://localhost:3000",
      webOrigin: "http://localhost:3000",
    });
  });

  it("accepts an explicit web origin override", () => {
    expect(
      resolveAuthOrigins({
        TOUGHCROWD_API_ORIGIN: "https://api.toughcrowd.com",
        TOUGHCROWD_WEB_ORIGIN: "https://app.example.com",
      }),
    ).toEqual({
      apiOrigin: "https://api.toughcrowd.com",
      webOrigin: "https://app.example.com",
    });
  });

  it.each([
    ["https://evil.test/path"],
    ["https://evil.test?api_key=tc_secret"],
    ["https://user:secret@evil.test"],
  ])("rejects deceptive web origin override %s", (input) => {
    expect(() =>
      resolveAuthOrigins({ [webOriginEnvironmentVariable]: input }),
    ).toThrow(ApiOriginError);
  });

  it("builds the API-key page URL without secret material", () => {
    expect(createApiKeyPageUrl("https://app.toughcrowd.com")).toBe(
      "https://app.toughcrowd.com/settings/api-keys/new",
    );
  });
});
