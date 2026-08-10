import { http, type Hash, createPublicClient } from "viem";
import { getWithdrawals } from "viem/op-stack";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import type { Network } from "./networks.js";
import { toViemChain } from "./op-stack-chain.js";
import type { TxAdapter, TxSnapshot } from "./tx-command.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createViemTxAdapter(network: Network, timeoutMs: number): TxAdapter {
  const client = createPublicClient({
    chain: toViemChain(network),
    transport: http(network.rpcUrl, { timeout: timeoutMs }),
  });

  return {
    async getSnapshot(hash: Hash): Promise<TxSnapshot> {
      try {
        const [transaction, receipt] = await Promise.all([
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }),
        ]);
        const withdrawals = getWithdrawals(receipt).map((withdrawal, index) => ({
          ...withdrawal,
          index,
        }));
        const deposit =
          transaction.type === "deposit"
            ? {
                sourceHash: transaction.sourceHash,
                mint: transaction.mint ?? null,
                isSystemTx: transaction.isSystemTx ?? false,
                depositNonce: receipt.depositNonce ?? null,
                depositReceiptVersion: receipt.depositReceiptVersion ?? null,
              }
            : null;
        return {
          hash: transaction.hash,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          from: receipt.from,
          to: receipt.to,
          contractAddress: receipt.contractAddress ?? null,
          nonce: transaction.nonce,
          value: transaction.value,
          type: transaction.type,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
          l1DataFee: receipt.l1Fee,
          l1GasUsed: receipt.l1GasUsed,
          l1GasPrice: receipt.l1GasPrice,
          l1FeeScalar: receipt.l1FeeScalar,
          deposit,
          withdrawals,
        };
      } catch (error) {
        throw new ApplicationError(
          "TX_LOOKUP_FAILED",
          `Unable to explain transaction ${hash}: ${describeError(error)}`,
          EXIT_CODES.network,
        );
      }
    },
  };
}
