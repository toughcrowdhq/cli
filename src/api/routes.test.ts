import { describe, expect, it } from "vitest";
import { isTelemetryRoute, telemetryRoute } from "./routes.js";

describe("telemetry routes", () => {
  it.each([
    ["/api/sessions?repo=secret", "/api/sessions"],
    ["/api/sessions/secret/cancel", "/api/sessions/:sessionId/cancel"],
    [
      "/api/issues/secret/sessions/secret?version=1",
      "/api/issues/:issueId/sessions/:sessionId",
    ],
    [
      "/api/issues/secret/external-links/github/retry",
      "/api/issues/:issueId/external-links/github/retry",
    ],
    [
      "/api/incidents/components/secret",
      "/api/incidents/components/:componentId",
    ],
    [
      "/api/incidents/secret/notes/secret",
      "/api/incidents/:incidentId/notes/:noteId",
    ],
    ["/api/cli-authorizations/exchange", "/api/cli-authorizations/exchange"],
    ["/api/agent-profiles", "/api/agent-profiles"],
  ])("normalizes %s to a registered template", (path, template) => {
    expect(telemetryRoute(path)).toBe(template);
    expect(isTelemetryRoute(template)).toBe(true);
  });
  it("omits unknown and unnormalized routes", () => {
    expect(telemetryRoute("/api/arbitrary-secret")).toBeUndefined();
    expect(isTelemetryRoute("/api/issues/secret")).toBe(false);
    expect(isTelemetryRoute("/api/sessions?secret=1")).toBe(false);
  });
});
