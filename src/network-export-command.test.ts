import { describe, expect, it } from "bun:test";
import { exportNetwork } from "./network-export-command.js";
import { GIWA_SEPOLIA } from "./networks.js";

describe("network configuration export", () => {
  it("exports shell-safe OP Stack environment variables", () => {
    // given: the authoritative Giwa Sepolia network
    const network = GIWA_SEPOLIA;

    // when: an environment export is requested
    const result = exportNetwork(network, "env");

    // then: chain, RPC, explorer, and bridge metadata are directly sourceable
    expect(result).toContain("GIWA_NETWORK='giwa-sepolia'");
    expect(result).toContain("GIWA_CHAIN_ID='91342'");
    expect(result).toContain("GIWA_L1_CHAIN_ID='11155111'");
    expect(result).toContain("GIWA_PORTAL='0x956962C34687A954e611A83619ABaA37Ce6bC78A'");
    expect(result).toContain(
      "GIWA_DISPUTE_GAME_FACTORY='0x37347caB2afaa49B776372279143D71ad1f354F6'",
    );
  });

  it("exports a Foundry RPC endpoint without private credentials", () => {
    // given: a public Giwa network configuration
    const network = GIWA_SEPOLIA;

    // when: a Foundry fragment is requested
    const result = exportNetwork(network, "foundry");

    // then: the alias and RPC URL form valid deterministic TOML
    expect(result).toBe(
      ["[rpc_endpoints]", 'giwa-sepolia = "https://sepolia-rpc.giwa.io"', ""].join("\n"),
    );
    expect(result).not.toContain("PRIVATE_KEY");
  });

  it("escapes shell and TOML metacharacters in custom network values", () => {
    // given: a custom network containing quote metacharacters
    const network = {
      ...GIWA_SEPOLIA,
      alias: "custom",
      rpcUrl: "https://rpc.example/a'b\"c",
    };

    // when: both export formats are rendered
    const environment = exportNetwork(network, "env");
    const foundry = exportNetwork(network, "foundry");

    // then: neither format permits value breakout
    expect(environment).toContain("GIWA_RPC_URL='https://rpc.example/a'\"'\"'b\"c'");
    expect(foundry).toContain('custom = "https://rpc.example/a\'b\\"c"');
  });
});
