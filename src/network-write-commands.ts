import type { Command } from "commander";
import { z } from "zod";
import { parseGlobalOptions } from "./global-options.js";
import type { NetworkCommandContext, NetworkListItem } from "./network-commands.js";
import type { Network } from "./networks.js";
import { formatSuccess, writeOutput } from "./output.js";

const AddNetworkOptionsSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().url(),
  name: z.string().trim().min(1).optional(),
  layer: z.enum(["L1", "L2"]).default("L2"),
  currencyName: z.string().trim().min(1).default("Ether"),
  currencySymbol: z.string().trim().min(1).max(10).default("ETH"),
  currencyDecimals: z.coerce.number().int().min(0).max(255).default(18),
  portal: z.string().optional(),
  l1StandardBridge: z.string().optional(),
  disputeGameFactory: z.string().optional(),
  sourceId: z.coerce.number().int().positive().optional(),
});

function createNetwork(alias: string, input: unknown): Network {
  const options = AddNetworkOptionsSchema.parse(input);
  return {
    id: options.chainId,
    alias,
    name: options.name ?? alias,
    layer: options.layer,
    nativeCurrency: {
      name: options.currencyName,
      symbol: options.currencySymbol,
      decimals: options.currencyDecimals,
    },
    rpcUrl: options.rpcUrl,
    explorerUrl: options.explorerUrl,
    ...(options.portal !== undefined && { portal: options.portal }),
    ...(options.l1StandardBridge !== undefined && {
      l1StandardBridge: options.l1StandardBridge,
    }),
    ...(options.disputeGameFactory !== undefined && {
      disputeGameFactory: options.disputeGameFactory,
    }),
    ...(options.sourceId !== undefined && { sourceId: options.sourceId }),
  };
}

function commandOutputOptions(program: Command): { json: boolean; quiet: boolean } {
  const options = parseGlobalOptions(program.opts());
  return { json: options.json, quiet: options.quiet };
}

export function registerNetworkWriteCommands(
  networkCommand: Command,
  program: Command,
  context: NetworkCommandContext,
  createNetworkListItem: (network: Network, activeAlias: string) => NetworkListItem,
): void {
  networkCommand
    .command("add <alias>")
    .description("Add a custom network")
    .requiredOption("--chain-id <id>", "chain ID")
    .requiredOption("--rpc-url <url>", "RPC URL")
    .requiredOption("--explorer-url <url>", "block explorer URL")
    .option("--name <name>", "network display name")
    .option("--layer <layer>", "L1 or L2", "L2")
    .option("--currency-name <name>", "native currency name", "Ether")
    .option("--currency-symbol <symbol>", "native currency symbol", "ETH")
    .option("--currency-decimals <count>", "native currency decimals", "18")
    .option("--portal <address>", "OP portal address")
    .option("--l1-standard-bridge <address>", "L1 standard bridge address")
    .option("--dispute-game-factory <address>", "OP dispute game factory address")
    .option("--source-id <id>", "source chain ID")
    .allowExcessArguments(false)
    .action((alias: string, rawOptions: unknown) => {
      const registry = context.getRegistry();
      const network = createNetwork(alias, rawOptions);
      registry.addNetwork(network);
      const item = createNetworkListItem(network, registry.getActiveNetwork().alias);
      writeOutput(
        context.io.stdout,
        formatSuccess(
          item,
          `Added network "${alias}" (chain ID ${network.id})`,
          commandOutputOptions(program),
        ),
      );
    });

  networkCommand
    .command("use <alias>")
    .description("Select the active network")
    .allowExcessArguments(false)
    .action((alias: string) => {
      const registry = context.getRegistry();
      registry.selectNetwork(alias);
      const network = registry.getActiveNetwork();
      const item = createNetworkListItem(network, network.alias);
      writeOutput(
        context.io.stdout,
        formatSuccess(
          item,
          `Using network "${alias}" (chain ID ${network.id})`,
          commandOutputOptions(program),
        ),
      );
    });
}
