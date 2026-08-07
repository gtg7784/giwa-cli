import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { spawn } from "bun";

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCLI(...args: string[]): Promise<CLIResult> {
  const cliPath = resolve(import.meta.dir, "cli.ts");
  const process = spawn({
    cmd: ["bun", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("giwa CLI", () => {
  it("shows root help and all global options", async () => {
    // given: the CLI is available
    // when: help is requested
    const result = await runCLI("--help");

    // then: the root contract is discoverable
    expect(result.stdout).toContain("GIWA OP Stack L2 developer CLI");
    for (const option of ["--json", "--quiet", "--no-color", "--timeout", "--confirmations"]) {
      expect(result.stdout).toContain(option);
    }
    expect(result.exitCode).toBe(0);
  });

  it("shows the package version", async () => {
    // given: the CLI is available
    // when: version is requested
    const result = await runCLI("--version");

    // then: the stable version is printed
    expect(result.stdout.trim()).toBe("0.1.0");
    expect(result.exitCode).toBe(0);
  });

  it("returns structured JSON for unknown commands", async () => {
    // given: JSON output is requested
    // when: an unknown command is provided
    const result = await runCLI("--json", "unknown-command");

    // then: stderr is machine-readable and usage fails stably
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "CLI_USAGE",
        message: "error: too many arguments. Expected 0 arguments but got 1.",
      },
    });
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(2);
  });

  it("reports malformed global input without hiding details", async () => {
    // given: JSON output is requested
    // when: timeout is not a positive integer
    const result = await runCLI("--json", "--timeout", "nope");

    // then: validation details and usage exit code are returned
    const payload = JSON.parse(result.stderr);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INVALID_INPUT");
    expect(payload.error.message).toContain("timeout");
    expect(result.exitCode).toBe(2);
  });

  it("quiet mode suppresses only successful output", async () => {
    // given: quiet output is requested
    // when: a successful root invocation runs
    const success = await runCLI("--quiet");
    const failure = await runCLI("--quiet", "unknown-command");

    // then: success is silent while errors remain visible
    expect(success.stdout).toBe("");
    expect(success.exitCode).toBe(0);
    expect(failure.stderr).toContain("CLI_USAGE");
    expect(failure.exitCode).toBe(2);
  });

  it("accepts valid timeout confirmations and no-color options", async () => {
    // given: valid boundary values are provided
    // when: the CLI parses all typed global options
    const result = await runCLI("--json", "--no-color", "--timeout", "1", "--confirmations", "0");

    // then: the invocation succeeds with deterministic JSON
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: { status: "ready" } });
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
