import { existsSync, mkdirSync, rmSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { parseGlobalOptions } from "./global-options.js";
import type { CommandIO } from "./network-commands.js";
import { formatSuccess, writeOutput } from "./output.js";
import {
  type ProjectConfig,
  createProjectConfig,
  createWorkspaceDirectories,
  projectConfigPath,
  saveProjectConfig,
} from "./project-config.js";
import type { Registry } from "./registry.js";

export interface ProjectCommandContext {
  readonly io: CommandIO;
  getRegistry(): Registry;
}

export interface InitResult {
  readonly directory: string;
  readonly config: ProjectConfig;
}

function initError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

export function executeInit(
  directory: string | undefined,
  networkOverride: string | undefined,
  getRegistry: () => Registry,
): InitResult {
  const targetDirectory = resolve(directory ?? process.cwd());
  const targetExists = existsSync(targetDirectory);
  if (directory !== undefined && targetExists) {
    throw initError("INIT_DIRECTORY_EXISTS", `Directory already exists: ${targetDirectory}`);
  }
  if (existsSync(projectConfigPath(targetDirectory))) {
    throw initError("INIT_CONFIG_EXISTS", `Workspace already exists: ${targetDirectory}`);
  }

  const registry = getRegistry();
  const selectedNetwork = registry.resolveNetwork(
    networkOverride ?? registry.getActiveNetwork().alias,
  );
  const config = createProjectConfig(selectedNetwork.alias);
  let createdTarget = false;
  let createdWorkspaceDirectories: readonly string[] = [];

  try {
    if (!targetExists) {
      mkdirSync(targetDirectory, { recursive: true });
      createdTarget = true;
    }
    createdWorkspaceDirectories = createWorkspaceDirectories(targetDirectory, config);
    saveProjectConfig(targetDirectory, config);
    return { directory: targetDirectory, config };
  } catch (error) {
    if (createdTarget) {
      rmSync(targetDirectory, { recursive: true, force: true });
    } else {
      for (const created of [...createdWorkspaceDirectories].reverse()) {
        rmdirSync(created);
      }
    }
    throw error;
  }
}

export function registerInitCommand(program: Command, context: ProjectCommandContext): void {
  program
    .command("init [directory]")
    .description("Initialize a GIWA workspace")
    .option("--network <alias>", "workspace network alias")
    .allowExcessArguments(false)
    .action((directory: string | undefined, options: { network?: string }) => {
      const result = executeInit(directory, options.network, context.getRegistry);
      const globalOptions = parseGlobalOptions(program.opts());
      writeOutput(
        context.io.stdout,
        formatSuccess(result, `Initialized GIWA workspace at ${result.directory}`, {
          json: globalOptions.json,
          quiet: globalOptions.quiet,
        }),
      );
    });
}
