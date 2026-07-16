import { describe, expect, it } from "vitest";
import { npmTagForVersion, validateRelease } from "./release-policy.mjs";

const publishableMetadata = {
  name: "@toughcrowd/cli",
  version: "0.1.0",
  license: "Apache-2.0",
  repository: {
    type: "git",
    url: "git+https://github.com/toughcrowdhq/cli.git",
  },
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org",
  },
  bin: {
    toughcrowd: "./dist/index.js",
  },
};

describe("CLI release policy", () => {
  it("uses latest for stable versions and next for prereleases", () => {
    expect(npmTagForVersion("0.1.0")).toBe("latest");
    expect(npmTagForVersion("0.2.0-beta.1")).toBe("next");
  });

  it("accepts a publishable package whose protected tag matches", () => {
    expect(
      validateRelease({
        metadata: publishableMetadata,
        tag: "v0.1.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: true,
      }),
    ).toEqual({ version: "0.1.0", npmTag: "latest" });
  });

  it("rejects a tag that differs from the package version", () => {
    expect(() =>
      validateRelease({
        metadata: publishableMetadata,
        tag: "v0.2.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: true,
      }),
    ).toThrow("release tag must be v0.1.0; received v0.2.0");
  });

  it("rejects a package that is still private", () => {
    expect(() =>
      validateRelease({
        metadata: { ...publishableMetadata, private: true },
        tag: "v0.1.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: true,
      }),
    ).toThrow("CLI package is still private");
  });

  it("rejects a package without an approved license", () => {
    expect(() =>
      validateRelease({
        metadata: { ...publishableMetadata, license: "UNLICENSED" },
        tag: "v0.1.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: true,
      }),
    ).toThrow("CLI package needs an approved license");
  });

  it("rejects a package whose LICENSE file is missing", () => {
    expect(() =>
      validateRelease({
        metadata: publishableMetadata,
        tag: "v0.1.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: false,
      }),
    ).toThrow("CLI package LICENSE file is missing");
  });

  it("rejects a package without repository metadata", () => {
    const { repository: _repository, ...metadataWithoutRepository } =
      publishableMetadata;

    expect(() =>
      validateRelease({
        metadata: metadataWithoutRepository,
        tag: "v0.1.0",
        repositorySlug: "toughcrowdhq/cli",
        licenseExists: true,
      }),
    ).toThrow("CLI package repository metadata is missing");
  });
});
