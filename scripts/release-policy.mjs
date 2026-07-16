const releaseVersionPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function npmTagForVersion(version) {
  assert(
    releaseVersionPattern.test(version),
    "package version is not valid SemVer",
  );
  return version.includes("-") ? "next" : "latest";
}

export function validateRelease({
  metadata,
  tag,
  repositorySlug,
  licenseExists,
}) {
  assert(
    typeof metadata.version === "string" &&
      releaseVersionPattern.test(metadata.version),
    "package version is not valid SemVer",
  );
  assert(
    tag === `v${metadata.version}`,
    `release tag must be v${metadata.version}; received ${tag ?? "nothing"}`,
  );
  assert(
    metadata.private !== true,
    "CLI package is still private; complete the activation checklist before publishing",
  );
  assert(
    typeof metadata.license === "string" && metadata.license !== "UNLICENSED",
    "CLI package needs an approved license before publishing",
  );
  assert(licenseExists, "CLI package LICENSE file is missing");

  const repositoryUrl = resolveRepositoryUrl(metadata.repository);
  assert(repositoryUrl, "CLI package repository metadata is missing");
  if (repositorySlug) {
    assert(
      repositoryUrl.includes(repositorySlug),
      `repository metadata must reference ${repositorySlug}`,
    );
  }

  assert(
    metadata.publishConfig?.access === "public",
    "CLI publishConfig.access must be public",
  );
  assert(
    metadata.publishConfig?.registry === "https://registry.npmjs.org",
    "CLI publishConfig.registry must be the public npm registry",
  );
  assert(
    Object.keys(metadata.bin ?? {}).length === 1 &&
      metadata.bin?.toughcrowd === "./dist/index.js",
    "CLI package must expose only the toughcrowd executable",
  );

  return {
    version: metadata.version,
    npmTag: npmTagForVersion(metadata.version),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveRepositoryUrl(repository) {
  if (typeof repository === "string") {
    return repository;
  }
  if (typeof repository?.url === "string") {
    return repository.url;
  }
  return null;
}
