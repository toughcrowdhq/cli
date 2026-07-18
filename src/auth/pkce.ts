import { createHash, randomBytes } from "node:crypto";

export interface AuthorizationSecrets {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

export function createAuthorizationSecrets(): AuthorizationSecrets {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");

  return {
    state,
    codeVerifier,
    codeChallenge: createPkceS256Challenge(codeVerifier),
    codeChallengeMethod: "S256",
  };
}

export function createPkceS256Challenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}
