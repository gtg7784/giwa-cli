import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { parseGlobalOptions } from "./global-options.js";
import type { ProjectCommandContext } from "./init-command.js";
import { formatSuccess, writeOutput } from "./output.js";
import { loadProjectConfig, projectConfigPath } from "./project-config.js";
import { type ScaffoldResult, createScaffold } from "./scaffolds.js";

const ContractNameSchema = z
  .string()
  .regex(/^[A-Z][A-Za-z0-9]*$/, "must start uppercase and contain only letters or digits");
const AppNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug");

function projectError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

function findWorkspace(directory: string | undefined): string {
  if (directory !== undefined) {
    const explicit = resolve(directory);
    if (!existsSync(projectConfigPath(explicit))) {
      throw projectError("PROJECT_NOT_FOUND", `No GIWA workspace found at ${explicit}`);
    }
    return explicit;
  }

  let current = resolve(process.cwd());
  while (!existsSync(projectConfigPath(current))) {
    const parent = dirname(current);
    if (parent === current) {
      throw projectError("PROJECT_NOT_FOUND", "No GIWA workspace found; run giwa init first");
    }
    current = parent;
  }
  return current;
}

function executeCreate(
  type: "contract" | "app",
  rawName: string,
  projectDirectory: string | undefined,
  context: ProjectCommandContext,
): ScaffoldResult {
  const name =
    type === "contract" ? ContractNameSchema.parse(rawName) : AppNameSchema.parse(rawName);
  const workspace = findWorkspace(projectDirectory);
  const config = loadProjectConfig(workspace);
  const network = context.getRegistry().resolveNetwork(config.selectedNetwork);
  const parent = type === "contract" ? config.contracts : config.apps;
  return createScaffold(join(workspace, parent, name), type, name, network);
}

function writeCreateResult(
  program: Command,
  context: ProjectCommandContext,
  result: ScaffoldResult,
): void {
  const options = parseGlobalOptions(program.opts());
  writeOutput(
    context.io.stdout,
    formatSuccess(result, `Created ${result.type} "${result.name}" at ${result.directory}`, {
      json: options.json,
      quiet: options.quiet,
    }),
  );
}

export function registerCreateCommand(program: Command, context: ProjectCommandContext): void {
  const createCommand = program
    .command("create")
    .description("Create GIWA project artifacts")
    .action(() => createCommand.outputHelp());

  createCommand
    .command("contract <name>")
    .description("Create a dependency-free Foundry contract")
    .option("--project <directory>", "GIWA workspace directory")
    .allowExcessArguments(false)
    .action((name: string, options: { project?: string }) => {
      writeCreateResult(
        program,
        context,
        executeCreate("contract", name, options.project, context),
      );
    });

  createCommand
    .command("app <name>")
    .description("Create a dependency-free Bun browser app")
    .option("--project <directory>", "GIWA workspace directory")
    .allowExcessArguments(false)
    .action((name: string, options: { project?: string }) => {
      writeCreateResult(program, context, executeCreate("app", name, options.project, context));
    });
}
