import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { z } from "zod";

const InitPayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    directory: z.string(),
    config: z.object({
      version: z.literal(1),
      selectedNetwork: z.string(),
      contracts: z.string(),
      apps: z.string(),
    }),
  }),
});

const DoctorPayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    ok: z.literal(true),
    directory: z.string(),
    checks: z.array(z.object({ id: z.string(), ok: z.literal(true), details: z.string() })),
  }),
});

const ErrorPayloadSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

interface CLIResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function runCLI(configDir: string, ...args: string[]): Promise<CLIResult> {
  return runCLIIn(process.cwd(), configDir, ...args);
}

async function runCLIIn(cwd: string, configDir: string, ...args: string[]): Promise<CLIResult> {
  const cliPath = resolve(import.meta.dir, "cli.ts");
  const childProcess = spawn({
    cmd: ["bun", cliPath, ...args],
    cwd,
    env: { ...process.env, GIWA_CONFIG_DIR: configDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text(),
    childProcess.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("giwa project init and doctor", () => {
  let sandbox = "";
  let configDir = "";

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "giwa-project-"));
    configDir = join(sandbox, "global-config");
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("initializes a new directory and passes doctor", async () => {
    // given: a path that does not exist
    const projectDirectory = join(sandbox, "workspace");

    // when: init and doctor run through separate CLI processes
    const initialized = await runCLI(
      configDir,
      "init",
      projectDirectory,
      "--network",
      "ethereum-sepolia",
      "--json",
    );
    const diagnosed = await runCLI(configDir, "doctor", projectDirectory, "--json");

    // then: config, directories, network, and runtime are truthful
    const initPayload = InitPayloadSchema.parse(JSON.parse(initialized.stdout));
    const doctorPayload = DoctorPayloadSchema.parse(JSON.parse(diagnosed.stdout));
    expect(initPayload.data.config.selectedNetwork).toBe("ethereum-sepolia");
    expect(doctorPayload.data.checks.map((check) => check.id)).toEqual([
      "config",
      "network",
      "contracts",
      "apps",
      "bun",
    ]);
    expect(statSync(join(projectDirectory, "contracts")).isDirectory()).toBe(true);
    expect(statSync(join(projectDirectory, "apps")).isDirectory()).toBe(true);
    expect(initialized.exitCode).toBe(0);
    expect(diagnosed.exitCode).toBe(0);
  });

  it("initializes the current directory only once", async () => {
    // given: an existing directory with unrelated user content
    const userFile = join(sandbox, "README.user");
    writeFileSync(userFile, "keep me", "utf8");

    // when: cwd-style init is executed twice
    const first = await runCLIIn(sandbox, configDir, "init", "--json");
    const configFile = join(sandbox, "giwa.config.json");
    const before = readFileSync(configFile);
    const second = await runCLIIn(sandbox, configDir, "init", "--json");

    // then: first init succeeds and duplicate init preserves all files
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(3);
    expect(ErrorPayloadSchema.parse(JSON.parse(second.stderr)).error.code).toBe(
      "INIT_CONFIG_EXISTS",
    );
    expect(readFileSync(userFile, "utf8")).toBe("keep me");
    expect(readFileSync(configFile)).toEqual(before);
  });

  it("preserves config bytes when duplicate init is rejected", async () => {
    // given: a workspace initialized in an existing cwd through process cwd
    const projectDirectory = join(sandbox, "workspace");
    await runCLI(configDir, "init", projectDirectory, "--json");
    const configFile = join(projectDirectory, "giwa.config.json");
    const before = readFileSync(configFile);

    // when: init targets the existing workspace
    const result = await runCLI(configDir, "init", projectDirectory, "--json");

    // then: the error is typed and persisted bytes are unchanged
    expect(ErrorPayloadSchema.parse(JSON.parse(result.stderr)).error.code).toBe(
      "INIT_DIRECTORY_EXISTS",
    );
    expect(result.exitCode).toBe(3);
    expect(readFileSync(configFile)).toEqual(before);
  });

  it("reports missing and unsafe project state truthfully", async () => {
    // given: one missing project and one unsafe config
    const missing = join(sandbox, "missing");
    const unsafe = join(sandbox, "unsafe");
    await runCLI(configDir, "init", unsafe, "--json");
    writeFileSync(
      join(unsafe, "giwa.config.json"),
      JSON.stringify({
        version: 1,
        selectedNetwork: "giwa-sepolia",
        contracts: "../contracts",
        apps: "apps",
      }),
      "utf8",
    );

    // when: doctor inspects both paths
    const missingResult = await runCLI(configDir, "doctor", missing, "--json");
    const unsafeResult = await runCLI(configDir, "doctor", unsafe, "--json");

    // then: neither failure is reported as healthy
    expect(ErrorPayloadSchema.parse(JSON.parse(missingResult.stderr)).error.code).toBe(
      "DOCTOR_MISSING_DIRECTORY",
    );
    expect(ErrorPayloadSchema.parse(JSON.parse(unsafeResult.stderr)).error.code).toBe(
      "PROJECT_CONFIG_INVALID",
    );
    expect(missingResult.exitCode).toBe(3);
    expect(unsafeResult.exitCode).toBe(3);
  });
});
