import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigStore, loadConfig, saveConfig } from "./config.js";
import { ApplicationError } from "./errors.js";
import { GIWA_SEPOLIA, type Network } from "./networks.js";
import { createRegistry } from "./registry.js";

const CUSTOM_NETWORK: Network = {
  id: 12_345,
  alias: "custom-chain",
  name: "Custom Chain",
  layer: "L2",
  nativeCurrency: { name: "Test Ether", symbol: "TETH", decimals: 18 },
  rpcUrl: "http://127.0.0.1:8545",
  explorerUrl: "https://explorer.example.com",
};

function captureError(action: () => void): ApplicationError {
  try {
    action();
  } catch (error) {
    if (error instanceof ApplicationError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected ApplicationError");
}

describe("network registry", () => {
  let configDir = "";

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "giwa-registry-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("exposes immutable authoritative built-ins", () => {
    // given: a registry with no custom configuration
    // when: built-ins are listed
    const networks = createRegistry(configDir).listNetworks();

    // then: exact GIWA and L1 metadata is present
    expect(networks).toHaveLength(2);
    expect(networks[0]).toEqual(GIWA_SEPOLIA);
    expect(GIWA_SEPOLIA.id).toBe(91_342);
    expect(GIWA_SEPOLIA.portal).toBe("0x956962C34687A954e611A83619ABaA37Ce6bC78A");
    expect(GIWA_SEPOLIA.l1StandardBridge).toBe("0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7");
    expect(Object.isFrozen(GIWA_SEPOLIA)).toBe(true);
  });

  it("adds resolves and reloads a custom network", () => {
    // given: the default registry
    const registry = createRegistry(configDir);

    // when: a custom network is added
    registry.addNetwork(CUSTOM_NETWORK);

    // then: it resolves now and after a fresh load
    expect(registry.resolveNetwork("custom-chain")).toEqual(CUSTOM_NETWORK);
    expect(createRegistry(configDir).resolveNetwork("custom-chain")).toEqual(CUSTOM_NETWORK);
  });

  it("persists active network selection", () => {
    // given: a persisted custom network
    const registry = createRegistry(configDir);
    registry.addNetwork(CUSTOM_NETWORK);

    // when: it becomes active
    registry.selectNetwork("custom-chain");

    // then: fresh registry state preserves the selection
    expect(createRegistry(configDir).getActiveNetwork()).toEqual(CUSTOM_NETWORK);
  });

  it("preserves config bytes after rejected updates", () => {
    // given: a valid persisted configuration
    const store = createConfigStore(configDir);
    saveConfig(store, loadConfig(store));
    const before = readFileSync(store.configFile);
    const registry = createRegistry(configDir);

    // when: invalid alias, duplicate chain, and unknown selection are rejected
    const aliasError = captureError(() =>
      registry.addNetwork({ ...CUSTOM_NETWORK, alias: "Invalid Alias" }),
    );
    const chainError = captureError(() =>
      registry.addNetwork({ ...CUSTOM_NETWORK, alias: "duplicate", id: GIWA_SEPOLIA.id }),
    );
    const selectionError = captureError(() => registry.selectNetwork("missing"));

    // then: errors are stable and persisted bytes remain unchanged
    expect(aliasError.code).toBe("CONFIG_INVALID_ALIAS");
    expect(chainError.code).toBe("CONFIG_DUPLICATE_CHAIN_ID");
    expect(selectionError.code).toBe("CONFIG_NETWORK_NOT_FOUND");
    expect(readFileSync(store.configFile)).toEqual(before);
  });

  it("rejects unsafe custom URLs before writing", () => {
    // given: a custom network with a non-HTTP RPC URL
    const registry = createRegistry(configDir);

    // when: it is added
    const error = captureError(() =>
      registry.addNetwork({ ...CUSTOM_NETWORK, rpcUrl: "file:///tmp/rpc" }),
    );

    // then: runtime validation rejects it and creates no config
    expect(error.code).toBe("CONFIG_INVALID_NETWORK");
    expect(Bun.file(createConfigStore(configDir).configFile).size).toBe(0);
  });
});
