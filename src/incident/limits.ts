import { Buffer } from "node:buffer";

export const incidentNoteBodyMaxBytes = 256 * 1024;

export function incidentNoteBodyBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
