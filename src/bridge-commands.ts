import type { Command } from "commander";
import type { Hash } from "viem";
import { z } from "zod";
import {
  BRIDGE_WAIT_TARGETS,
  type BridgeRequest,
  type BridgeResult,
  executeBridgeRequest,
} from "./bridge-command.js";
import { parseGlobalOptions } from "./global-options.js";
import type { NetworkCommandContext } from "./network-commands.js";
import { formatSuccess, writeOutput } from "./output.js";
import { createViemBridgeAdapter } from "./viem-bridge-adapter.js";

const HashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value): Hash => `0x${value.slice(2)}`);
const LogIndexSchema = z.coerce.number().int().nonnegative().default(0);
const WaitTargetSchema = z.enum(BRIDGE_WAIT_TARGETS);

interface BridgeOptions {
  readonly network?: string;
  readonly logIndex?: string;
}

interface BridgeWaitOptions extends BridgeOptions {
  readonly for: string;
}

function createAdapter(
  program: Command,
  context: NetworkCommandContext,
  network: string | undefined,
) {
  const globalOptions = parseGlobalOptions(program.opts());
  const { GIWA_PRIVATE_KEY: privateKey } = process.env;
  return createViemBridgeAdapter(context.getRegistry(), network, {
    confirmations: globalOptions.confirmations,
    timeoutMs: globalOptions.timeoutMs,
    ...(privateKey !== undefined && {
      privateKey,
    }),
  });
}

function formatBridgeResult(result: BridgeResult): string {
  switch (result.kind) {
    case "status":
    case "wait":
      return [`Withdrawal: ${result.withdrawalHash}`, `Status:     ${result.status}`].join("\n");
    case "prove":
    case "finalize":
      return [
        `Withdrawal: ${result.withdrawalHash}`,
        `${result.kind === "prove" ? "Proof" : "Finalize"} transaction: ${result.transactionHash}`,
      ].join("\n");
  }
}

function writeResult(program: Command, context: NetworkCommandContext, result: BridgeResult): void {
  const options = parseGlobalOptions(program.opts());
  writeOutput(
    context.io.stdout,
    formatSuccess(result, formatBridgeResult(result), {
      json: options.json,
      quiet: options.quiet,
    }),
  );
}

function parseBaseRequest(
  kind: "status" | "prove" | "finalize",
  rawHash: string,
  options: BridgeOptions,
): BridgeRequest {
  return {
    kind,
    hash: HashSchema.parse(rawHash),
    logIndex: LogIndexSchema.parse(options.logIndex),
  };
}

export function registerBridgeCommand(program: Command, context: NetworkCommandContext): void {
  const bridgeCommand = program
    .command("bridge")
    .description("Manage OP Stack withdrawal lifecycle")
    .action(() => bridgeCommand.outputHelp());

  for (const kind of ["status", "prove", "finalize"] as const) {
    bridgeCommand
      .command(`${kind} <l2-transaction-hash>`)
      .description(`${kind} an OP Stack withdrawal`)
      .option("--network <alias>", "L2 network alias")
      .option("--log-index <index>", "withdrawal log index", "0")
      .allowExcessArguments(false)
      .action(async (rawHash: string, options: BridgeOptions) => {
        const request = parseBaseRequest(kind, rawHash, options);
        const result = await executeBridgeRequest(
          createAdapter(program, context, options.network),
          request,
        );
        writeResult(program, context, result);
      });
  }

  bridgeCommand
    .command("wait <l2-transaction-hash>")
    .description("Wait until a withdrawal can be proved or finalized")
    .requiredOption("--for <phase>", "prove or finalize")
    .option("--network <alias>", "L2 network alias")
    .option("--log-index <index>", "withdrawal log index", "0")
    .allowExcessArguments(false)
    .action(async (rawHash: string, options: BridgeWaitOptions) => {
      const request: BridgeRequest = {
        kind: "wait",
        hash: HashSchema.parse(rawHash),
        logIndex: LogIndexSchema.parse(options.logIndex),
        target: WaitTargetSchema.parse(options.for),
      };
      const result = await executeBridgeRequest(
        createAdapter(program, context, options.network),
        request,
      );
      writeResult(program, context, result);
    });
}
