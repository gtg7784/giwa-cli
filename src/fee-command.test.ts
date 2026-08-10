import { describe, expect, it } from "bun:test";
import { type FeeComponents, type FeeRequest, composeFeeEstimate } from "./fee-command.js";

const request: FeeRequest = {
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  value: 0n,
  data: "0x12345678",
};
const currency = { name: "Ether", symbol: "ETH", decimals: 18 };

function components(overrides: Partial<FeeComponents> = {}): FeeComponents {
  return {
    l1DataWei: 4_210_000_000_000n,
    l1GasUsed: 1_600n,
    l2Gas: 21_000n,
    l2GasPrice: 1_000_253n,
    operatorFeeParameters: null,
    ...overrides,
  };
}

describe("OP Stack fee estimation", () => {
  it("isolates L1 and L2 components when operator fees are unsupported", () => {
    // given: fee components from a pre-Isthmus OP Stack chain
    const raw = components();

    // when: the public estimate is composed
    const result = composeFeeEstimate(request, raw, currency);

    // then: unsupported operator fees remain explicit and total is exact
    expect(result.components).toEqual({
      l1Data: { wei: "4210000000000", l1GasUsed: "1600" },
      l2Execution: {
        wei: "21005313000",
        gas: "21000",
        gasPrice: "1000253",
      },
      operatorFee: {
        wei: null,
        supported: false,
        scalar: null,
        constant: null,
      },
    });
    expect(result.totalWei).toBe("4231005313000");
  });

  it("uses viem-compatible operator fee ordering", () => {
    // given: an operator scalar requiring fixed-point division
    const raw = components({
      operatorFeeParameters: { scalar: 1_500_000, constant: 1_000n },
    });

    // when: the operator fee is composed
    const result = composeFeeEstimate(request, raw, currency);

    // then: scaled gas truncates before the constant is added
    expect(result.components.operatorFee).toEqual({
      wei: "32500",
      supported: true,
      scalar: 1_500_000,
      constant: "1000",
    });
    expect(result.totalWei).toBe("4231005345500");
  });

  it("truncates sub-unit operator scaling to zero", () => {
    // given: a scalar whose scaled gas is below one fixed-point unit
    const raw = components({
      l2Gas: 1n,
      operatorFeeParameters: { scalar: 999_999, constant: 7n },
    });

    // when: the estimate is composed
    const result = composeFeeEstimate(request, raw, currency);

    // then: only the constant survives integer division
    expect(result.components.operatorFee.wei).toBe("7");
  });

  it("serializes every bigint-bearing field safely", () => {
    // given: a complete estimate with operator fee support
    const result = composeFeeEstimate(
      request,
      components({
        operatorFeeParameters: { scalar: 1, constant: 2n },
      }),
      currency,
    );

    // when: the result crosses the JSON output boundary
    const serialized = JSON.stringify({ ok: true, data: result });

    // then: no bigint survives and request size is summarized
    expect(serialized).toContain('"totalWei"');
    expect(result.request).toEqual({
      from: request.from,
      to: request.to,
      value: "0",
      dataBytes: 4,
    });
  });
});
