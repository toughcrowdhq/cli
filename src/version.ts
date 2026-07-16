import { readFileSync } from "node:fs";

interface PackageMetadata {
  version: string;
}

export function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as unknown;

  if (!isPackageMetadata(packageJson)) {
    throw new Error("CLI package metadata does not contain a version");
  }

  return packageJson.version;
}

function isPackageMetadata(value: unknown): value is PackageMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string" &&
    value.version.length > 0
  );
}
