import { http, createPublicClient } from "viem";
import { estimateL1Fee, estimateL1Gas } from "viem/op-stack";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import type { FeeAdapter, FeeComponents, FeeRequest } from "./fee-command.js";
import type { Network } from "./networks.js";
import { toViemChain } from "./op-stack-chain.js";

const L1_BLOCK_ADDRESS = "0x4200000000000000000000000000000000000015" as const;
const operatorFeeAbi = [
  {
    type: "function",
    name: "operatorFeeScalar",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "operatorFeeConstant",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
] as const;

function transactionRequest(request: FeeRequest) {
  return {
    account: request.from,
    ...(request.to !== undefined && { to: request.to }),
    value: request.value,
    data: request.data,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createViemFeeAdapter(network: Network, timeoutMs: number): FeeAdapter {
  const client = createPublicClient({
    chain: toViemChain(network),
    transport: http(network.rpcUrl, { timeout: timeoutMs }),
  });
  return {
    async estimateComponents(request: FeeRequest): Promise<FeeComponents> {
      try {
        const transaction = transactionRequest(request);
        const operatorReads = Promise.allSettled([
          client.readContract({
            address: L1_BLOCK_ADDRESS,
            abi: operatorFeeAbi,
            functionName: "operatorFeeScalar",
          }),
          client.readContract({
            address: L1_BLOCK_ADDRESS,
            abi: operatorFeeAbi,
            functionName: "operatorFeeConstant",
          }),
        ]);
        const [l1DataWei, l1GasUsed, l2Gas, l2GasPrice, operatorResults] = await Promise.all([
          estimateL1Fee(client, transaction),
          estimateL1Gas(client, transaction),
          client.estimateGas(transaction),
          client.getGasPrice(),
          operatorReads,
        ]);
        const [scalar, constant] = operatorResults;
        const operatorFeeParameters =
          scalar?.status === "fulfilled" && constant?.status === "fulfilled"
            ? { scalar: scalar.value, constant: constant.value }
            : null;
        return {
          l1DataWei,
          l1GasUsed,
          l2Gas,
          l2GasPrice,
          operatorFeeParameters,
        };
      } catch (error) {
        throw new ApplicationError(
          "FEE_ESTIMATION_FAILED",
          `Unable to estimate OP Stack fees: ${describeError(error)}`,
          EXIT_CODES.network,
        );
      }
    },
  };
}
