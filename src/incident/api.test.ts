import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/request.js";
import {
  createIncident,
  createIncidentNote,
  getIncident,
  listIncidentNotes,
  listIncidents,
  updateIncident,
  updateIncidentNote,
} from "./api.js";

const incidentId = "11111111-1111-4111-8111-111111111111";
const noteId = "22222222-2222-4222-8222-222222222222";

describe("incident API", () => {
  it("maps incident and note operations to the public REST API", async () => {
    const fetch = createFetch([
      { incidents: [createIncidentRecord()], nextCursor: "next" },
      { incident: createIncidentRecord() },
      { incident: createIncidentRecord() },
      { notes: [createNote()], nextCursor: null },
      { incident: createIncidentRecord({ state: "resolved" }) },
      { note: createNote() },
      { note: createNote({ body: "Edited" }) },
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
    });
    await getIncident({ ...runtime, incidentId });
    await listIncidentNotes({ ...runtime, incidentId, limit: 10 });
    await updateIncident({
      ...runtime,
      incidentId,
      state: "resolved",
      resolutionSummary: "Rolled back",
    });
    await createIncidentNote({ ...runtime, incidentId, body: "Observed" });
    await updateIncidentNote({
      ...runtime,
      incidentId,
      noteId,
      body: "Edited",
    });

    expect(fetch.calls.map((call) => [call.method, call.url])).toEqual([
      [
        "GET",
        "https://api.toughcrowd.dev/api/incidents?state=active&severity=p1&repo=acme%2Fweb&limit=25&cursor=opaque",
      ],
      ["POST", "https://api.toughcrowd.dev/api/incidents"],
      ["GET", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      [
        "GET",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes?limit=10`,
      ],
      ["PATCH", `https://api.toughcrowd.dev/api/incidents/${incidentId}`],
      ["POST", `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes`],
      [
        "PATCH",
        `https://api.toughcrowd.dev/api/incidents/${incidentId}/notes/${noteId}`,
      ],
    ]);
    expect(fetch.calls[1].body).toEqual({
      summary: "Checkout is down",
      title: "Checkout outage",
      repo: "acme/web",
      severity: "p1",
      state: "active",
    });
    expect(fetch.calls[1].idempotencyKey).toBeUndefined();
    expect(fetch.calls[4].body).toEqual({
      state: "resolved",
      resolutionSummary: "Rolled back",
    });
    expect(fetch.calls[5].idempotencyKey).toBeUndefined();
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
