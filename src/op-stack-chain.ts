import { defineChain, getAddress } from "viem";
import { chainConfig } from "viem/op-stack";
import type { Network } from "./networks.js";

export interface BridgeNetwork extends Network {
  readonly portal: string;
  readonly disputeGameFactory: string;
  readonly sourceId: number;
}

export function toViemChain(network: Network) {
  return defineChain({
    ...chainConfig,
    id: network.id,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: {
      default: { name: `${network.name} Explorer`, url: network.explorerUrl },
    },
    contracts: {
      ...chainConfig.contracts,
      ...(network.sourceId !== undefined &&
        network.l1StandardBridge !== undefined && {
          l1StandardBridge: {
            [network.sourceId]: { address: getAddress(network.l1StandardBridge) },
          },
        }),
    },
    ...(network.sourceId !== undefined && { sourceId: network.sourceId }),
    testnet: network.id !== 1,
  });
}

export function toViemBridgeChain(network: BridgeNetwork) {
  return defineChain({
    ...chainConfig,
    id: network.id,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: {
      default: { name: `${network.name} Explorer`, url: network.explorerUrl },
    },
    contracts: {
      ...chainConfig.contracts,
      portal: {
        [network.sourceId]: { address: getAddress(network.portal) },
      },
      disputeGameFactory: {
        [network.sourceId]: { address: getAddress(network.disputeGameFactory) },
      },
      ...(network.l1StandardBridge !== undefined && {
        l1StandardBridge: {
          [network.sourceId]: { address: getAddress(network.l1StandardBridge) },
        },
      }),
    },
    sourceId: network.sourceId,
    testnet: network.id !== 1,
  });
}

export function toViemSourceChain(network: Network) {
  return defineChain({
    id: network.id,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: {
      default: { name: `${network.name} Explorer`, url: network.explorerUrl },
    },
    contracts: {
      multicall3: {
        address: "0xca11bde05977b3631167028862be2a173976ca11",
      },
    },
    testnet: network.id !== 1,
  });
}
