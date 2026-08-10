import { Command } from "commander";
import { z } from "zod";
import { parseGlobalOptions } from "./global-options.js";
import {
  NETWORK_EXPORT_FORMATS,
  type NetworkExportFormat,
  exportNetwork,
} from "./network-export-command.js";
import { formatHealthHuman, healthCommand } from "./network-health-command.js";
import { registerNetworkWriteCommands } from "./network-write-commands.js";
import type { Network } from "./networks.js";
import { type OutputOptions, type OutputWriter, formatSuccess, writeOutput } from "./output.js";
import type { Registry } from "./registry.js";

const NetworkExportFormatSchema = z.enum(NETWORK_EXPORT_FORMATS);

export interface CommandIO {
  readonly stdout: OutputWriter;
  readonly stderr: OutputWriter;
}

export interface NetworkCommandContext {
  readonly io: CommandIO;
  getRegistry(): Registry;
}

export interface NetworkListItem {
  readonly alias: string;
  readonly name: string;
  readonly chainId: number;
  readonly layer: "L1" | "L2";
  readonly nativeCurrency: Network["nativeCurrency"];
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly active: boolean;
  readonly portal?: string;
  readonly l1StandardBridge?: string;
  readonly disputeGameFactory?: string;
  readonly sourceId?: number;
}

interface NetworkListData {
  readonly activeNetwork: string;
  readonly networks: readonly NetworkListItem[];
}

export function createNetworkListItem(network: Network, activeAlias: string): NetworkListItem {
  return {
    alias: network.alias,
    name: network.name,
    chainId: network.id,
    layer: network.layer,
    nativeCurrency: network.nativeCurrency,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    active: network.alias === activeAlias,
    ...(network.portal !== undefined && { portal: network.portal }),
    ...(network.l1StandardBridge !== undefined && { l1StandardBridge: network.l1StandardBridge }),
    ...(network.disputeGameFactory !== undefined && {
      disputeGameFactory: network.disputeGameFactory,
    }),
    ...(network.sourceId !== undefined && { sourceId: network.sourceId }),
  };
}

function outputOptions(program: Command): OutputOptions {
  const options = parseGlobalOptions(program.opts());
  return { json: options.json, quiet: options.quiet };
}

function formatNetworkList(data: NetworkListData): string {
  return data.networks
    .map(
      (network) =>
        `${network.active ? "*" : " "} ${network.alias.padEnd(20)} ${String(network.chainId).padEnd(10)} ${network.name}`,
    )
    .join("\n");
}

function formatNetworkInfo(network: NetworkListItem): string {
  const lines = [
    `Alias:       ${network.alias}`,
    `Name:        ${network.name}`,
    `Chain ID:    ${network.chainId}`,
    `Layer:       ${network.layer}`,
    `Currency:    ${network.nativeCurrency.symbol}`,
    `RPC URL:     ${network.rpcUrl}`,
    `Explorer:    ${network.explorerUrl}`,
  ];
  if (network.portal !== undefined) {
    lines.push(`Portal:      ${network.portal}`);
  }
  if (network.l1StandardBridge !== undefined) {
    lines.push(`L1 Bridge:   ${network.l1StandardBridge}`);
  }
  if (network.disputeGameFactory !== undefined) {
    lines.push(`Game Factory:${network.disputeGameFactory}`);
  }
  if (network.sourceId !== undefined) {
    lines.push(`Source ID:   ${network.sourceId}`);
  }
  if (network.active) {
    lines.push("", "* Active network");
  }
  return lines.join("\n");
}

export function registerNetworkCommand(program: Command, context: NetworkCommandContext): void {
  const networkCommand = new Command("network")
    .description("Manage configured networks")
    .action(() => networkCommand.outputHelp());

  networkCommand
    .command("list")
    .description("List configured networks")
    .allowExcessArguments(false)
    .action(() => {
      const registry = context.getRegistry();
      const activeNetwork = registry.getActiveNetwork();
      const data: NetworkListData = {
        activeNetwork: activeNetwork.alias,
        networks: registry
          .listNetworks()
          .map((network) => createNetworkListItem(network, activeNetwork.alias)),
      };
      writeOutput(
        context.io.stdout,
        formatSuccess(data, formatNetworkList(data), outputOptions(program)),
      );
    });

  networkCommand
    .command("export [alias]")
    .description("Export network configuration for shell or Foundry")
    .option("--format <format>", "env or foundry", "env")
    .allowExcessArguments(false)
    .action((alias: string | undefined, options: { readonly format: string }) => {
      const registry = context.getRegistry();
      const activeNetwork = registry.getActiveNetwork();
      const network = registry.resolveNetwork(alias ?? activeNetwork.alias);
      const format: NetworkExportFormat = NetworkExportFormatSchema.parse(options.format);
      const content = exportNetwork(network, format);
      writeOutput(
        context.io.stdout,
        formatSuccess(
          { alias: network.alias, format, content },
          content.trimEnd(),
          outputOptions(program),
        ),
      );
    });

  networkCommand
    .command("info [alias]")
    .description("Show network details")
    .allowExcessArguments(false)
    .action((alias?: string) => {
      const registry = context.getRegistry();
      const activeNetwork = registry.getActiveNetwork();
      const network = registry.resolveNetwork(alias ?? activeNetwork.alias);
      const item = createNetworkListItem(network, activeNetwork.alias);
      writeOutput(
        context.io.stdout,
        formatSuccess(item, formatNetworkInfo(item), outputOptions(program)),
      );
    });

  networkCommand
    .command("health [alias]")
    .description("Check network health")
    .allowExcessArguments(false)
    .action(async (alias?: string) => {
      const registry = context.getRegistry();
      const activeNetwork = registry.getActiveNetwork();
      const network = registry.resolveNetwork(alias ?? activeNetwork.alias);
      const globalOptions = parseGlobalOptions(program.opts());
      const data = await healthCommand(network, globalOptions);
      writeOutput(
        context.io.stdout,
        formatSuccess(data, formatHealthHuman(data), outputOptions(program)),
      );
    });

  registerNetworkWriteCommands(networkCommand, program, context, createNetworkListItem);
  program.addCommand(networkCommand);
}
