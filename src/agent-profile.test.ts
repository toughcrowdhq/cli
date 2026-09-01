import { describe, expect, it } from "vitest";
import { ApiClientError } from "./api/errors.js";
import {
  validateSelection,
  type AgentProfileCatalog,
} from "./agent-profile.js";
import {
  formatAgentProfileListFailure,
  formatConfigSetFailure,
} from "./cli.js";

const catalog: AgentProfileCatalog = {
  profiles: [
    {
      id: "codex-cli-chatgpt",
      name: "Codex CLI",
      authenticationMode: "chatgpt",
      defaultModel: "gpt-5.6-sol",
      models: [
        {
          id: "gpt-5.6-sol",
          reasoningEfforts: ["low", "medium", "high"],
        },
      ],
    },
  ],
};

describe("validateSelection", () => {
  it("validates reasoning effort against a selected profile's default model", () => {
    expect(() =>
      validateSelection(catalog, {
        profile: "codex-cli-chatgpt",
        reasoningEffort: "xhigh",
      }),
    ).toThrow(
      "Reasoning effort xhigh is not supported by codex-cli-chatgpt/gpt-5.6-sol.",
    );
  });

  it("accepts an effort supported by the profile default model", () => {
    expect(() =>
      validateSelection(catalog, {
        profile: "codex-cli-chatgpt",
        reasoningEffort: "high",
      }),
    ).not.toThrow();
  });
});

describe("formatConfigSetFailure", () => {
  it("redacts structured API 5xx diagnostics", () => {
    const message = formatConfigSetFailure(
      new ApiClientError({
        kind: "api",
        status: 500,
        message: "Production database password was rejected.",
      }),
    );

    expect(message).toBe(
      "Could not set configuration: the Tough Crowd API returned an internal error.",
    );
    expect(message).not.toContain("password");
  });
});

describe("formatAgentProfileListFailure", () => {
  it.each([
    ["timeout", "Could not list Agent Profiles: the API request timed out."],
    [
      "network",
      "Could not list Agent Profiles: could not reach the Tough Crowd API.",
    ],
  ] as const)("formats %s failures", (kind, expected) => {
    expect(
      formatAgentProfileListFailure(
        new ApiClientError({ kind, message: "sensitive connection detail" }),
      ).message,
    ).toBe(expected);
  });

  it("preserves bounded authentication guidance", () => {
    expect(
      formatAgentProfileListFailure(
        new ApiClientError({
          kind: "api",
          status: 401,
          code: "authentication-required",
          message: "The API key has been revoked.",
        }),
      ).message,
    ).toBe(
      "Authentication failed: The API key has been revoked. Run `toughcrowd auth login` or set TOUGHCROWD_API_KEY.",
    );
  });
});
