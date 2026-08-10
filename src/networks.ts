export interface NativeCurrency {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface Network {
  readonly id: number;
  readonly alias: string;
  readonly name: string;
  readonly layer: "L1" | "L2";
  readonly nativeCurrency: NativeCurrency;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly portal?: string;
  readonly l1StandardBridge?: string;
  readonly disputeGameFactory?: string;
  readonly sourceId?: number;
}

export const GIWA_SEPOLIA = Object.freeze({
  id: 91_342,
  alias: "giwa-sepolia",
  name: "GIWA Sepolia",
  layer: "L2",
  nativeCurrency: Object.freeze({ name: "Sepolia Ether", symbol: "ETH", decimals: 18 }),
  rpcUrl: "https://sepolia-rpc.giwa.io",
  explorerUrl: "https://sepolia-explorer.giwa.io",
  portal: "0x956962C34687A954e611A83619ABaA37Ce6bC78A",
  l1StandardBridge: "0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7",
  disputeGameFactory: "0x37347caB2afaa49B776372279143D71ad1f354F6",
  sourceId: 11_155_111,
}) satisfies Network;

export const ETHEREUM_SEPOLIA = Object.freeze({
  id: 11_155_111,
  alias: "ethereum-sepolia",
  name: "Ethereum Sepolia",
  layer: "L1",
  nativeCurrency: Object.freeze({ name: "Sepolia Ether", symbol: "ETH", decimals: 18 }),
  rpcUrl: "https://11155111.rpc.thirdweb.com",
  explorerUrl: "https://sepolia.etherscan.io",
}) satisfies Network;

export const BUILTIN_NETWORKS: readonly Network[] = Object.freeze([GIWA_SEPOLIA, ETHEREUM_SEPOLIA]);
