import { describe, expect, it } from "bun:test";
import type { Hash } from "viem";
import {
  type BridgeAdapter,
  type BridgeWaitTarget,
  type WithdrawalStatus,
  executeBridgeRequest,
} from "./bridge-command.js";

const withdrawalHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const proveHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const finalizeHash = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const depositHash = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const l2DepositHash = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

class FakeBridgeAdapter implements BridgeAdapter {
  readonly calls: string[] = [];

  async depositStatus(hash: Hash) {
    this.calls.push(`deposit-status:${hash}`);
    return {
      l1BlockNumber: 123n,
      status: "complete" as const,
      deposits: [{ l2TransactionHash: l2DepositHash, status: "success" as const }],
    };
  }

  async status(hash: Hash, logIndex: number): Promise<WithdrawalStatus> {
    this.calls.push(`status:${hash}:${logIndex}`);
    return "ready-to-prove";
  }

  async wait(hash: Hash, logIndex: number, target: BridgeWaitTarget): Promise<WithdrawalStatus> {
    this.calls.push(`wait:${hash}:${logIndex}:${target}`);
    return target === "prove" ? "ready-to-prove" : "ready-to-finalize";
  }

  async prove(hash: Hash, logIndex: number): Promise<Hash> {
    this.calls.push(`prove:${hash}:${logIndex}`);
    return proveHash;
  }

  async finalize(hash: Hash, logIndex: number): Promise<Hash> {
    this.calls.push(`finalize:${hash}:${logIndex}`);
    return finalizeHash;
  }
}

describe("bridge lifecycle request execution", () => {
  it("reports every L2 transaction derived from an L1 deposit", async () => {
    // given: an L1 transaction containing a confirmed portal deposit
    const adapter = new FakeBridgeAdapter();

    // when: the deposit lifecycle is inspected
    const result = await executeBridgeRequest(adapter, {
      kind: "deposit-status",
      hash: depositHash,
    });

    // then: the L1 inclusion and derived L2 execution are reported
    expect(result).toEqual({
      kind: "deposit-status",
      l1TransactionHash: depositHash,
      l1BlockNumber: "123",
      status: "complete",
      deposits: [{ l2TransactionHash: l2DepositHash, status: "success" }],
    });
    expect(adapter.calls).toEqual([`deposit-status:${depositHash}`]);
  });

  it("reports the withdrawal status for a selected log", async () => {
    // given: a withdrawal with multiple possible receipt logs
    const adapter = new FakeBridgeAdapter();

    // when: its second withdrawal log is inspected
    const result = await executeBridgeRequest(adapter, {
      kind: "status",
      hash: withdrawalHash,
      logIndex: 1,
    });

    // then: the chain status and selected hash are returned
    expect(result).toEqual({
      kind: "status",
      withdrawalHash,
      status: "ready-to-prove",
    });
    expect(adapter.calls).toEqual([`status:${withdrawalHash}:1`]);
  });

  it("waits for the requested lifecycle boundary", async () => {
    // given: a withdrawal that is not ready to finalize
    const adapter = new FakeBridgeAdapter();

    // when: finalization readiness is awaited
    const result = await executeBridgeRequest(adapter, {
      kind: "wait",
      hash: withdrawalHash,
      logIndex: 0,
      target: "finalize",
    });

    // then: readiness is returned without hiding the requested boundary
    expect(result).toEqual({
      kind: "wait",
      withdrawalHash,
      status: "ready-to-finalize",
    });
    expect(adapter.calls).toEqual([`wait:${withdrawalHash}:0:finalize`]);
  });

  it("returns the L1 prove transaction hash", async () => {
    // given: a withdrawal ready to prove
    const adapter = new FakeBridgeAdapter();

    // when: its proof is submitted
    const result = await executeBridgeRequest(adapter, {
      kind: "prove",
      hash: withdrawalHash,
      logIndex: 0,
    });

    // then: the submitted L1 transaction is identifiable
    expect(result).toEqual({
      kind: "prove",
      withdrawalHash,
      transactionHash: proveHash,
    });
  });

  it("returns the L1 finalize transaction hash", async () => {
    // given: a proven withdrawal ready to finalize
    const adapter = new FakeBridgeAdapter();

    // when: finalization is submitted
    const result = await executeBridgeRequest(adapter, {
      kind: "finalize",
      hash: withdrawalHash,
      logIndex: 0,
    });

    // then: the submitted L1 transaction is identifiable
    expect(result).toEqual({
      kind: "finalize",
      withdrawalHash,
      transactionHash: finalizeHash,
    });
  });
});
