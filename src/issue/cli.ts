import { Command, InvalidArgumentError, Option } from "commander";
import type { JsonValue } from "../api/request.js";
import {
  adoptGitHubIssueCommand,
  attachIssueSessionCommand,
  createIssueCommand,
  commentIssueCommand,
  detachIssueSessionCommand,
  listIssueCommand,
  mirrorGitHubIssueCommand,
  reopenIssueCommand,
  resolveIssueCommand,
  retryGitHubIssueCommand,
  showIssueCommand,
  summarizeIssueCommand,
  unlinkGitHubIssueCommand,
  updateIssueCommand,
  verifyIssueCommand,
  type CreateIssueRuntime,
} from "./commands.js";
import {
  issueDispositions,
  issueRelationshipRoles,
  issueStates,
  issueVerificationResults,
  type IssueDisposition,
  type IssueRelationshipRole,
  type IssueState,
  type IssueVerificationResult,
} from "./types.js";

export function createIssueCommandGroup(runtime: CreateIssueRuntime): Command {
  return new Command("issue")
    .description("Work with Tough Crowd issues")
    .addCommand(createListCommand(runtime))
    .addCommand(createNewCommand(runtime))
    .addCommand(createCommentCommand(runtime))
    .addCommand(createShowCommand(runtime))
    .addCommand(createUpdateCommand(runtime))
    .addCommand(createResolveCommand(runtime))
    .addCommand(createReopenCommand(runtime))
    .addCommand(createVerifyCommand(runtime))
    .addCommand(createAttachSessionCommand(runtime))
    .addCommand(createDetachSessionCommand(runtime))
    .addCommand(createMirrorGitHubCommand(runtime))
    .addCommand(createAdoptGitHubCommand(runtime))
    .addCommand(createRetryGitHubCommand(runtime))
    .addCommand(createUnlinkGitHubCommand(runtime))
    .addCommand(createSummaryCommand(runtime));
}

function createCommentCommand(runtime: CreateIssueRuntime): Command {
  return command("comment", "Add an append-only issue comment")
    .argument("<issue-id>", "issue ID")
    .argument("<body>", "comment body")
    .option("--session-id <id>", "associated session ID")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        body: string,
        options: { sessionId?: string; json?: boolean },
      ) => {
        await commentIssueCommand(runtime, {
          issueId,
          body,
          sessionId: options.sessionId,
          json: options.json === true,
        });
      },
    );
}

function createListCommand(runtime: CreateIssueRuntime): Command {
  return command("list", "List issues")
    .option("--repository-id <id>", "filter by repository ID")
    .addOption(
      new Option("--state <state>", "filter by issue state").choices([
        ...issueStates,
      ]),
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (options: {
        repositoryId?: string;
        state?: IssueState;
        json?: boolean;
      }) => {
        await listIssueCommand(runtime, {
          repositoryId: options.repositoryId,
          state: options.state,
          json: options.json === true,
        });
      },
    );
}

function createNewCommand(runtime: CreateIssueRuntime): Command {
  return command("new", "Create an issue")
    .argument("<description>", "issue description")
    .requiredOption("--repository-id <id>", "repository ID")
    .option("--title <title>", "issue title")
    .option("--mirror-github", "also request a linked GitHub issue")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        description: string,
        options: {
          repositoryId: string;
          title?: string;
          mirrorGithub?: boolean;
          json?: boolean;
        },
      ) => {
        await createIssueCommand(runtime, {
          repositoryId: options.repositoryId,
          description,
          title: options.title,
          mirrorToGitHub: options.mirrorGithub === true,
          json: options.json === true,
        });
      },
    );
}

function createShowCommand(runtime: CreateIssueRuntime): Command {
  return command("show", "Show issue detail")
    .argument("<issue-id>", "issue ID")
    .option("--json", "print machine-readable JSON")
    .action(async (issueId: string, options: { json?: boolean }) => {
      await showIssueCommand(runtime, { issueId, json: options.json === true });
    });
}

function createUpdateCommand(runtime: CreateIssueRuntime): Command {
  const updateCommand = command("update", "Update an issue")
    .argument("<issue-id>", "issue ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .option("--title <title>", "new issue title")
    .option("--description <description>", "new issue description")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        options: {
          issueVersion: number;
          title?: string;
          description?: string;
          json?: boolean;
        },
      ) => {
        if (options.title == null && options.description == null) {
          updateCommand.error(
            "error: at least one of --title or --description is required",
          );
        }
        await updateIssueCommand(runtime, {
          issueId,
          version: options.issueVersion,
          title: options.title,
          description: options.description,
          json: options.json === true,
        });
      },
    );
  return updateCommand;
}

function createResolveCommand(runtime: CreateIssueRuntime): Command {
  return command("resolve", "Resolve an issue")
    .argument("<issue-id>", "issue ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .addOption(
      new Option("--disposition <disposition>", "resolution disposition")
        .choices([...issueDispositions])
        .makeOptionMandatory(),
    )
    .option("--note <note>", "resolution note")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        options: {
          issueVersion: number;
          disposition: IssueDisposition;
          note?: string;
          json?: boolean;
        },
      ) => {
        await resolveIssueCommand(runtime, {
          issueId,
          version: options.issueVersion,
          disposition: options.disposition,
          note: options.note,
          json: options.json === true,
        });
      },
    );
}

function createReopenCommand(runtime: CreateIssueRuntime): Command {
  return command("reopen", "Reopen an issue")
    .argument("<issue-id>", "issue ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        options: { issueVersion: number; json?: boolean },
      ) => {
        await reopenIssueCommand(runtime, {
          issueId,
          version: options.issueVersion,
          json: options.json === true,
        });
      },
    );
}

function createVerifyCommand(runtime: CreateIssueRuntime): Command {
  return command("verify", "Record production verification")
    .argument("<issue-id>", "issue ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .addOption(
      new Option("--result <result>", "verification result")
        .choices([...issueVerificationResults])
        .makeOptionMandatory(),
    )
    .requiredOption("--environment <name>", "verified environment")
    .option("--note <note>", "verification note")
    .option("--session-id <id>", "linked verification session ID")
    .option("--deployment-evidence-id <id>", "deployment evidence ID")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        options: {
          issueVersion: number;
          result: IssueVerificationResult;
          environment: string;
          note?: string;
          sessionId?: string;
          deploymentEvidenceId?: string;
          json?: boolean;
        },
      ) => {
        await verifyIssueCommand(runtime, {
          issueId,
          version: options.issueVersion,
          result: options.result,
          environment: options.environment,
          note: options.note,
          sessionId: options.sessionId,
          deploymentEvidenceId: options.deploymentEvidenceId,
          json: options.json === true,
        });
      },
    );
}

function createAttachSessionCommand(runtime: CreateIssueRuntime): Command {
  return command("attach-session", "Attach a session to an issue")
    .argument("<issue-id>", "issue ID")
    .argument("<session-id>", "session ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .addOption(
      new Option("--role <role>", "session relationship role")
        .choices([...issueRelationshipRoles])
        .makeOptionMandatory(),
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        sessionId: string,
        options: {
          issueVersion: number;
          role: IssueRelationshipRole;
          json?: boolean;
        },
      ) => {
        await attachIssueSessionCommand(runtime, {
          issueId,
          sessionId,
          version: options.issueVersion,
          role: options.role,
          json: options.json === true,
        });
      },
    );
}

function createDetachSessionCommand(runtime: CreateIssueRuntime): Command {
  return command("detach-session", "Detach a session from an issue")
    .argument("<issue-id>", "issue ID")
    .argument("<session-id>", "session ID")
    .requiredOption(
      "--issue-version <number>",
      "current issue version",
      parsePositiveInteger,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        sessionId: string,
        options: { issueVersion: number; json?: boolean },
      ) => {
        await detachIssueSessionCommand(runtime, {
          issueId,
          sessionId,
          version: options.issueVersion,
          json: options.json === true,
        });
      },
    );
}

function createMirrorGitHubCommand(runtime: CreateIssueRuntime): Command {
  return command("mirror-github", "Request a linked GitHub issue")
    .argument("<issue-id>", "issue ID")
    .option("--json", "print machine-readable JSON")
    .action(async (issueId: string, options: { json?: boolean }) => {
      await mirrorGitHubIssueCommand(runtime, {
        issueId,
        json: options.json === true,
      });
    });
}

function createAdoptGitHubCommand(runtime: CreateIssueRuntime): Command {
  return command("adopt-github", "Link an existing GitHub issue")
    .argument("<issue-id>", "issue ID")
    .requiredOption("--scope-id <id>", "GitHub repository ID")
    .requiredOption("--external-id <id>", "GitHub issue ID")
    .requiredOption("--key <key>", "GitHub issue key")
    .requiredOption("--url <url>", "GitHub issue URL")
    .option("--external-title <title>", "current GitHub issue title")
    .option("--state-category <state>", "current provider state category")
    .option(
      "--provider-state <json>",
      "provider state JSON object",
      parseJsonObject,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        issueId: string,
        options: {
          scopeId: string;
          externalId: string;
          key: string;
          url: string;
          externalTitle?: string;
          stateCategory?: string;
          providerState?: { readonly [key: string]: JsonValue };
          json?: boolean;
        },
      ) => {
        await adoptGitHubIssueCommand(runtime, {
          issueId,
          externalScopeId: options.scopeId,
          externalIssueId: options.externalId,
          externalKey: options.key,
          url: options.url,
          externalTitle: options.externalTitle,
          stateCategory: options.stateCategory,
          providerState: options.providerState,
          json: options.json === true,
        });
      },
    );
}

function createRetryGitHubCommand(runtime: CreateIssueRuntime): Command {
  return command("retry-github", "Retry GitHub issue synchronization")
    .argument("<issue-id>", "issue ID")
    .option("--json", "print machine-readable JSON")
    .action(async (issueId: string, options: { json?: boolean }) => {
      await retryGitHubIssueCommand(runtime, {
        issueId,
        json: options.json === true,
      });
    });
}

function createUnlinkGitHubCommand(runtime: CreateIssueRuntime): Command {
  return command("unlink-github", "Remove the GitHub issue link")
    .argument("<issue-id>", "issue ID")
    .option("--json", "print machine-readable JSON")
    .action(async (issueId: string, options: { json?: boolean }) => {
      await unlinkGitHubIssueCommand(runtime, {
        issueId,
        json: options.json === true,
      });
    });
}

function createSummaryCommand(runtime: CreateIssueRuntime): Command {
  return command("summary", "Summarize issue outcomes")
    .option("--repository-id <id>", "filter by repository ID")
    .option(
      "--created-from <timestamp>",
      "inclusive creation start",
      parseTimestamp,
    )
    .option(
      "--created-to <timestamp>",
      "inclusive creation end",
      parseTimestamp,
    )
    .option("--json", "print machine-readable JSON")
    .action(
      async (options: {
        repositoryId?: string;
        createdFrom?: string;
        createdTo?: string;
        json?: boolean;
      }) => {
        await summarizeIssueCommand(runtime, {
          ...options,
          json: options.json === true,
        });
      },
    );
}

function command(name: string, description: string): Command {
  return new Command(name)
    .description(description)
    .allowExcessArguments(false)
    .allowUnknownOption(false);
}

function parsePositiveInteger(value: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
}

function parseTimestamp(value: string): string {
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)) {
      throw new Error();
    }
    return new Date(value).toISOString();
  } catch {
    throw new InvalidArgumentError("must be an ISO 8601 UTC timestamp");
  }
}

function parseJsonObject(value: string): { readonly [key: string]: JsonValue } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InvalidArgumentError("must be a JSON object");
  }
  if (!isJsonObject(parsed)) {
    throw new InvalidArgumentError("must be a JSON object");
  }
  return parsed;
}

function isJsonObject(
  value: unknown,
): value is { readonly [key: string]: JsonValue } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
