import { describe, expect, it } from "vitest";
import { createAuthorizationSecrets, createPkceS256Challenge } from "./pkce.js";

describe("CLI authorization secrets", () => {
  it("creates independent 256-bit base64url state and PKCE values", () => {
    const first = createAuthorizationSecrets();
    const second = createAuthorizationSecrets();

    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeChallengeMethod).toBe("S256");
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
  });

  it("derives the RFC 7636 S256 challenge", () => {
    expect(
      createPkceS256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
