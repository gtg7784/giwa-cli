import type { Command } from "commander";
import type { Address, Hash, Hex } from "viem";
import { z } from "zod";
import type { FeeEstimate, FeeRequest } from "./fee-command.js";
import { runFeeCommand } from "./fee-command.js";
import { parseGlobalOptions } from "./global-options.js";
import type { NetworkCommandContext } from "./network-commands.js";
import { formatSuccess, writeOutput } from "./output.js";
import type { TxExplanation } from "./tx-command.js";
import { runTxCommand } from "./tx-command.js";
import { createViemFeeAdapter } from "./viem-fee-adapter.js";
import { createViemTxAdapter } from "./viem-tx-adapter.js";

const HashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value): Hash => `0x${value.slice(2)}`);
const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value): Address => `0x${value.slice(2)}`);
const DataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((value): Hex => `0x${value.slice(2)}`);
const ValueSchema = z
  .string()
  .regex(/^[0-9]+$/)
  .transform((value) => BigInt(value));
const LogIndexSchema = z.coerce.number().int().nonnegative();

interface NetworkOptions {
  readonly network?: string;
}

interface TxOptions extends NetworkOptions {
  readonly logIndex?: string;
}

interface FeeOptions extends NetworkOptions {
  readonly from: string;
  readonly to?: string;
  readonly value: string;
  readonly data: string;
}

function formatTx(result: TxExplanation): string {
  return [
    `Transaction: ${result.hash}`,
    `Status:      ${result.status}`,
    `Type:        ${result.classification.kind}`,
    `Block:       ${result.blockNumber}`,
    `L2 fee:      ${result.fees.l2ExecutionWei} wei`,
    `L1 data fee: ${result.fees.l1DataWei ?? "unavailable"}`,
    `Total fee:   ${result.fees.totalWei ?? "incomplete"}`,
    `Withdrawals: ${result.classification.withdrawals.length}`,
  ].join("\n");
}

function formatFee(result: FeeEstimate): string {
  const operator = result.components.operatorFee;
  return [
    `L1 data fee:    ${result.components.l1Data.wei} wei`,
    `L2 execution:   ${result.components.l2Execution.wei} wei`,
    `Operator fee:   ${operator.wei ?? "unsupported"}`,
    `Total estimate: ${result.totalWei} wei`,
  ].join("\n");
}

function outputOptions(program: Command) {
  const options = parseGlobalOptions(program.opts());
  return { json: options.json, quiet: options.quiet };
}

export function registerTxFeeCommands(program: Command, context: NetworkCommandContext): void {
  const txCommand = program
    .command("tx")
    .description("Explain OP Stack transaction metadata")
    .action(() => txCommand.outputHelp());
  txCommand
    .command("explain <transaction-hash>")
    .description("Explain OP Stack fees and cross-domain activity")
    .option("--network <alias>", "L2 network alias")
    .option("--log-index <index>", "select one withdrawal log")
    .allowExcessArguments(false)
    .action(async (rawHash: string, options: TxOptions) => {
      const global = parseGlobalOptions(program.opts());
      const registry = context.getRegistry();
      const network = registry.resolveNetwork(options.network ?? registry.getActiveNetwork().alias);
      const result = await runTxCommand(
        createViemTxAdapter(network, global.timeoutMs),
        HashSchema.parse(rawHash),
        options.logIndex === undefined ? undefined : LogIndexSchema.parse(options.logIndex),
      );
      writeOutput(
        context.io.stdout,
        formatSuccess(result, formatTx(result), outputOptions(program)),
      );
    });

  const feeCommand = program
    .command("fee")
    .description("Estimate OP Stack fee components")
    .action(() => feeCommand.outputHelp());
  feeCommand
    .command("estimate")
    .description("Estimate L1 data, L2 execution, and operator fees")
    .requiredOption("--from <address>", "transaction sender")
    .option("--to <address>", "transaction recipient")
    .option("--value <wei>", "transaction value in wei", "0")
    .option("--data <hex>", "transaction calldata", "0x")
    .option("--network <alias>", "L2 network alias")
    .allowExcessArguments(false)
    .action(async (options: FeeOptions) => {
      const global = parseGlobalOptions(program.opts());
      const registry = context.getRegistry();
      const network = registry.resolveNetwork(options.network ?? registry.getActiveNetwork().alias);
      const request: FeeRequest = {
        from: AddressSchema.parse(options.from),
        ...(options.to !== undefined && { to: AddressSchema.parse(options.to) }),
        value: ValueSchema.parse(options.value),
        data: DataSchema.parse(options.data),
      };
      const result = await runFeeCommand(
        createViemFeeAdapter(network, global.timeoutMs),
        request,
        network.nativeCurrency,
      );
      writeOutput(
        context.io.stdout,
        formatSuccess(result, formatFee(result), outputOptions(program)),
      );
    });
}
