import { ZodError } from "zod";

export const EXIT_CODES = {
  success: 0,
  usage: 2,
  config: 3,
  network: 4,
  external: 5,
  internal: 70,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class ApplicationError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;

  constructor(code: string, message: string, exitCode: ExitCode) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (error instanceof ZodError) {
    const details = error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    return new ApplicationError(
      "INVALID_INPUT",
      `Invalid global options: ${details}`,
      EXIT_CODES.usage,
    );
  }

  return new ApplicationError(
    "INTERNAL_ERROR",
    "An unexpected internal error occurred",
    EXIT_CODES.internal,
  );
}
