// Registered public route templates. Never forward raw paths or queries.
const routes = [
  ["/api/sessions", "/api/sessions"],
  ["/api/sessions/[^/]+/(cancel|abandon)", "/api/sessions/:sessionId/$1"],
  ["/api/issues/summary", "/api/issues/summary"],
  ["/api/issues", "/api/issues"],
  ["/api/issues/[^/]+", "/api/issues/:issueId"],
  [
    "/api/issues/[^/]+/(comments|resolution|verifications|sessions)",
    "/api/issues/:issueId/$1",
  ],
  [
    "/api/issues/[^/]+/sessions/[^/]+",
    "/api/issues/:issueId/sessions/:sessionId",
  ],
  [
    "/api/issues/[^/]+/external-links/github",
    "/api/issues/:issueId/external-links/github",
  ],
  [
    "/api/issues/[^/]+/external-links/github/(adopt|retry)",
    "/api/issues/:issueId/external-links/github/$1",
  ],
  ["/api/incidents/components", "/api/incidents/components"],
  ["/api/incidents/components/[^/]+", "/api/incidents/components/:componentId"],
  ["/api/incidents", "/api/incidents"],
  ["/api/incidents/[^/]+", "/api/incidents/:incidentId"],
  ["/api/incidents/[^/]+/notes", "/api/incidents/:incidentId/notes"],
  [
    "/api/incidents/[^/]+/notes/[^/]+",
    "/api/incidents/:incidentId/notes/:noteId",
  ],
  ...[
    "deployments",
    "me",
    "agent-profiles",
    "cli-authorizations",
    "cli-authorizations/exchange",
    "model-credential-authorizations/relay/ready",
    "model-credential-authorizations/relay/heartbeat",
  ].map((route) => [`/api/${route}`, `/api/${route}`]),
];
export function telemetryRoute(path: string): string | undefined {
  const pathname = path.split("?")[0];
  for (const [pattern, template] of routes) {
    const match = new RegExp(`^${pattern}$`).exec(pathname);
    if (match != null) return template.replace("$1", match[1] ?? "");
  }
  return undefined;
}

export function isTelemetryRoute(route: string): boolean {
  // Applying normalization to a template is idempotent only for registered routes.
  return route.length <= 160 && telemetryRoute(route) === route;
}
