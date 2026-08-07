import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { z } from "zod";

const SuccessPayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    alias: z.string(),
    chainId: z.number(),
    active: z.boolean(),
  }),
});

const ErrorPayloadSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCLI(configDir: string, ...args: string[]): Promise<CLIResult> {
  const cliPath = resolve(import.meta.dir, "cli.ts");
  const childProcess = spawn({
    cmd: ["bun", cliPath, ...args],
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

async function addLocalNetwork(configDir: string): Promise<CLIResult> {
  return runCLI(
    configDir,
    "network",
    "add",
    "local-test",
    "--chain-id",
    "31337",
    "--rpc-url",
    "http://127.0.0.1:8545",
    "--explorer-url",
    "http://127.0.0.1:4000",
    "--json",
  );
}

describe("giwa network write commands", () => {
  let configDir = "";

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "giwa-network-cli-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("adds and persists a typed custom network", async () => {
    // given: an isolated empty config directory
    // when: a custom network is added
    const result = await addLocalNetwork(configDir);
    const info = await runCLI(configDir, "network", "info", "local-test", "--json");

    // then: success is structured and a fresh process resolves it
    expect(SuccessPayloadSchema.parse(JSON.parse(result.stdout)).data).toEqual({
      alias: "local-test",
      chainId: 31_337,
      active: false,
    });
    expect(SuccessPayloadSchema.parse(JSON.parse(info.stdout)).data.alias).toBe("local-test");
    expect(result.exitCode).toBe(0);
  });

  it("selects a network for subsequent commands", async () => {
    // given: a persisted custom network
    await addLocalNetwork(configDir);

    // when: it is selected
    const result = await runCLI(configDir, "network", "use", "local-test", "--json");
    const list = await runCLI(configDir, "network", "list", "--json");

    // then: use reports active and list preserves the selection
    expect(SuccessPayloadSchema.parse(JSON.parse(result.stdout)).data.active).toBe(true);
    const listPayload = z
      .object({ ok: z.literal(true), data: z.object({ activeNetwork: z.string() }) })
      .parse(JSON.parse(list.stdout));
    expect(listPayload.data.activeNetwork).toBe("local-test");
    expect(result.exitCode).toBe(0);
  });

  it("preserves exact config bytes after rejected writes", async () => {
    // given: a valid persisted custom network
    await addLocalNetwork(configDir);
    const configFile = join(configDir, "config.json");
    const before = readFileSync(configFile);

    // when: duplicate ID, unsafe URL, and unknown selection are attempted
    const duplicate = await runCLI(
      configDir,
      "network",
      "add",
      "duplicate",
      "--chain-id",
      "31337",
      "--rpc-url",
      "http://127.0.0.1:9545",
      "--explorer-url",
      "http://127.0.0.1:5000",
      "--json",
    );
    const unsafe = await runCLI(
      configDir,
      "network",
      "add",
      "unsafe",
      "--chain-id",
      "31338",
      "--rpc-url",
      "file:///tmp/rpc",
      "--explorer-url",
      "https://example.com",
      "--json",
    );
    const unknown = await runCLI(configDir, "network", "use", "missing", "--json");

    // then: each error is stable and no command changes persisted bytes
    expect(ErrorPayloadSchema.parse(JSON.parse(duplicate.stderr)).error.code).toBe(
      "CONFIG_DUPLICATE_CHAIN_ID",
    );
    expect(ErrorPayloadSchema.parse(JSON.parse(unsafe.stderr)).error.code).toBe(
      "CONFIG_INVALID_NETWORK",
    );
    expect(ErrorPayloadSchema.parse(JSON.parse(unknown.stderr)).error.code).toBe(
      "CONFIG_NETWORK_NOT_FOUND",
    );
    expect(readFileSync(configFile)).toEqual(before);
  });

  it("rejects malformed numeric input before writing", async () => {
    // given: an invalid chain ID
    // when: add parses the command boundary
    const result = await runCLI(
      configDir,
      "network",
      "add",
      "bad-chain",
      "--chain-id",
      "not-a-number",
      "--rpc-url",
      "https://rpc.example.com",
      "--explorer-url",
      "https://explorer.example.com",
      "--json",
    );

    // then: input fails with usage code and no config is created
    expect(ErrorPayloadSchema.parse(JSON.parse(result.stderr)).error.code).toBe("INVALID_INPUT");
    expect(result.exitCode).toBe(2);
    expect(Bun.file(join(configDir, "config.json")).size).toBe(0);
  });
});
