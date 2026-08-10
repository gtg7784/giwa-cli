import { describe, expect, it } from "bun:test";
import { type TxSnapshot, type WithdrawalSnapshot, explainTransaction } from "./tx-command.js";

const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const from = "0x1111111111111111111111111111111111111111";
const to = "0x2222222222222222222222222222222222222222";

function transaction(overrides: Partial<TxSnapshot> = {}): TxSnapshot {
  return {
    hash,
    status: "success",
    blockNumber: 42n,
    from,
    to,
    contractAddress: null,
    nonce: 7,
    value: 1_000n,
    type: "eip1559",
    gasUsed: 21_000n,
    effectiveGasPrice: 1_000_253n,
    l1DataFee: 4_210_000_000_000n,
    l1GasUsed: 1_600n,
    l1GasPrice: 2_500_000_000n,
    l1FeeScalar: 0.684,
    deposit: null,
    withdrawals: [],
    ...overrides,
  };
}

function withdrawal(index: number): WithdrawalSnapshot {
  return {
    index,
    withdrawalHash: `0x${String(index + 1).padStart(64, "0")}`,
    nonce: BigInt(index),
    sender: from,
    target: to,
    value: 100n,
    gasLimit: 200_000n,
  };
}

describe("OP Stack transaction explanation", () => {
  it("reports complete L1 and L2 fee components", () => {
    // given: an OP Stack receipt with L1 fee metadata
    const snapshot = transaction();

    // when: the transaction is explained
    const result = explainTransaction(snapshot);

    // then: component and total fees are exact decimal strings
    expect(result.fees).toEqual({
      l2ExecutionWei: "21005313000",
      l1DataWei: "4210000000000",
      l1GasUsed: "1600",
      l1GasPrice: "2500000000",
      l1FeeScalar: 0.684,
      totalWei: "4231005313000",
      complete: true,
    });
  });

  it("does not silently treat missing L1 fee data as zero", () => {
    // given: a node receipt without OP Stack L1 fee metadata
    const snapshot = transaction({
      l1DataFee: null,
      l1GasUsed: null,
      l1GasPrice: null,
      l1FeeScalar: null,
    });

    // when: the transaction is explained
    const result = explainTransaction(snapshot);

    // then: total completeness remains explicitly unknown
    expect(result.fees.l1DataWei).toBeNull();
    expect(result.fees.totalWei).toBeNull();
    expect(result.fees.complete).toBe(false);
  });

  it("identifies deposits without inventing withdrawal state", () => {
    // given: a normalized OP Stack deposit transaction
    const snapshot = transaction({
      type: "deposit",
      deposit: {
        sourceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        mint: 1_000n,
        isSystemTx: false,
        depositNonce: 8n,
        depositReceiptVersion: 1,
      },
    });

    // when: the transaction is explained
    const result = explainTransaction(snapshot);

    // then: deposit-only metadata is preserved and bigint-safe
    expect(result.classification).toEqual({
      kind: "deposit",
      deposit: {
        sourceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        mint: "1000",
        isSystemTx: false,
        depositNonce: "8",
        depositReceiptVersion: 1,
      },
      withdrawals: [],
    });
  });

  it("selects a withdrawal log and rejects an invalid index", () => {
    // given: one transaction containing two MessagePassed withdrawals
    const snapshot = transaction({ withdrawals: [withdrawal(0), withdrawal(1)] });

    // when: its second withdrawal is selected
    const selected = explainTransaction(snapshot, 1);

    // then: bridge-compatible indexing is retained and invalid indexes fail
    expect(selected.classification.kind).toBe("withdrawal-initiating");
    expect(selected.classification.withdrawals).toEqual([
      expect.objectContaining({ index: 1, nonce: "1" }),
    ]);
    expect(() => explainTransaction(snapshot, 5)).toThrow("TX_LOG_INDEX_OUT_OF_RANGE");
  });

  it("reports reverted standard transactions and their spent gas", () => {
    // given: a reverted non-bridge transaction
    const snapshot = transaction({ status: "reverted" });

    // when: the transaction is explained
    const result = explainTransaction(snapshot);

    // then: failure classification does not erase paid fees
    expect(result.status).toBe("reverted");
    expect(result.classification.kind).toBe("standard");
    expect(result.fees.l2ExecutionWei).toBe("21005313000");
  });
});
