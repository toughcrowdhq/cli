import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  configPath,
  decodeConfig,
  readConfig,
  setConfigValue,
  unsetConfigValue,
  writeConfig,
} from "./config.js";

describe("machine-local configuration", () => {
  it("uses TOUGHCROWD_CONFIG as the effective configuration path", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "custom", "preferences.json");

      expect(configPath({ TOUGHCROWD_CONFIG: path })).toBe(path);
      expect(await readConfig({ TOUGHCROWD_CONFIG: path })).toEqual({
        formatVersion: 1,
      });
    });
  });

  it("writes a versioned document atomically and reads it back", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "nested", "config.json");
      const env = { TOUGHCROWD_CONFIG: path };
      const config = {
        formatVersion: 1 as const,
        session: {
          agentProfile: "codex-cli-chatgpt",
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
        },
      };

      await writeConfig(config, env);

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(config);
      expect(await readConfig(env)).toEqual(config);
      expect(await readdir(join(directory, "nested"))).toEqual(["config.json"]);
    });
  });

  it("preserves other preferences across set and unset operations", () => {
    const initial = {
      formatVersion: 1 as const,
      session: {
        agentProfile: "codex-cli-chatgpt",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    };

    const changed = setConfigValue(initial, "session.model", "gpt-5.6-terra");
    expect(changed).toEqual({
      formatVersion: 1,
      session: {
        agentProfile: "codex-cli-chatgpt",
        model: "gpt-5.6-terra",
        reasoningEffort: "high",
      },
    });
    expect(unsetConfigValue(changed, "session.model")).toEqual({
      formatVersion: 1,
      session: {
        agentProfile: "codex-cli-chatgpt",
        reasoningEffort: "high",
      },
    });
  });

  it("rejects malformed and unsupported files without replacing them", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "config.json");
      const env = { TOUGHCROWD_CONFIG: path };
      const malformed = '{"formatVersion": 2, "session": {"unknown": true}}';
      await writeFile(path, malformed, "utf8");

      await expect(readConfig(env)).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(path, "utf8")).toBe(malformed);
      expect(() => decodeConfig({ formatVersion: 1, extra: true })).toThrow(
        "Configuration contains unsupported keys.",
      );
    });
  });

  it("does not leave a partial target when its parent cannot be created", async () => {
    await withTemporaryDirectory(async (directory) => {
      const parent = join(directory, "not-a-directory");
      const path = join(parent, "config.json");
      await writeFile(parent, "existing file", "utf8");

      await expect(
        writeConfig({ formatVersion: 1 }, { TOUGHCROWD_CONFIG: path }),
      ).rejects.toBeInstanceOf(ConfigError);
      expect(await readFile(parent, "utf8")).toBe("existing file");
    });
  });
});

async function withTemporaryDirectory(
  operation: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "toughcrowd-config-test-"));
  try {
    await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
