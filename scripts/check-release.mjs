import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRelease } from "./release-policy.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(packageDirectory, "package.json");
const metadata = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const release = validateRelease({
  metadata,
  tag: process.argv[2],
  repositorySlug: process.env.GITHUB_REPOSITORY,
  licenseExists: existsSync(resolve(packageDirectory, "LICENSE")),
});

writeOutput("version", release.version);
writeOutput("npm-tag", release.npmTag);
console.log(
  `Validated @toughcrowd/cli@${release.version} for npm dist-tag ${release.npmTag}`,
);

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`);
  }
}
