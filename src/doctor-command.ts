import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { parseGlobalOptions } from "./global-options.js";
import type { ProjectCommandContext } from "./init-command.js";
import { formatSuccess, writeOutput } from "./output.js";
import { loadProjectConfig, projectConfigPath } from "./project-config.js";
import type { Registry } from "./registry.js";

interface DoctorCheck {
  readonly id: string;
  readonly ok: true;
  readonly details: string;
}

export interface DoctorResult {
  readonly ok: true;
  readonly directory: string;
  readonly checks: readonly DoctorCheck[];
}

function doctorError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

function getBunVersion(): string {
  const result = z.object({ bun: z.string().min(1) }).safeParse(process.versions);
  if (!result.success) {
    throw doctorError("DOCTOR_RUNTIME_UNSUPPORTED", "GIWA CLI requires the Bun runtime");
  }
  return result.data.bun;
}

function requireDirectory(path: string, label: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw doctorError("DOCTOR_MISSING_DIRECTORY", `${label} directory is missing: ${path}`);
  }
}

export function executeDoctor(
  directory: string | undefined,
  getRegistry: () => Registry,
): DoctorResult {
  const targetDirectory = resolve(directory ?? process.cwd());
  requireDirectory(targetDirectory, "Project");
  if (!existsSync(projectConfigPath(targetDirectory))) {
    throw doctorError(
      "DOCTOR_CONFIG_NOT_FOUND",
      `Project configuration not found in ${targetDirectory}`,
    );
  }

  const config = loadProjectConfig(targetDirectory);
  const network = getRegistry().resolveNetwork(config.selectedNetwork);
  requireDirectory(join(targetDirectory, config.contracts), "Contracts");
  requireDirectory(join(targetDirectory, config.apps), "Apps");

  return {
    ok: true,
    directory: targetDirectory,
    checks: [
      { id: "config", ok: true, details: "giwa.config.json is valid" },
      {
        id: "network",
        ok: true,
        details: `${network.name} (${network.alias}, chain ${network.id})`,
      },
      { id: "contracts", ok: true, details: config.contracts },
      { id: "apps", ok: true, details: config.apps },
      { id: "bun", ok: true, details: `v${getBunVersion()}` },
    ],
  };
}

function formatDoctor(result: DoctorResult): string {
  return [
    `GIWA doctor: ${result.directory}`,
    ...result.checks.map((check) => `[ok] ${check.id}: ${check.details}`),
  ].join("\n");
}

export function registerDoctorCommand(program: Command, context: ProjectCommandContext): void {
  program
    .command("doctor [directory]")
    .description("Validate a GIWA workspace")
    .allowExcessArguments(false)
    .action((directory?: string) => {
      const result = executeDoctor(directory, context.getRegistry);
      const globalOptions = parseGlobalOptions(program.opts());
      writeOutput(
        context.io.stdout,
        formatSuccess(result, formatDoctor(result), {
          json: globalOptions.json,
          quiet: globalOptions.quiet,
        }),
      );
    });
}
