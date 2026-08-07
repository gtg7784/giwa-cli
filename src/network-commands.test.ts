import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { spawn } from "bun";
import { z } from "zod";

const NetworkItemSchema = z.object({
  alias: z.string(),
  name: z.string(),
  chainId: z.number(),
  rpcUrl: z.string(),
  explorerUrl: z.string(),
  active: z.boolean(),
  portal: z.string().optional(),
  l1StandardBridge: z.string().optional(),
});

const ListPayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    activeNetwork: z.string(),
    networks: z.array(NetworkItemSchema),
  }),
});

const InfoPayloadSchema = z.object({
  ok: z.literal(true),
  data: NetworkItemSchema,
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

async function runCLI(...args: string[]): Promise<CLIResult> {
  const cliPath = resolve(import.meta.dir, "cli.ts");
  const childProcess = spawn({
    cmd: ["bun", cliPath, ...args],
    env: process.env,
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

describe("giwa network read commands", () => {
  it("shows network command help", async () => {
    // given: the CLI is available
    // when: the group is invoked without a subcommand
    const result = await runCLI("network");

    // then: list and info are discoverable
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("info");
    expect(result.exitCode).toBe(0);
  });

  it("lists built-ins and marks the active network", async () => {
    // given: the default registry
    // when: networks are listed for a human
    const result = await runCLI("network", "list");

    // then: both built-ins and the active marker are visible
    expect(result.stdout).toContain("* giwa-sepolia");
    expect(result.stdout).toContain("ethereum-sepolia");
    expect(result.stdout).toContain("91342");
    expect(result.exitCode).toBe(0);
  });

  it("lists authoritative metadata as deterministic JSON", async () => {
    // given: JSON output is requested after the subcommand
    // when: networks are listed
    const result = await runCLI("network", "list", "--json");
    const payload = ListPayloadSchema.parse(JSON.parse(result.stdout));

    // then: active selection and exact GIWA metadata are present
    expect(payload.data.activeNetwork).toBe("giwa-sepolia");
    const giwa = payload.data.networks.find((network) => network.alias === "giwa-sepolia");
    expect(giwa).toEqual(
      expect.objectContaining({
        chainId: 91_342,
        rpcUrl: "https://sepolia-rpc.giwa.io",
        explorerUrl: "https://sepolia-explorer.giwa.io",
        portal: "0x956962C34687A954e611A83619ABaA37Ce6bC78A",
        l1StandardBridge: "0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7",
        active: true,
      }),
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("resolves active and named network info", async () => {
    // given: the default active network
    // when: default and named info are requested
    const active = await runCLI("network", "info", "--json");
    const ethereum = await runCLI("network", "info", "ethereum-sepolia", "--json");

    // then: each request resolves the intended network
    const activePayload = InfoPayloadSchema.parse(JSON.parse(active.stdout));
    const ethereumPayload = InfoPayloadSchema.parse(JSON.parse(ethereum.stdout));
    expect(activePayload.data).toEqual(
      expect.objectContaining({ alias: "giwa-sepolia", chainId: 91_342, active: true }),
    );
    expect(ethereumPayload.data).toEqual(
      expect.objectContaining({
        alias: "ethereum-sepolia",
        chainId: 11_155_111,
        active: false,
      }),
    );
  });

  it("shows network details in human output", async () => {
    // given: a named built-in network
    // when: human info is requested
    const result = await runCLI("network", "info", "giwa-sepolia");

    // then: key connection metadata is visible
    expect(result.stdout).toContain("Chain ID:    91342");
    expect(result.stdout).toContain("https://sepolia-rpc.giwa.io");
    expect(result.stdout).toContain("* Active network");
    expect(result.exitCode).toBe(0);
  });

  it("reports one structured error for an unknown alias", async () => {
    // given: JSON output is requested
    // when: an unknown alias is inspected
    const result = await runCLI("network", "info", "unknown-chain", "--json");
    const payload = ErrorPayloadSchema.parse(JSON.parse(result.stderr));

    // then: one error document and the stable config exit code are returned
    expect(payload.error.code).toBe("CONFIG_NETWORK_NOT_FOUND");
    expect(payload.error.message).toContain("unknown-chain");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.exitCode).toBe(3);
  });
});
