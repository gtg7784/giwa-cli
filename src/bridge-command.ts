import type { Hash } from "viem";

export const BRIDGE_WAIT_TARGETS = ["prove", "finalize"] as const;
export type BridgeWaitTarget = (typeof BRIDGE_WAIT_TARGETS)[number];

export type WithdrawalStatus =
  | "waiting-to-prove"
  | "ready-to-prove"
  | "waiting-to-finalize"
  | "ready-to-finalize"
  | "finalized";

export interface BridgeAdapter {
  status(hash: Hash, logIndex: number): Promise<WithdrawalStatus>;
  wait(hash: Hash, logIndex: number, target: BridgeWaitTarget): Promise<WithdrawalStatus>;
  prove(hash: Hash, logIndex: number): Promise<Hash>;
  finalize(hash: Hash, logIndex: number): Promise<Hash>;
}

export type BridgeRequest =
  | { readonly kind: "status"; readonly hash: Hash; readonly logIndex: number }
  | {
      readonly kind: "wait";
      readonly hash: Hash;
      readonly logIndex: number;
      readonly target: BridgeWaitTarget;
    }
  | { readonly kind: "prove"; readonly hash: Hash; readonly logIndex: number }
  | { readonly kind: "finalize"; readonly hash: Hash; readonly logIndex: number };

export type BridgeResult =
  | {
      readonly kind: "status" | "wait";
      readonly withdrawalHash: Hash;
      readonly status: WithdrawalStatus;
    }
  | {
      readonly kind: "prove" | "finalize";
      readonly withdrawalHash: Hash;
      readonly transactionHash: Hash;
    };

export async function executeBridgeRequest(
  adapter: BridgeAdapter,
  request: BridgeRequest,
): Promise<BridgeResult> {
  switch (request.kind) {
    case "status":
      return {
        kind: request.kind,
        withdrawalHash: request.hash,
        status: await adapter.status(request.hash, request.logIndex),
      };
    case "wait":
      return {
        kind: request.kind,
        withdrawalHash: request.hash,
        status: await adapter.wait(request.hash, request.logIndex, request.target),
      };
    case "prove":
      return {
        kind: request.kind,
        withdrawalHash: request.hash,
        transactionHash: await adapter.prove(request.hash, request.logIndex),
      };
    case "finalize":
      return {
        kind: request.kind,
        withdrawalHash: request.hash,
        transactionHash: await adapter.finalize(request.hash, request.logIndex),
      };
  }
}
