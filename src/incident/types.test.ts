import { describe, expect, it } from "vitest";
import {
  decodeIncidentList,
  decodeIncidentNotesPage,
  decodeIncidentResponse,
} from "./types.js";

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteId = "22222222-2222-4222-8222-222222222222";

describe("incident response decoding", () => {
  it("keeps only bounded client-facing fields and nullable attribution", () => {
    const result = decodeIncidentResponse({
      incident: {
        ...createIncident(),
        internalPayload: { secret: "server-only" },
      },
    });

    expect(result.incident).toEqual(createIncident());
    expect(result.incident).not.toHaveProperty("internalPayload");
    expect(result.incident.createdBy).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Ada",
    });
    expect(result.incident.updatedBy).toBeNull();
  });

  it("rejects invalid choices, duplicates, cursors, and attribution", () => {
    expect(() =>
      decodeIncidentResponse({
        incident: { ...createIncident(), severity: "sev1" },
      }),
    ).toThrow("incident is invalid");
    expect(() =>
      decodeIncidentList({
        incidents: [createIncident(), createIncident()],
        nextCursor: null,
      }),
    ).toThrow("incident list response is invalid");
    expect(() =>
      decodeIncidentList({
        incidents: [],
        nextCursor: "x".repeat(513),
      }),
    ).toThrow("incident list response is invalid");
    expect(() =>
      decodeIncidentResponse({
        incident: { ...createIncident(), createdBy: { id: incidentId } },
      }),
    ).toThrow("string field is invalid");
  });

  it("validates note pages chronologically as opaque server output", () => {
    const first = createNote({ id: noteId, body: "first" });
    const second = createNote({
      id: "44444444-4444-4444-8444-444444444444",
      body: "second",
      createdBy: { id: "33333333-3333-4333-8333-333333333333", name: "Ada" },
      updatedBy: null,
    });

    expect(
      decodeIncidentNotesPage({ notes: [first, second], nextCursor: "next" }),
    ).toEqual({ notes: [first, second], nextCursor: "next" });
    expect(() =>
      decodeIncidentNotesPage({ notes: [first, first], nextCursor: null }),
    ).toThrow("incident notes response is invalid");
  });
});

function createIncident() {
  return {
    id: incidentId,
    repository: "acme/web",
    title: "Checkout outage",
    summary: "Checkout is down",
    severity: "p1",
    state: "active",
    resolutionSummary: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    resolvedAt: null,
    createdBy: { id: "33333333-3333-4333-8333-333333333333", name: "Ada" },
    updatedBy: null,
  };
}

function createNote(overrides: Record<string, unknown> = {}) {
  return {
    id: noteId,
    incidentId,
    body: "Observed",
    createdAt: "2026-08-18T20:03:02.000Z",
    updatedAt: "2026-08-18T20:03:02.000Z",
    createdBy: null,
    updatedBy: { id: "33333333-3333-4333-8333-333333333333", name: "Ada" },
    ...overrides,
  };
}
