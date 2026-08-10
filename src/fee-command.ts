import type { Address, Hex } from "viem";
import type { NativeCurrency } from "./networks.js";

export interface FeeRequest {
  readonly from: Address;
  readonly to?: Address;
  readonly value: bigint;
  readonly data: Hex;
}

export interface FeeComponents {
  readonly l1DataWei: bigint;
  readonly l1GasUsed: bigint;
  readonly l2Gas: bigint;
  readonly l2GasPrice: bigint;
  readonly operatorFeeParameters: {
    readonly scalar: number;
    readonly constant: bigint;
  } | null;
}

export interface FeeEstimate {
  readonly request: {
    readonly from: Address;
    readonly to: Address | null;
    readonly value: string;
    readonly dataBytes: number;
  };
  readonly components: {
    readonly l1Data: { readonly wei: string; readonly l1GasUsed: string };
    readonly l2Execution: {
      readonly wei: string;
      readonly gas: string;
      readonly gasPrice: string;
    };
    readonly operatorFee: {
      readonly wei: string | null;
      readonly supported: boolean;
      readonly scalar: number | null;
      readonly constant: string | null;
    };
  };
  readonly totalWei: string;
  readonly currency: NativeCurrency;
}

export interface FeeAdapter {
  estimateComponents(request: FeeRequest): Promise<FeeComponents>;
}

export function composeFeeEstimate(
  request: FeeRequest,
  components: FeeComponents,
  currency: NativeCurrency,
): FeeEstimate {
  const l2ExecutionWei = components.l2Gas * components.l2GasPrice;
  const operatorFeeWei =
    components.operatorFeeParameters === null
      ? null
      : (components.l2Gas * BigInt(components.operatorFeeParameters.scalar)) / 1_000_000n +
        components.operatorFeeParameters.constant;
  const totalWei = components.l1DataWei + l2ExecutionWei + (operatorFeeWei ?? 0n);

  return {
    request: {
      from: request.from,
      to: request.to ?? null,
      value: request.value.toString(),
      dataBytes: (request.data.length - 2) / 2,
    },
    components: {
      l1Data: {
        wei: components.l1DataWei.toString(),
        l1GasUsed: components.l1GasUsed.toString(),
      },
      l2Execution: {
        wei: l2ExecutionWei.toString(),
        gas: components.l2Gas.toString(),
        gasPrice: components.l2GasPrice.toString(),
      },
      operatorFee: {
        wei: operatorFeeWei?.toString() ?? null,
        supported: components.operatorFeeParameters !== null,
        scalar: components.operatorFeeParameters?.scalar ?? null,
        constant: components.operatorFeeParameters?.constant.toString() ?? null,
      },
    },
    totalWei: totalWei.toString(),
    currency,
  };
}

export async function runFeeCommand(
  adapter: FeeAdapter,
  request: FeeRequest,
  currency: NativeCurrency,
): Promise<FeeEstimate> {
  return composeFeeEstimate(request, await adapter.estimateComponents(request), currency);
}
