import type { Hex } from "viem";
import { z } from "zod";
import { ApplicationError, EXIT_CODES, type ExitCode } from "./errors.js";
import type { Network } from "./networks.js";
import type { BridgeNetwork } from "./op-stack-chain.js";
import type { Registry } from "./registry.js";

const PrivateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export interface BridgeNetworks {
  readonly l1: Network;
  readonly l2: BridgeNetwork;
}

export function bridgeError(
  code: string,
  message: string,
  exitCode: ExitCode = EXIT_CODES.network,
) {
  return new ApplicationError(code, message, exitCode);
}

export function resolveBridgeNetworks(registry: Registry, alias?: string): BridgeNetworks {
  const l2 = registry.resolveNetwork(alias ?? registry.getActiveNetwork().alias);
  if (l2.layer !== "L2") {
    throw bridgeError("BRIDGE_REQUIRES_L2", `Network "${l2.alias}" is not an L2`);
  }
  if (l2.portal === undefined || l2.disputeGameFactory === undefined || l2.sourceId === undefined) {
    throw bridgeError(
      "BRIDGE_METADATA_MISSING",
      `Network "${l2.alias}" lacks Portal, DisputeGameFactory, or source chain metadata`,
      EXIT_CODES.config,
    );
  }
  const l1 = registry.listNetworks().find((network) => network.id === l2.sourceId);
  if (l1 === undefined) {
    throw bridgeError(
      "BRIDGE_SOURCE_NETWORK_MISSING",
      `Source chain ${l2.sourceId} is not configured`,
      EXIT_CODES.config,
    );
  }
  return {
    l1,
    l2: {
      ...l2,
      portal: l2.portal,
      disputeGameFactory: l2.disputeGameFactory,
      sourceId: l2.sourceId,
    },
  };
}

export function parseBridgePrivateKey(value: string | undefined): Hex {
  const parsed = PrivateKeySchema.safeParse(value);
  if (!parsed.success) {
    throw bridgeError(
      "BRIDGE_SIGNER_REQUIRED",
      "Set GIWA_PRIVATE_KEY to a 32-byte hex private key for bridge writes",
      EXIT_CODES.config,
    );
  }
  return `0x${parsed.data.slice(2)}`;
}
