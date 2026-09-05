import { describe, expect, it } from "vitest";
import {
  printIncidentComponentList,
  printIncidentComponentResponse,
  printIncidentDetail,
  printIncidentList,
  printIncidentNoteDeletion,
} from "./output.js";
import type { Incident, IncidentComponent, IncidentNote } from "./types.js";

describe("incident output", () => {
  it("prints bounded human incident rows and stable JSON", () => {
    const human = new MemoryWriter();
    const json = new MemoryWriter();
    const list = { incidents: [createIncident()], nextCursor: "next" };

    printIncidentList(human, list, false);
    printIncidentList(json, list, true);

    expect(human.output).toBe(
      "ID                                    STATE      SEVERITY      REPOSITORY                    TITLE                                         UPDATED                 \n" +
        "11111111-1111-4111-8111-111111111111  active     p1            acme/web                      Checkout outage requires bounded display ...  2026-08-18T20:02:02.000Z\n" +
        "Next cursor: next\n",
    );
    expect(human.output).not.toContain("\u001B");
    expect(JSON.parse(json.output)).toEqual(list);
  });

  it("prints lifecycle, resolution, timestamps, attribution, and note bodies safely", () => {
    const stdout = new MemoryWriter();

    printIncidentDetail(
      stdout,
      {
        incident: createIncident({
          state: "resolved",
          resolutionSummary: "Rolled back\u001B[31m",
          resolvedAt: "2026-08-18T21:00:00.000Z",
        }),
        notes: [createNote()],
        nextCursor: null,
      },
      false,
    );

    expect(stdout.output).toContain("State: resolved\n");
    expect(stdout.output).toContain("Resolution: Rolled back [31m\n");
    expect(stdout.output).toContain("Started: 2026-08-18T19:55:00.000Z\n");
    expect(stdout.output).toContain("Detected: 2026-08-18T20:00:00.000Z\n");
    expect(stdout.output).toContain("Mitigated: (none)\n");
    expect(stdout.output).toContain("Resolved: 2026-08-18T21:00:00.000Z\n");
    expect(stdout.output).toContain(
      "Impact: Checkout API (55555555-5555-4555-8555-555555555555) - unavailable\n",
    );
    expect(stdout.output).toContain(
      "Created by: Ada (33333333-3333-4333-8333-333333333333)\n",
    );
    expect(stdout.output).toContain("Body:\nfirst line\nsecond [31m\n");
    expect(stdout.output).not.toContain("\u001B");
  });

  it("prints active and archived incident components in human and JSON output", () => {
    const human = new MemoryWriter();
    const detail = new MemoryWriter();
    const json = new MemoryWriter();
    const active = createComponent();
    const archived = createComponent({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Worker",
      description: null,
      archivedAt: "2026-08-19T20:00:00.000Z",
    });

    printIncidentComponentList(
      human,
      { components: [active, archived] },
      false,
    );
    printIncidentComponentResponse(
      detail,
      { component: active },
      "created",
      false,
    );
    printIncidentComponentList(json, { components: [active, archived] }, true);

    expect(human.output).toContain(
      "55555555-5555-4555-8555-555555555555  active    Checkout API",
    );
    expect(human.output).toContain(
      "66666666-6666-4666-8666-666666666666  archived  Worker",
    );
    expect(detail.output).toContain("Incident component created\n");
    expect(detail.output).toContain("Name: Checkout API\n");
    expect(JSON.parse(json.output)).toEqual({ components: [active, archived] });
  });

  it("prints incident note deletion receipts in human and JSON formats", () => {
    const human = new MemoryWriter();
    const json = new MemoryWriter();

    printIncidentNoteDeletion(
      human,
      createNote().incidentId,
      createNote().id,
      false,
    );
    printIncidentNoteDeletion(
      json,
      createNote().incidentId,
      createNote().id,
      true,
    );

    expect(human.output).toBe(
      "Incident note deleted\n" +
        "Incident ID: 11111111-1111-4111-8111-111111111111\n" +
        "Note ID: 22222222-2222-4222-8222-222222222222\n",
    );
    expect(JSON.parse(json.output)).toEqual({
      incidentId: "11111111-1111-4111-8111-111111111111",
      noteId: "22222222-2222-4222-8222-222222222222",
      deleted: true,
    });
  });
});

class MemoryWriter {
  output = "";

  write(value: string): void {
    this.output += value;
  }
}

function createIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    repositoryFullName: "acme/web",
    createdByUserId: "33333333-3333-4333-8333-333333333333",
    updatedByUserId: null,
    title: "Checkout outage requires bounded display\u001B[31m",
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

function createNote(): IncidentNote {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    incidentId: "11111111-1111-4111-8111-111111111111",
    body: "first line\nsecond\u001B[31m",
    createdAt: "2026-08-18T20:03:02.000Z",
    updatedAt: "2026-08-18T20:03:02.000Z",
    createdBy: null,
    updatedBy: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Ada",
    },
  };
}

function createComponent(
  overrides: Partial<IncidentComponent> = {},
): IncidentComponent {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    organizationId: "77777777-7777-4777-8777-777777777777",
    name: "Checkout API",
    description: "Customer-facing checkout requests",
    archivedAt: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    ...overrides,
  };
}
