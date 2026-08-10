import type { Address, Hash, Hex } from "viem";
import { ApplicationError, EXIT_CODES } from "./errors.js";

export interface DepositSnapshot {
  readonly sourceHash: Hex;
  readonly mint: bigint | null;
  readonly isSystemTx: boolean;
  readonly depositNonce: bigint | null;
  readonly depositReceiptVersion: number | null;
}

export interface WithdrawalSnapshot {
  readonly index: number;
  readonly withdrawalHash: Hash;
  readonly nonce: bigint;
  readonly sender: Address;
  readonly target: Address;
  readonly value: bigint;
  readonly gasLimit: bigint;
}

export interface TxSnapshot {
  readonly hash: Hash;
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly from: Address;
  readonly to: Address | null;
  readonly contractAddress: Address | null;
  readonly nonce: number;
  readonly value: bigint;
  readonly type: string;
  readonly gasUsed: bigint;
  readonly effectiveGasPrice: bigint;
  readonly l1DataFee: bigint | null;
  readonly l1GasUsed: bigint | null;
  readonly l1GasPrice: bigint | null;
  readonly l1FeeScalar: number | null;
  readonly deposit: DepositSnapshot | null;
  readonly withdrawals: readonly WithdrawalSnapshot[];
}

interface TxFeeExplanation {
  readonly l2ExecutionWei: string;
  readonly l1DataWei: string | null;
  readonly l1GasUsed: string | null;
  readonly l1GasPrice: string | null;
  readonly l1FeeScalar: number | null;
  readonly totalWei: string | null;
  readonly complete: boolean;
}

interface DepositExplanation {
  readonly sourceHash: Hex;
  readonly mint: string | null;
  readonly isSystemTx: boolean;
  readonly depositNonce: string | null;
  readonly depositReceiptVersion: number | null;
}

interface WithdrawalExplanation {
  readonly index: number;
  readonly withdrawalHash: Hash;
  readonly nonce: string;
  readonly sender: Address;
  readonly target: Address;
  readonly value: string;
  readonly gasLimit: string;
}

export interface TxExplanation {
  readonly hash: Hash;
  readonly status: "success" | "reverted";
  readonly blockNumber: string;
  readonly from: Address;
  readonly to: Address | null;
  readonly contractAddress: Address | null;
  readonly nonce: number;
  readonly value: string;
  readonly type: string;
  readonly gasUsed: string;
  readonly effectiveGasPrice: string;
  readonly fees: TxFeeExplanation;
  readonly classification: {
    readonly kind: "deposit" | "withdrawal-initiating" | "standard";
    readonly deposit: DepositExplanation | null;
    readonly withdrawals: readonly WithdrawalExplanation[];
  };
}

export interface TxAdapter {
  getSnapshot(hash: Hash): Promise<TxSnapshot>;
}

function explainWithdrawal(withdrawal: WithdrawalSnapshot): WithdrawalExplanation {
  return {
    index: withdrawal.index,
    withdrawalHash: withdrawal.withdrawalHash,
    nonce: withdrawal.nonce.toString(),
    sender: withdrawal.sender,
    target: withdrawal.target,
    value: withdrawal.value.toString(),
    gasLimit: withdrawal.gasLimit.toString(),
  };
}

export function explainTransaction(snapshot: TxSnapshot, logIndex?: number): TxExplanation {
  const selectedWithdrawals =
    logIndex === undefined
      ? snapshot.withdrawals
      : [snapshot.withdrawals[logIndex]].filter((withdrawal) => withdrawal !== undefined);
  if (logIndex !== undefined && selectedWithdrawals.length === 0) {
    throw new ApplicationError(
      "TX_LOG_INDEX_OUT_OF_RANGE",
      `TX_LOG_INDEX_OUT_OF_RANGE: withdrawal log ${logIndex} does not exist`,
      EXIT_CODES.usage,
    );
  }

  const l2ExecutionFee = snapshot.gasUsed * snapshot.effectiveGasPrice;
  const complete = snapshot.l1DataFee !== null;
  const totalFee = snapshot.l1DataFee === null ? null : l2ExecutionFee + snapshot.l1DataFee;
  const deposit =
    snapshot.deposit === null
      ? null
      : {
          sourceHash: snapshot.deposit.sourceHash,
          mint: snapshot.deposit.mint?.toString() ?? null,
          isSystemTx: snapshot.deposit.isSystemTx,
          depositNonce: snapshot.deposit.depositNonce?.toString() ?? null,
          depositReceiptVersion: snapshot.deposit.depositReceiptVersion,
        };

  return {
    hash: snapshot.hash,
    status: snapshot.status,
    blockNumber: snapshot.blockNumber.toString(),
    from: snapshot.from,
    to: snapshot.to,
    contractAddress: snapshot.contractAddress,
    nonce: snapshot.nonce,
    value: snapshot.value.toString(),
    type: snapshot.type,
    gasUsed: snapshot.gasUsed.toString(),
    effectiveGasPrice: snapshot.effectiveGasPrice.toString(),
    fees: {
      l2ExecutionWei: l2ExecutionFee.toString(),
      l1DataWei: snapshot.l1DataFee?.toString() ?? null,
      l1GasUsed: snapshot.l1GasUsed?.toString() ?? null,
      l1GasPrice: snapshot.l1GasPrice?.toString() ?? null,
      l1FeeScalar: snapshot.l1FeeScalar,
      totalWei: totalFee?.toString() ?? null,
      complete,
    },
    classification: {
      kind:
        deposit !== null
          ? "deposit"
          : snapshot.withdrawals.length > 0
            ? "withdrawal-initiating"
            : "standard",
      deposit,
      withdrawals: selectedWithdrawals.map(explainWithdrawal),
    },
  };
}

export async function runTxCommand(
  adapter: TxAdapter,
  hash: Hash,
  logIndex?: number,
): Promise<TxExplanation> {
  return explainTransaction(await adapter.getSnapshot(hash), logIndex);
}
