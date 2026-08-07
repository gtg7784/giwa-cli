import type { GlobalOptions } from "./global-options.js";
import type { Network } from "./networks.js";
import { probeHealth } from "./probe.js";

export interface HealthData {
  readonly alias: string;
  readonly configuredChainId: number;
  readonly reportedChainId: number;
  readonly chainIdMatches: true;
  readonly blockNumber: string;
  readonly latencyMs: number;
  readonly reachable: true;
}

export function formatHealthHuman(data: HealthData): string {
  return [
    `Network:  ${data.alias}`,
    "Status:   healthy",
    `Chain ID: ${data.reportedChainId}`,
    `Block:    ${data.blockNumber}`,
    `Latency:  ${data.latencyMs}ms`,
  ].join("\n");
}

export async function healthCommand(
  network: Network,
  globalOptions: GlobalOptions,
): Promise<HealthData> {
  const probe = await probeHealth(network.rpcUrl, network.id, globalOptions.timeoutMs);
  return {
    alias: network.alias,
    configuredChainId: probe.configuredChainId,
    reportedChainId: probe.reportedChainId,
    chainIdMatches: probe.chainIdMatches,
    blockNumber: probe.blockNumber,
    latencyMs: probe.latencyMs,
    reachable: probe.reachable,
  };
}
