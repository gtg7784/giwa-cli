import type { Network } from "./networks.js";

export const NETWORK_EXPORT_FORMATS = ["env", "foundry"] as const;
export type NetworkExportFormat = (typeof NETWORK_EXPORT_FORMATS)[number];

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function environmentLine(name: string, value: string | number): string {
  return `${name}=${shellQuote(String(value))}`;
}

function exportEnvironment(network: Network): string {
  const lines = [
    environmentLine("GIWA_NETWORK", network.alias),
    environmentLine("GIWA_CHAIN_ID", network.id),
    environmentLine("GIWA_RPC_URL", network.rpcUrl),
    environmentLine("GIWA_EXPLORER_URL", network.explorerUrl),
    environmentLine("GIWA_CURRENCY_SYMBOL", network.nativeCurrency.symbol),
  ];
  if (network.sourceId !== undefined) {
    lines.push(environmentLine("GIWA_L1_CHAIN_ID", network.sourceId));
  }
  if (network.portal !== undefined) {
    lines.push(environmentLine("GIWA_PORTAL", network.portal));
  }
  if (network.l1StandardBridge !== undefined) {
    lines.push(environmentLine("GIWA_L1_STANDARD_BRIDGE", network.l1StandardBridge));
  }
  if (network.disputeGameFactory !== undefined) {
    lines.push(environmentLine("GIWA_DISPUTE_GAME_FACTORY", network.disputeGameFactory));
  }
  return `${lines.join("\n")}\n`;
}

function exportFoundry(network: Network): string {
  const alias = /^[A-Za-z0-9_-]+$/.test(network.alias)
    ? network.alias
    : JSON.stringify(network.alias);
  return ["[rpc_endpoints]", `${alias} = ${JSON.stringify(network.rpcUrl)}`, ""].join("\n");
}

export function exportNetwork(network: Network, format: NetworkExportFormat): string {
  switch (format) {
    case "env":
      return exportEnvironment(network);
    case "foundry":
      return exportFoundry(network);
  }
}
