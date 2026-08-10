import {
  http,
  type Hash,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildProveWithdrawal,
  finalizeWithdrawal,
  getL2TransactionHashes,
  getWithdrawalStatus,
  getWithdrawals,
  proveWithdrawal,
  waitToProve,
} from "viem/op-stack";
import type {
  BridgeAdapter,
  BridgeWaitTarget,
  DepositL2Status,
  DepositStatusSnapshot,
  WithdrawalStatus,
} from "./bridge-command.js";
import { bridgeError, parseBridgePrivateKey, resolveBridgeNetworks } from "./bridge-context.js";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { toViemBridgeChain, toViemSourceChain } from "./op-stack-chain.js";
import type { Registry } from "./registry.js";

export interface ViemBridgeOptions {
  readonly confirmations: number;
  readonly privateKey?: string;
  readonly timeoutMs: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createViemBridgeAdapter(
  registry: Registry,
  alias: string | undefined,
  options: ViemBridgeOptions,
): BridgeAdapter {
  const networks = resolveBridgeNetworks(registry, alias);
  const l1Chain = toViemSourceChain(networks.l1);
  const l2Chain = toViemBridgeChain(networks.l2);
  const l1Client = createPublicClient({
    chain: l1Chain,
    transport: http(networks.l1.rpcUrl, { timeout: options.timeoutMs }),
  });
  const l2Client = createPublicClient({
    chain: l2Chain,
    transport: http(networks.l2.rpcUrl, { timeout: options.timeoutMs }),
  });

  async function receipt(hash: Hash) {
    return l2Client.getTransactionReceipt({ hash });
  }

  async function depositStatus(hash: Hash): Promise<DepositStatusSnapshot> {
    try {
      const l1Receipt = await l1Client.getTransactionReceipt({ hash });
      if (l1Receipt.status === "reverted") {
        return {
          l1BlockNumber: l1Receipt.blockNumber,
          status: "failed",
          deposits: [],
        };
      }
      const l2TransactionHashes = getL2TransactionHashes({ logs: l1Receipt.logs });
      if (l2TransactionHashes.length === 0) {
        throw bridgeError(
          "BRIDGE_DEPOSIT_NOT_FOUND",
          `No portal deposits were found in ${hash}`,
          EXIT_CODES.usage,
        );
      }
      const deposits = await Promise.all(
        l2TransactionHashes.map(async (l2TransactionHash) => {
          let status: DepositL2Status;
          try {
            status = (await l2Client.getTransactionReceipt({ hash: l2TransactionHash })).status;
          } catch (error) {
            if (!(error instanceof TransactionReceiptNotFoundError)) {
              throw error;
            }
            status = "pending";
          }
          return { l2TransactionHash, status };
        }),
      );
      return {
        l1BlockNumber: l1Receipt.blockNumber,
        status: deposits.some((deposit) => deposit.status === "reverted")
          ? "failed"
          : deposits.every((deposit) => deposit.status === "success")
            ? "complete"
            : "pending",
        deposits,
      };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      throw bridgeError("BRIDGE_DEPOSIT_STATUS_FAILED", describeError(error));
    }
  }

  async function status(hash: Hash, logIndex: number): Promise<WithdrawalStatus> {
    try {
      return await getWithdrawalStatus(l1Client, {
        receipt: await receipt(hash),
        logIndex,
        targetChain: l2Chain,
      });
    } catch (error) {
      throw bridgeError("BRIDGE_STATUS_FAILED", describeError(error));
    }
  }

  async function wait(
    hash: Hash,
    logIndex: number,
    target: BridgeWaitTarget,
  ): Promise<WithdrawalStatus> {
    try {
      const withdrawalReceipt = await receipt(hash);
      if (target === "prove") {
        await waitToProve(l1Client, {
          receipt: withdrawalReceipt,
          targetChain: l2Chain,
        });
        return "ready-to-prove";
      }
      if (getWithdrawals(withdrawalReceipt)[logIndex] === undefined) {
        throw bridgeError(
          "BRIDGE_WITHDRAWAL_NOT_FOUND",
          `Withdrawal log ${logIndex} was not found in ${hash}`,
          EXIT_CODES.usage,
        );
      }
      const initial = await status(hash, logIndex);
      if (initial === "ready-to-finalize" || initial === "finalized") {
        return initial;
      }
      return await new Promise<WithdrawalStatus>((resolve, reject) => {
        let checking = false;
        const timeout = setTimeout(() => {
          unwatch();
          reject(
            bridgeError(
              "BRIDGE_WAIT_TIMEOUT",
              `Withdrawal did not become finalizable within ${options.timeoutMs}ms`,
            ),
          );
        }, options.timeoutMs);
        const unwatch = l1Client.watchBlockNumber({
          onBlockNumber: async () => {
            if (checking) {
              return;
            }
            checking = true;
            try {
              const current = await status(hash, logIndex);
              if (current === "ready-to-finalize" || current === "finalized") {
                clearTimeout(timeout);
                unwatch();
                resolve(current);
              }
            } catch (error) {
              clearTimeout(timeout);
              unwatch();
              reject(error);
            } finally {
              checking = false;
            }
          },
          onError: (error) => {
            clearTimeout(timeout);
            unwatch();
            reject(error);
          },
        });
      });
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      throw bridgeError("BRIDGE_WAIT_FAILED", describeError(error));
    }
  }

  function wallet() {
    const account = privateKeyToAccount(parseBridgePrivateKey(options.privateKey));
    return {
      account,
      client: createWalletClient({
        account,
        chain: l1Chain,
        transport: http(networks.l1.rpcUrl, { timeout: options.timeoutMs }),
      }),
    };
  }

  return {
    depositStatus,
    status,
    wait,
    async prove(hash, logIndex): Promise<Hash> {
      try {
        const withdrawalReceipt = await receipt(hash);
        const readiness = await status(hash, logIndex);
        if (readiness !== "ready-to-prove") {
          throw bridgeError("BRIDGE_NOT_READY_TO_PROVE", `Withdrawal status is ${readiness}`);
        }
        const context = await waitToProve(l1Client, {
          receipt: withdrawalReceipt,
          targetChain: l2Chain,
        });
        const withdrawal = getWithdrawals(withdrawalReceipt)[logIndex];
        if (withdrawal === undefined) {
          throw bridgeError(
            "BRIDGE_WITHDRAWAL_NOT_FOUND",
            `Withdrawal log ${logIndex} was not found in ${hash}`,
            EXIT_CODES.usage,
          );
        }
        const signer = wallet();
        const proof = await buildProveWithdrawal(l2Client, {
          account: signer.account,
          game: context.game,
          withdrawal,
        });
        const transactionHash = await proveWithdrawal(signer.client, {
          ...proof,
        });
        await l1Client.waitForTransactionReceipt({
          hash: transactionHash,
          confirmations: options.confirmations,
        });
        return transactionHash;
      } catch (error) {
        if (error instanceof ApplicationError) {
          throw error;
        }
        throw bridgeError("BRIDGE_PROVE_FAILED", describeError(error));
      }
    },
    async finalize(hash, logIndex): Promise<Hash> {
      try {
        const withdrawalReceipt = await receipt(hash);
        const readiness = await status(hash, logIndex);
        if (readiness !== "ready-to-finalize") {
          throw bridgeError("BRIDGE_NOT_READY_TO_FINALIZE", `Withdrawal status is ${readiness}`);
        }
        const withdrawal = getWithdrawals(withdrawalReceipt)[logIndex];
        if (withdrawal === undefined) {
          throw bridgeError(
            "BRIDGE_WITHDRAWAL_NOT_FOUND",
            `Withdrawal log ${logIndex} was not found in ${hash}`,
            EXIT_CODES.usage,
          );
        }
        const signer = wallet();
        const transactionHash = await finalizeWithdrawal(signer.client, {
          account: signer.account,
          targetChain: l2Chain,
          withdrawal,
        });
        await l1Client.waitForTransactionReceipt({
          hash: transactionHash,
          confirmations: options.confirmations,
        });
        return transactionHash;
      } catch (error) {
        if (error instanceof ApplicationError) {
          throw error;
        }
        throw bridgeError("BRIDGE_FINALIZE_FAILED", describeError(error));
      }
    },
  };
}
