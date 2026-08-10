# GIWA CLI

[English](README.md) | [한국어](README.ko.md)

GIWA CLI is a developer tool for the GIWA OP Stack L2.

It complements Foundry instead of replacing it. General EVM operations such as
calling contracts, sending transactions, and inspecting storage remain the job
of `cast`, `forge`, and `anvil`. GIWA CLI focuses on workflows that require GIWA
network metadata or OP Stack cross-domain knowledge:

- OP Stack withdrawal status, waiting, proving, and finalization
- L1 data, L2 execution, and operator fee breakdowns
- Deposit and withdrawal-aware transaction explanations
- GIWA network configuration export for shells and Foundry
- GIWA workspace diagnostics and dependency-free project scaffolding

## Status

GIWA CLI is currently at version `0.1.0` and targets GIWA Sepolia.

Built-in networks:

| Alias | Chain ID | Layer |
| --- | ---: | --- |
| `giwa-sepolia` | `91342` | L2 |
| `ethereum-sepolia` | `11155111` | L1 |

## Requirements

- [Bun](https://bun.sh/)
- [pnpm](https://pnpm.io/) 11

## Install from source

```bash
git clone <repository-url>
cd giwa-cli
pnpm install
pnpm build
pnpm link --global
```

Verify the installation:

```bash
giwa --version
giwa --help
```

To run the source directly without linking:

```bash
bun src/cli.ts --help
```

## Quick start

Inspect and validate the default GIWA Sepolia network:

```bash
giwa network list
giwa network info giwa-sepolia
giwa network health giwa-sepolia
```

Initialize and check a workspace:

```bash
giwa init my-project
giwa doctor my-project
```

Export the active network for a shell:

```bash
giwa network export
```

Export a Foundry RPC fragment:

```bash
giwa network export giwa-sepolia --format foundry
```

Explain an OP Stack transaction:

```bash
giwa tx explain 0x<transaction-hash>
```

Estimate all OP Stack fee components:

```bash
giwa fee estimate \
  --from 0x<sender-address> \
  --to 0x<recipient-address> \
  --value 0
```

## Command reference

### Global options

```text
--json                  Output structured JSON
--quiet                 Suppress successful output
--no-color              Disable colored output
--timeout <ms>          Set the RPC timeout
--confirmations <count> Set receipt confirmation count
```

Errors remain visible in quiet mode. Stable process exit codes are:

| Code | Meaning |
| ---: | --- |
| `0` | Success |
| `2` | Invalid usage or input |
| `3` | Configuration error |
| `4` | Network error |
| `5` | External tool or service error |
| `70` | Unexpected internal error |

### Networks

```bash
giwa network list
giwa network info [alias]
giwa network health [alias]
giwa network use <alias>
giwa network export [alias] --format env
giwa network export [alias] --format foundry
```

Add a custom network:

```bash
giwa network add <alias> \
  --chain-id <id> \
  --rpc-url <url> \
  --explorer-url <url> \
  [--name <name>] \
  [--layer L1|L2] \
  [--currency-name <name>] \
  [--currency-symbol <symbol>] \
  [--currency-decimals <count>] \
  [--portal <address>] \
  [--l1-standard-bridge <address>] \
  [--dispute-game-factory <address>] \
  [--source-id <l1-chain-id>]
```

The default configuration file is:

```text
~/.config/giwa/config.json
```

Set `GIWA_CONFIG_DIR` to use another directory. `XDG_CONFIG_HOME` is also
respected.

### Bridge withdrawals

Bridge commands accept the L2 transaction hash that initiated a withdrawal. If
one transaction emitted multiple withdrawals, select one with `--log-index`.

```bash
giwa bridge status <l2-transaction-hash>
giwa bridge wait <l2-transaction-hash> --for prove
giwa bridge prove <l2-transaction-hash>
giwa bridge wait <l2-transaction-hash> --for finalize
giwa bridge finalize <l2-transaction-hash>
```

Use another configured L2 with `--network <alias>`.

`status` and `wait` are read-only. `prove` and `finalize` submit L1
transactions and require a private key:

```bash
export GIWA_PRIVATE_KEY=0x<32-byte-private-key>
giwa bridge prove 0x<l2-transaction-hash>
```

The key is read only from the process environment and is not written to the
GIWA configuration. Treat it as a secret. Bridge write commands broadcast as
soon as the withdrawal reaches the required state.

### Transaction explanation

```bash
giwa tx explain <transaction-hash> [--log-index <index>] [--network <alias>]
```

The explanation includes:

- receipt status and transaction type
- L2 execution fee
- realized L1 data fee when the receipt exposes it
- deposit metadata
- decoded `MessagePassed` withdrawals

If realized L1 fee metadata is unavailable, the CLI reports an incomplete total
instead of treating the missing fee as zero.

### Fee estimation

```bash
giwa fee estimate \
  --from <address> \
  [--to <address>] \
  [--value <wei>] \
  [--data <hex>] \
  [--network <alias>]
```

The estimate separates:

- L1 data fee and L1 gas used
- L2 gas, gas price, and execution fee
- operator fee when supported by the chain
- total estimated fee

Values are reported in wei and JSON output serializes integer values without
losing precision.

### Workspace and project commands

```bash
giwa init [directory] [--network <alias>]
giwa doctor [directory]
giwa create contract <name>
giwa create app <name>
```

The generated contract is a dependency-free Foundry project. The generated app
is a dependency-free Bun browser application.

## Machine-readable usage

Use `--json` for scripts and CI:

```bash
giwa --json network info giwa-sepolia
giwa --json tx explain 0x<transaction-hash>
```

Use `--quiet` when only the exit code matters:

```bash
giwa --quiet network health giwa-sepolia
```

Network exports intentionally produce raw sourceable/configurable text in
human mode. JSON mode wraps the generated content with its network alias and
format.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm check
pnpm build
```

The test suite uses Bun. TypeScript is strict, and Biome provides formatting
and lint checks.

## License

MIT
