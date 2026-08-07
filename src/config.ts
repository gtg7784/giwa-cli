import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { BUILTIN_NETWORKS } from "./networks.js";

const AliasSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "must use http or https",
  });
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const ConfigNetworkSchema = z.object({
  id: z.number().int().positive(),
  alias: AliasSchema,
  name: z.string().trim().min(1).max(256),
  layer: z.enum(["L1", "L2"]),
  nativeCurrency: z.object({
    name: z.string().trim().min(1),
    symbol: z.string().trim().min(1).max(10),
    decimals: z.number().int().min(0).max(255),
  }),
  rpcUrl: HttpUrlSchema,
  explorerUrl: HttpUrlSchema,
  portal: AddressSchema.optional(),
  l1StandardBridge: AddressSchema.optional(),
  sourceId: z.number().int().positive().optional(),
});

const ConfigSchema = z.object({
  version: z.literal(1),
  activeNetwork: AliasSchema,
  networks: z.array(ConfigNetworkSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigNetwork = z.infer<typeof ConfigNetworkSchema>;

export interface ConfigStore {
  readonly configDir: string;
  readonly configFile: string;
}

interface Environment {
  readonly GIWA_CONFIG_DIR?: string;
  readonly XDG_CONFIG_HOME?: string;
  readonly HOME?: string;
}

function configError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveConfigDir(environment: Environment = process.env): string {
  const explicit = environment.GIWA_CONFIG_DIR;
  if (explicit) {
    return explicit;
  }
  const xdgHome = environment.XDG_CONFIG_HOME;
  if (xdgHome) {
    return join(xdgHome, "giwa");
  }
  const home = environment.HOME;
  if (!home) {
    throw configError("CONFIG_NO_HOME", "HOME is not set and no config directory was provided");
  }
  return join(home, ".config", "giwa");
}

export function createConfigStore(configDir = resolveConfigDir()): ConfigStore {
  return {
    configDir,
    configFile: join(configDir, "config.json"),
  };
}

export function defaultConfig(): Config {
  return {
    version: 1,
    activeNetwork: "giwa-sepolia",
    networks: [],
  };
}

function parseConfig(input: unknown): Config {
  const result = ConfigSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
  throw configError("CONFIG_INVALID", `Config validation failed: ${details}`);
}

export function parseConfigNetwork(input: unknown): ConfigNetwork {
  const result = ConfigNetworkSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "network"}: ${issue.message}`)
    .join("; ");
  throw configError("CONFIG_INVALID_NETWORK", `Network validation failed: ${details}`);
}

export function loadConfig(store: ConfigStore): Config {
  if (!existsSync(store.configFile)) {
    return defaultConfig();
  }
  let content: string;
  try {
    content = readFileSync(store.configFile, "utf8");
  } catch (error) {
    throw configError("CONFIG_READ_ERROR", `Failed to read config: ${describeError(error)}`);
  }
  try {
    return parseConfig(JSON.parse(content));
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw configError("CONFIG_MALFORMED", `Config is not valid JSON: ${describeError(error)}`);
  }
}

export function saveConfig(store: ConfigStore, candidate: Config): void {
  const config = parseConfig(candidate);
  const tempFile = `${store.configFile}.${randomUUID()}.tmp`;
  try {
    mkdirSync(store.configDir, { recursive: true, mode: 0o700 });
    chmodSync(store.configDir, 0o700);
    writeFileSync(tempFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(tempFile, store.configFile);
    chmodSync(store.configFile, 0o600);
  } catch (error) {
    try {
      rmSync(tempFile, { force: true });
    } catch (cleanupError) {
      throw configError(
        "CONFIG_CLEANUP_ERROR",
        `Failed to save config (${describeError(error)}) and clean temporary file (${describeError(cleanupError)})`,
      );
    }
    throw configError("CONFIG_WRITE_ERROR", `Failed to save config: ${describeError(error)}`);
  }
}

export function validateNetworkAlias(alias: string): void {
  if (!AliasSchema.safeParse(alias).success) {
    throw configError(
      "CONFIG_INVALID_ALIAS",
      "Network alias must use lowercase letters, numbers, and single hyphens",
    );
  }
  if (BUILTIN_NETWORKS.some((network) => network.alias === alias)) {
    throw configError("CONFIG_ALIAS_COLLISION", `Network alias "${alias}" is built in`);
  }
}
