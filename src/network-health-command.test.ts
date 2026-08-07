import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { z } from "zod";
import { createRegistry } from "./registry.js";

const RpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.enum(["eth_chainId", "eth_blockNumber"]),
  id: z.number().int(),
});

const HealthPayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    alias: z.string(),
    configuredChainId: z.number(),
    reportedChainId: z.number(),
    chainIdMatches: z.literal(true),
    blockNumber: z.string(),
    latencyMs: z.number().nonnegative(),
    reachable: z.literal(true),
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

type TestServer = ReturnType<typeof Bun.serve>;

function startRpcServer(chainIdHex = "0x7a69", blockNumberHex = "0x2a"): TestServer {
  return Bun.serve({
    port: 0,
    async fetch(request): Promise<Response> {
      const parsed = RpcRequestSchema.parse(await request.json());
      const result = parsed.method === "eth_chainId" ? chainIdHex : blockNumberHex;
      return Response.json({ jsonrpc: "2.0", id: parsed.id, result });
    },
  });
}

function rpcUrl(server: TestServer): string {
  return `http://127.0.0.1:${server.port}`;
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

function configureLocalNetwork(configDir: string, url: string): void {
  const registry = createRegistry(configDir);
  registry.addNetwork({
    id: 31_337,
    alias: "local-health",
    name: "Local Health",
    layer: "L2",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: url,
    explorerUrl: "http://127.0.0.1:4000",
  });
  registry.selectNetwork("local-health");
}

describe("giwa network health", () => {
  let configDir = "";
  let servers: TestServer[] = [];

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "giwa-health-"));
    servers = [];
  });

  afterEach(() => {
    for (const server of servers) {
      server.stop(true);
    }
    rmSync(configDir, { recursive: true, force: true });
  });

  it("reports active network health as deterministic JSON", async () => {
    // given: a subscribed local JSON-RPC server and active custom network
    const server = startRpcServer();
    servers.push(server);
    configureLocalNetwork(configDir, rpcUrl(server));

    // when: health defaults to the active network
    const result = await runCLI(configDir, "network", "health", "--json");
    const payload = HealthPayloadSchema.parse(JSON.parse(result.stdout));

    // then: chain, block, reachability, and latency are reported
    expect(payload.data).toEqual(
      expect.objectContaining({
        alias: "local-health",
        configuredChainId: 31_337,
        reportedChainId: 31_337,
        chainIdMatches: true,
        blockNumber: "42",
        reachable: true,
      }),
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("shows named network health in human output", async () => {
    // given: a healthy local JSON-RPC network
    const server = startRpcServer();
    servers.push(server);
    configureLocalNetwork(configDir, rpcUrl(server));

    // when: the alias is checked explicitly
    const result = await runCLI(configDir, "network", "health", "local-health");

    // then: actionable human fields are visible
    expect(result.stdout).toContain("Status:   healthy");
    expect(result.stdout).toContain("Chain ID: 31337");
    expect(result.stdout).toContain("Block:    42");
    expect(result.stdout).toContain("Latency:");
    expect(result.exitCode).toBe(0);
  });

  it("rejects mismatched and invalid RPC responses", async () => {
    // given: mismatch and malformed local RPC servers
    const mismatchServer = startRpcServer("0x1");
    const invalidServer = Bun.serve({
      port: 0,
      fetch: () => Response.json({ invalid: true }),
    });
    servers.push(mismatchServer, invalidServer);

    // when: each endpoint is probed
    configureLocalNetwork(configDir, rpcUrl(mismatchServer));
    const mismatch = await runCLI(configDir, "network", "health", "--json");
    const secondConfigDir = mkdtempSync(join(tmpdir(), "giwa-health-invalid-"));
    try {
      configureLocalNetwork(secondConfigDir, rpcUrl(invalidServer));
      const invalid = await runCLI(secondConfigDir, "network", "health", "--json");

      // then: both failures use stable network errors
      expect(ErrorPayloadSchema.parse(JSON.parse(mismatch.stderr)).error.code).toBe(
        "RPC_CHAIN_ID_MISMATCH",
      );
      expect(ErrorPayloadSchema.parse(JSON.parse(invalid.stderr)).error.code).toBe(
        "RPC_INVALID_RESPONSE",
      );
      expect(mismatch.exitCode).toBe(4);
      expect(invalid.exitCode).toBe(4);
    } finally {
      rmSync(secondConfigDir, { recursive: true, force: true });
    }
  });

  it("reports unreachable RPC without changing config bytes", async () => {
    // given: an endpoint whose subscribed server is closed before probing
    const server = startRpcServer();
    const url = rpcUrl(server);
    server.stop(true);
    configureLocalNetwork(configDir, url);
    const configFile = join(configDir, "config.json");
    const before = readFileSync(configFile);

    // when: health probes the closed endpoint
    const result = await runCLI(configDir, "network", "health", "--timeout", "100", "--json");

    // then: unreachable is stable and persisted bytes are untouched
    expect(ErrorPayloadSchema.parse(JSON.parse(result.stderr)).error.code).toBe("RPC_UNREACHABLE");
    expect(result.exitCode).toBe(4);
    expect(readFileSync(configFile)).toEqual(before);
  });
});
