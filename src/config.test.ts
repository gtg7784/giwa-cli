import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigStore, loadConfig, resolveConfigDir, saveConfig } from "./config.js";
import { ApplicationError, EXIT_CODES } from "./errors.js";

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

describe("config persistence", () => {
  let configDir = "";

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "giwa-config-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("loads deterministic defaults without creating files", () => {
    // given: no persisted configuration
    const store = createConfigStore(configDir);

    // when: configuration is loaded
    const config = loadConfig(store);

    // then: GIWA Sepolia is selected without disk mutation
    expect(config).toEqual({ version: 1, activeNetwork: "giwa-sepolia", networks: [] });
    expect(Bun.file(store.configFile).size).toBe(0);
  });

  it("persists atomically with restrictive permissions", () => {
    // given: the default configuration
    const store = createConfigStore(join(configDir, "nested"));
    const config = loadConfig(store);

    // when: configuration is saved
    saveConfig(store, config);

    // then: content and POSIX permissions are deterministic
    expect(JSON.parse(readFileSync(store.configFile, "utf8"))).toEqual(config);
    expect(statSync(store.configDir).mode & 0o777).toBe(0o700);
    expect(statSync(store.configFile).mode & 0o777).toBe(0o600);
  });

  it("rejects malformed JSON with a stable config error", () => {
    // given: malformed persisted JSON
    const store = createConfigStore(configDir);
    writeFileSync(store.configFile, '{"version":', "utf8");

    // when: configuration is loaded
    const error = captureError(() => loadConfig(store));

    // then: callers receive a stable actionable error
    expect(error.code).toBe("CONFIG_MALFORMED");
    expect(error.exitCode).toBe(EXIT_CODES.config);
  });

  it("rejects invalid persisted network URLs", () => {
    // given: syntactically valid JSON with an unsafe RPC scheme
    const store = createConfigStore(configDir);
    writeFileSync(
      store.configFile,
      JSON.stringify({
        version: 1,
        activeNetwork: "custom",
        networks: [
          {
            id: 1,
            alias: "custom",
            name: "Custom",
            layer: "L2",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrl: "file:///tmp/rpc",
            explorerUrl: "https://example.com",
          },
        ],
      }),
      "utf8",
    );

    // when: configuration is loaded
    const error = captureError(() => loadConfig(store));

    // then: boundary validation rejects it
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("http");
  });

  it("resolves injected config locations in priority order", () => {
    // given: each supported environment convention
    // when: resolving the config directory
    // then: explicit, XDG, and HOME locations are deterministic
    expect(resolveConfigDir({ GIWA_CONFIG_DIR: "/explicit" })).toBe("/explicit");
    expect(resolveConfigDir({ XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/giwa");
    expect(resolveConfigDir({ HOME: "/home/test" })).toBe("/home/test/.config/giwa");
  });
});
