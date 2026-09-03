import { describe, expect, it } from "vitest";
import {
  decodeIncidentComponentList,
  decodeIncidentComponentResponse,
  decodeIncidentList,
  decodeIncidentNotesPage,
  decodeIncidentResponse,
} from "./types.js";

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteId = "22222222-2222-4222-8222-222222222222";
const componentId = "55555555-5555-4555-8555-555555555555";

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
    expect(result.incident.createdByUserId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(result.incident.updatedByUserId).toBeNull();
    expect(result.incident.startedAt).toBe("2026-08-18T19:55:00.000Z");
    expect(result.incident.impacts[0]).toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      component: { id: componentId, name: "Checkout API" },
      condition: "unavailable",
    });
    expect(result.incident.createdBy).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Ada",
    });
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
        incident: { ...createIncident(), createdByUserId: "not-a-uuid" },
      }),
    ).toThrow("UUID field is invalid");
    expect(() =>
      decodeIncidentResponse({
        incident: {
          ...createIncident(),
          impacts: [
            createIncident().impacts[0],
            {
              ...createIncident().impacts[0],
              id: "66666666-6666-4666-8666-666666666666",
            },
          ],
        },
      }),
    ).toThrow("incident is invalid");
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

  it("decodes note bodies up to the 256 KiB UTF-8 API limit", () => {
    const overLegacyLimit = `# Investigation\n\n${"x".repeat(10_001)}`;
    expect(
      decodeIncidentNotesPage({
        notes: [createNote({ body: overLegacyLimit })],
        nextCursor: null,
      }).notes[0]?.body,
    ).toBe(overLegacyLimit);

    const exactByteLimit = "😀".repeat(65_536);
    expect(
      decodeIncidentNotesPage({
        notes: [createNote({ body: exactByteLimit })],
        nextCursor: null,
      }).notes[0]?.body,
    ).toBe(exactByteLimit);
    expect(() =>
      decodeIncidentNotesPage({
        notes: [createNote({ body: `${exactByteLimit}x` })],
        nextCursor: null,
      }),
    ).toThrow("incident note body is invalid");
  });

  it("decodes bounded incident component responses and rejects duplicate IDs", () => {
    const component = createComponent();

    expect(decodeIncidentComponentResponse({ component })).toEqual({
      component,
    });
    expect(decodeIncidentComponentList({ components: [component] })).toEqual({
      components: [component],
    });
    expect(() =>
      decodeIncidentComponentList({ components: [component, component] }),
    ).toThrow("incident component list response is invalid");
    expect(() =>
      decodeIncidentComponentResponse({
        component: { ...component, archivedAt: "yesterday" },
      }),
    ).toThrow("timestamp field is invalid");
  });
});

function createIncident() {
  return {
    id: incidentId,
    repositoryFullName: "acme/web",
    createdByUserId: "33333333-3333-4333-8333-333333333333",
    updatedByUserId: null,
    title: "Checkout outage",
    summary: "Checkout is down",
    severity: "p1",
    state: "active",
    startedAt: "2026-08-18T19:55:00.000Z",
    detectedAt: "2026-08-18T20:00:00.000Z",
    mitigatedAt: null,
    resolutionSummary: null,
    impacts: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        component: {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Checkout API",
        },
        condition: "unavailable",
      },
    ],
    createdBy: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Ada",
    },
    updatedBy: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    resolvedAt: null,
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

function createComponent() {
  return {
    id: componentId,
    organizationId: "77777777-7777-4777-8777-777777777777",
    name: "Checkout API",
    description: "Customer-facing checkout requests",
    archivedAt: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
  };
}
