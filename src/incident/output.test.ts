import { describe, expect, it } from "vitest";
import { printIncidentDetail, printIncidentList } from "./output.js";
import type { Incident, IncidentNote } from "./types.js";

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
    expect(stdout.output).toContain("Resolved: 2026-08-18T21:00:00.000Z\n");
    expect(stdout.output).toContain(
      "Created by: Ada Admin (33333333-3333-4333-8333-333333333333)\n",
    );
    expect(stdout.output).toContain("Body:\nfirst line\nsecond [31m\n");
    expect(stdout.output).not.toContain("\u001B");
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
    repository: "acme/web",
    title: "Checkout outage requires bounded display\u001B[31m",
    summary: "Checkout is down",
    severity: "p1",
    state: "active",
    resolutionSummary: null,
    createdAt: "2026-08-18T20:01:02.000Z",
    updatedAt: "2026-08-18T20:02:02.000Z",
    resolvedAt: null,
    createdBy: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Ada\nAdmin",
    },
    updatedBy: null,
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
