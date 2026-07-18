import { describe, expect, it } from "vitest";
import { AuthCommandError } from "./errors.js";
import {
  decodeStoredApiKeyRecord,
  encodeStoredApiKeyRecord,
  resolveCredential,
  type CredentialStore,
} from "./credentials.js";

describe("API key credential records", () => {
  it("round-trips a format-tagged API key record", () => {
    const serialized = JSON.stringify(
      encodeStoredApiKeyRecord("https://api.toughcrowd.com", "tc_secret"),
    );

    expect(
      decodeStoredApiKeyRecord(serialized, "https://api.toughcrowd.com"),
    ).toBe("tc_secret");
  });

  it("rejects unknown kinds and newer versions without returning a key", () => {
    expect(() =>
      decodeStoredApiKeyRecord(
        JSON.stringify({
          formatVersion: 2,
          kind: "oauth-token",
          apiOrigin: "https://api.toughcrowd.com",
          apiKey: "tc_secret",
        }),
        "https://api.toughcrowd.com",
      ),
    ).toThrow(AuthCommandError);
  });

  it("rejects records for a different API origin", () => {
    expect(() =>
      decodeStoredApiKeyRecord(
        JSON.stringify(
          encodeStoredApiKeyRecord("https://api.toughcrowd.com", "tc_secret"),
        ),
        "http://localhost:3000",
      ),
    ).toThrow(AuthCommandError);
  });
});

describe("credential resolution", () => {
  it("uses TOUGHCROWD_API_KEY before reading stored credentials", async () => {
    const store: CredentialStore = {
      read() {
        throw new Error("store should not be read");
      },
      write() {
        throw new Error("store should not be written");
      },
    };

    await expect(
      resolveCredential({
        env: { TOUGHCROWD_API_KEY: "tc_env" },
        store,
        apiOrigin: "https://api.toughcrowd.com",
      }),
    ).resolves.toEqual({ apiKey: "tc_env", source: "environment" });
  });
});
