import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/request.js";
import {
  createIncidentComponent,
  createIncident,
  createIncidentNote,
  deleteIncidentNote,
  getIncident,
  listIncidentComponents,
  listIncidentNotes,
  listIncidents,
  updateIncident,
  updateIncidentComponent,
  updateIncidentNote,
} from "./api.js";

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteId = "22222222-2222-4222-8222-222222222222";
const componentId = "55555555-5555-4555-8555-555555555555";

describe("incident API", () => {
  it("maps incident, component, and note operations to the public REST API", async () => {
    const fetch = createFetch([
      { incidents: [createIncidentRecord()], nextCursor: "next" },
      { incident: createIncidentRecord() },
      { incident: createIncidentRecord() },
      { notes: [createNote()], nextCursor: null },
      { incident: createIncidentRecord({ state: "resolved" }) },
      { components: [createComponent()] },
      { component: createComponent() },
      {
        component: createComponent({ archivedAt: "2026-08-19T20:00:00.000Z" }),
      },
      { note: createNote() },
      { note: createNote({ body: "Edited" }) },
      noContent,
    ]);
    const runtime = createRuntime(fetch);

    await listIncidents({
      ...runtime,
      state: "active",
      severity: "p1",
      repo: "acme/web",
      limit: 25,
      cursor: "opaque",
    });
    await createIncident({
      ...runtime,
      summary: "Checkout is down",
      title: "Checkout outage",
      repo: "acme/web",
      severity: "p1",
      state: "active",
      startedAt: "2026-08-18T12:55:00-07:00",
      detectedAt: "2026-08-18T13:00:00-07:00",
      impacts: [{ componentId, condition: "unavailable" }],
    });
    await getIncident({ ...runtime, incidentId });
    await listIncidentNotes({ ...runtime, incidentId, limit: 10 });
    await updateIncident({
      ...runtime,
      incidentId,
      repo: "acme/api",
      state: "resolved",
      resolutionSummary: "Rolled back",
      mitigatedAt: "2026-08-18T20:30:00.000Z",
      resolvedAt: null,
      impacts: [],
    });
    await listIncidentComponents(runtime);
    await createIncidentComponent({
      ...runtime,
      name: "Checkout API",
      description: "Customer-facing checkout requests",
    });
    await updateIncidentComponent({
      ...runtime,
      componentId,
      archived: true,
    });
    await createIncidentNote({ ...runtime, incidentId, body: "Observed" });
    await updateIncidentNote({
      ...runtime,
      incidentId,
      noteId,
      body: "Edited",
    });
    await deleteIncidentNote({ ...runtime, incidentId, noteId });

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      [
        "GET",
        "https://api.toughcrowd.dev/api/incidents?state=active&severity=p1&repositoryFullName=acme%2Fweb&limit=25&cursor=opaque",
      ],
      ["POST", "https://api.toughcrowd.dev/api/incidents"],
      ["GET", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      [
        "GET",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes?limit=10`,
      ],
      ["PATCH", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      ["GET", "https://api.toughcrowd.dev/api/incidents/components"],
      ["POST", "https://api.toughcrowd.dev/api/incidents/components"],
      [
        "PATCH",
        `https://api.toughcrowd.dev/api/incidents/components/${componentId}`,
      ],
      ["POST", `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes`],
      [
        "PATCH",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes/${noteId}`,
      ],
      [
        "DELETE",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes/${noteId}`,
      ],
    ]);
    expect(fetch.calls[1].body).toEqual({
      summary: "Checkout is down",
      title: "Checkout outage",
      repositoryFullName: "acme/web",
      severity: "p1",
      state: "active",
      startedAt: "2026-08-18T12:55:00-07:00",
      detectedAt: "2026-08-18T13:00:00-07:00",
      impacts: [{ componentId, condition: "unavailable" }],
    });
    expect(fetch.calls[1].idempotencyKey).toBeUndefined();
    expect(fetch.calls[4].body).toEqual({
      repositoryFullName: "acme/api",
      state: "resolved",
      resolutionSummary: "Rolled back",
      mitigatedAt: "2026-08-18T20:30:00.000Z",
      resolvedAt: null,
      impacts: [],
    });
    expect(fetch.calls[6].body).toEqual({
      name: "Checkout API",
      description: "Customer-facing checkout requests",
    });
    expect(fetch.calls[7].body).toEqual({ archived: true });
    expect(fetch.calls[8].idempotencyKey).toBeUndefined();
  });
});

function createRuntime(fetch: FetchLike) {
  return {
    apiOrigin: "https://api.toughcrowd.dev",
    authorization: "Bearer tc_secret",
    signal: new AbortController().signal,
    version: "0.7.0-test",
    fetch,
  };
}

interface FetchCall {
  method: string;
  url: string;
  body?: unknown;
  idempotencyKey?: string;
}

const noContent = Symbol("no-content");

function createFetch(responses: unknown[]): FetchLike & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImplementation = ((url: URL, init: RequestInit) => {
    const body: unknown =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      method: init.method ?? "GET",
      url: url.toString(),
      ...(body === undefined ? {} : { body }),
      idempotencyKey:
        new Headers(init.headers).get("idempotency-key") ?? undefined,
    });
    const response = responses.shift();
    if (response === noContent) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as FetchLike & { calls: FetchCall[] };
  fetchImplementation.calls = calls;
  return fetchImplementation;
}

function createIncidentRecord(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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

function createComponent(overrides: Record<string, unknown> = {}) {
  return {
    id: componentId,
    organizationId: "77777777-7777-4777-8777-777777777777",
    name: "Checkout API",
    description: "Customer-facing checkout requests",
    archivedAt: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    ...overrides,
  };
}
