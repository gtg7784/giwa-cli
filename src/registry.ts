import {
  type Config,
  type ConfigNetwork,
  createConfigStore,
  loadConfig,
  parseConfigNetwork,
  saveConfig,
  validateNetworkAlias,
} from "./config.js";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { BUILTIN_NETWORKS, type Network } from "./networks.js";

function configNetworkToNetwork(network: ConfigNetwork): Network {
  return {
    id: network.id,
    alias: network.alias,
    name: network.name,
    layer: network.layer,
    nativeCurrency: network.nativeCurrency,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    ...(network.portal !== undefined && { portal: network.portal }),
    ...(network.l1StandardBridge !== undefined && {
      l1StandardBridge: network.l1StandardBridge,
    }),
    ...(network.disputeGameFactory !== undefined && {
      disputeGameFactory: network.disputeGameFactory,
    }),
    ...(network.sourceId !== undefined && { sourceId: network.sourceId }),
  };
}

function registryError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

export interface Registry {
  listNetworks(): readonly Network[];
  resolveNetwork(alias: string): Network;
  getActiveNetwork(): Network;
  addNetwork(network: Network): void;
  selectNetwork(alias: string): void;
}

export function createRegistry(configDir?: string): Registry {
  const store = createConfigStore(configDir);
  let config = loadConfig(store);

  function listNetworks(): readonly Network[] {
    return [
      ...BUILTIN_NETWORKS,
      ...config.networks.map((network) => configNetworkToNetwork(network)),
    ];
  }

  function resolveNetwork(alias: string): Network {
    const network = listNetworks().find((candidate) => candidate.alias === alias);
    if (!network) {
      throw registryError("CONFIG_NETWORK_NOT_FOUND", `Network "${alias}" was not found`);
    }
    return network;
  }

  function persist(candidate: Config): void {
    saveConfig(store, candidate);
    config = candidate;
  }

  return {
    listNetworks,
    resolveNetwork,
    getActiveNetwork(): Network {
      return resolveNetwork(config.activeNetwork);
    },
    addNetwork(network: Network): void {
      validateNetworkAlias(network.alias);
      const parsed = parseConfigNetwork(network);
      if (listNetworks().some((existing) => existing.id === parsed.id)) {
        throw registryError(
          "CONFIG_DUPLICATE_CHAIN_ID",
          `Chain ID ${parsed.id} is already registered`,
        );
      }
      if (config.networks.some((existing) => existing.alias === parsed.alias)) {
        throw registryError("CONFIG_NETWORK_EXISTS", `Network "${parsed.alias}" already exists`);
      }
      persist({ ...config, networks: [...config.networks, parsed] });
    },
    selectNetwork(alias: string): void {
      resolveNetwork(alias);
      persist({ ...config, activeNetwork: alias });
    },
  };
}
