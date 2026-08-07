#!/usr/bin/env bun

import { Command, CommanderError } from "commander";
import { ApplicationError, EXIT_CODES, toApplicationError } from "./errors.js";
import { parseGlobalOptions } from "./global-options.js";
import { type OutputWriter, formatError, formatSuccess, writeOutput } from "./output.js";

const version = "0.1.0";

export interface CLIIO {
  stdout: OutputWriter;
  stderr: OutputWriter;
}

export function createProgram(): Command {
  return new Command()
    .name("giwa")
    .description("GIWA OP Stack L2 developer CLI")
    .version(version)
    .option("--json", "output in JSON format")
    .option("--quiet", "suppress successful output")
    .option("--no-color", "disable colored output")
    .option("--timeout <ms>", "timeout in milliseconds")
    .option("--confirmations <count>", "number of confirmations")
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({ writeErr: () => undefined });
}

function requestsJSON(argv: readonly string[]): boolean {
  return argv.includes("--json");
}

function commandError(error: CommanderError): ApplicationError {
  return new ApplicationError("CLI_USAGE", error.message, EXIT_CODES.usage);
}

export function runCLI(argv: string[], io: CLIIO): number {
  const program = createProgram();
  try {
    program.parse(argv);
    const options = parseGlobalOptions(program.opts());

    if (argv.slice(2).length === 0) {
      program.outputHelp();
      return EXIT_CODES.success;
    }

    const output = formatSuccess({ status: "ready" }, "GIWA CLI ready", {
      json: options.json,
      quiet: options.quiet,
    });
    writeOutput(io.stdout, output);
    return EXIT_CODES.success;
  } catch (error) {
    if (
      error instanceof CommanderError &&
      (error.code === "commander.helpDisplayed" || error.code === "commander.version")
    ) {
      return EXIT_CODES.success;
    }

    const appError =
      error instanceof CommanderError ? commandError(error) : toApplicationError(error);
    writeOutput(io.stderr, formatError(appError, requestsJSON(argv)));
    return appError.exitCode;
  }
}

if (import.meta.main) {
  process.exitCode = runCLI(process.argv, {
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
