import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import type { Network } from "./networks.js";

export interface ScaffoldResult {
  readonly type: "contract" | "app";
  readonly name: string;
  readonly directory: string;
  readonly files: readonly string[];
  readonly buildCommand: string;
}

function scaffoldError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

function writeExclusive(path: string, content: string): void {
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
}

function writeContract(directory: string, name: string, network: Network): ScaffoldResult {
  mkdirSync(join(directory, "src"));
  writeExclusive(
    join(directory, "foundry.toml"),
    `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"

[rpc_endpoints]
selected = "${network.rpcUrl}"
`,
  );
  writeExclusive(
    join(directory, "src", `${name}.sol`),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ${name} {
    function chainId() external view returns (uint256) {
        return block.chainid;
    }
}
`,
  );
  return {
    type: "contract",
    name,
    directory,
    files: ["foundry.toml", `src/${name}.sol`],
    buildCommand: "forge build",
  };
}

function writeApp(directory: string, name: string, network: Network): ScaffoldResult {
  mkdirSync(join(directory, "src"));
  writeExclusive(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: `@giwa/${name}`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          build: "bun build ./src/index.html --outdir ./dist --target browser",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeExclusive(
    join(directory, "src", "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <main id="app">Loading ${network.alias}...</main>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
`,
  );
  const networkJson = JSON.stringify({
    alias: network.alias,
    chainId: network.id,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
  });
  writeExclusive(
    join(directory, "src", "index.ts"),
    `const network = ${networkJson};

async function getBlockNumber(): Promise<string> {
  const response = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("result" in payload) ||
    typeof payload.result !== "string"
  ) {
    throw new Error("RPC returned an invalid block number");
  }
  return BigInt(payload.result).toString();
}

async function render(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) return;
  const blockNumber = await getBlockNumber();
  app.textContent = \`\${network.alias} (chain \${network.chainId}) block \${blockNumber}\`;
}

void render();
`,
  );
  return {
    type: "app",
    name,
    directory,
    files: ["package.json", "src/index.html", "src/index.ts"],
    buildCommand: "bun run build",
  };
}

export function createScaffold(
  directory: string,
  type: "contract" | "app",
  name: string,
  network: Network,
): ScaffoldResult {
  if (existsSync(directory)) {
    throw scaffoldError("SCAFFOLD_EXISTS", `Scaffold target already exists: ${directory}`);
  }
  try {
    mkdirSync(directory);
    return type === "contract"
      ? writeContract(directory, name, network)
      : writeApp(directory, name, network);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    if (error instanceof ApplicationError) {
      throw error;
    }
    const details = error instanceof Error ? error.message : String(error);
    throw scaffoldError("SCAFFOLD_CREATE_FAILED", `Failed to create scaffold: ${details}`);
  }
}
