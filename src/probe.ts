import { z } from "zod";
import { ApplicationError, EXIT_CODES } from "./errors.js";

const HexQuantitySchema = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/);
const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.number().int(),
  result: HexQuantitySchema,
});

export interface HealthProbeResult {
  readonly configuredChainId: number;
  readonly reportedChainId: number;
  readonly chainIdMatches: true;
  readonly blockNumber: string;
  readonly latencyMs: number;
  readonly reachable: true;
}

function probeError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.network);
}

function invalidResponse(message: string): ApplicationError {
  return probeError("RPC_INVALID_RESPONSE", message);
}

async function requestHexQuantity(
  rpcUrl: string,
  method: "eth_chainId" | "eth_blockNumber",
  id: number,
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id }),
      signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw probeError("RPC_UNREACHABLE", `RPC endpoint is unreachable: ${detail}`);
  }

  if (!response.ok) {
    throw invalidResponse(`RPC returned HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw invalidResponse(`RPC returned invalid JSON: ${detail}`);
  }

  const parsed = JsonRpcResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.id !== id) {
    throw invalidResponse(`RPC returned an invalid ${method} response`);
  }
  return parsed.data.result;
}

export async function probeHealth(
  rpcUrl: string,
  configuredChainId: number,
  timeoutMs: number,
): Promise<HealthProbeResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const chainIdHex = await requestHexQuantity(rpcUrl, "eth_chainId", 1, controller.signal);
    const reportedChainId = Number.parseInt(chainIdHex.slice(2), 16);
    if (!Number.isSafeInteger(reportedChainId)) {
      throw invalidResponse("RPC returned an unsafe chain ID");
    }
    if (reportedChainId !== configuredChainId) {
      throw probeError(
        "RPC_CHAIN_ID_MISMATCH",
        `Configured chain ID ${configuredChainId} does not match RPC chain ID ${reportedChainId}`,
      );
    }

    const blockNumberHex = await requestHexQuantity(
      rpcUrl,
      "eth_blockNumber",
      2,
      controller.signal,
    );
    return {
      configuredChainId,
      reportedChainId,
      chainIdMatches: true,
      blockNumber: BigInt(blockNumberHex).toString(),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      reachable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
