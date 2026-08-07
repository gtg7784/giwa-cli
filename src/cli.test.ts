import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { spawn } from "bun";

describe("giwa CLI", () => {
  it("shows help with --help", async () => {
    // given: the CLI source exists
    const cliPath = resolve(import.meta.dir, "cli.ts");

    // when: we run giwa --help
    const proc = spawn({
      cmd: ["bun", cliPath, "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    // then: help text is printed and exit code is 0
    expect(stdout).toContain("giwa");
    expect(stdout).toContain("GIWA OP Stack L2 developer CLI");
    expect(exitCode).toBe(0);
  });

  it("shows version with --version", async () => {
    // given: the CLI source exists
    const cliPath = resolve(import.meta.dir, "cli.ts");

    // when: we run giwa --version
    const proc = spawn({
      cmd: ["bun", cliPath, "--version"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    // then: version is printed and exit code is 0
    expect(stdout.trim()).toBe("0.1.0");
    expect(exitCode).toBe(0);
  });

  it("rejects an unknown command", async () => {
    // given: the CLI source exists
    const cliPath = resolve(import.meta.dir, "cli.ts");

    // when: we run an unknown command
    const proc = spawn({
      cmd: ["bun", cliPath, "unknown-command"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    // then: the CLI reports misuse and exits nonzero
    expect(stderr).toContain("too many arguments");
    expect(exitCode).toBe(1);
  });
});
