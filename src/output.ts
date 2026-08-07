import type { ApplicationError } from "./errors.js";

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

export interface OutputWriter {
  write(value: string): unknown;
}

export function formatSuccess(data: unknown, human: string, options: OutputOptions): string {
  if (options.quiet) {
    return "";
  }
  if (options.json) {
    return JSON.stringify({ ok: true, data });
  }
  return human;
}

export function formatError(error: ApplicationError, json: boolean): string {
  if (json) {
    return JSON.stringify({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
  return `Error [${error.code}]: ${error.message}`;
}

export function writeOutput(writer: OutputWriter, output: string): void {
  if (output.length > 0) {
    writer.write(`${output}\n`);
  }
}
