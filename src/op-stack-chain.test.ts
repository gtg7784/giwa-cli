import { describe, expect, it } from "bun:test";
import { ETHEREUM_SEPOLIA } from "./networks.js";
import { toViemSourceChain } from "./op-stack-chain.js";

describe("OP Stack source chain configuration", () => {
  it("provides multicall metadata required by withdrawal status actions", () => {
    // given: the configured Ethereum Sepolia source network
    const network = ETHEREUM_SEPOLIA;

    // when: its viem chain is defined
    const chain = toViemSourceChain(network);

    // then: OP Stack L1 multicalls resolve through the canonical deployment
    expect(chain.contracts?.multicall3?.address).toBe("0xca11bde05977b3631167028862be2a173976ca11");
  });
});
