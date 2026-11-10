// The assets a buyer can pay with. Every assetId below was read from the live
// 1Click token list (GET /v0/tokens) on 2026-11-10. Settlement is always USDC on NEAR.

export const USDC_NEAR = {
  assetId:
    "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  contract: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  decimals: 6,
  symbol: "USDC",
} as const;

export type ChainId =
  | "eth"
  | "base"
  | "arb"
  | "sol"
  | "btc"
  | "near"
  | "tron";

export interface Chain {
  id: ChainId;
  name: string;
  color: string;
  /** EVM chain id, when the buyer can pay from an injected EVM wallet. */
  evmChainId?: number;
  /** Example address shape shown as the refund-field placeholder. */
  addressHint: string;
}

export const CHAINS: Record<ChainId, Chain> = {
  eth: { id: "eth", name: "Ethereum", color: "#627EEA", evmChainId: 1, addressHint: "0x…" },
  base: { id: "base", name: "Base", color: "#0052FF", evmChainId: 8453, addressHint: "0x…" },
  arb: { id: "arb", name: "Arbitrum", color: "#28A0F0", evmChainId: 42161, addressHint: "0x…" },
  sol: { id: "sol", name: "Solana", color: "#14F195", addressHint: "Base58 address" },
  btc: { id: "btc", name: "Bitcoin", color: "#F7931A", addressHint: "bc1…" },
  near: { id: "near", name: "NEAR", color: "#00C08B", addressHint: "name.near" },
  tron: { id: "tron", name: "Tron", color: "#EB0029", addressHint: "T…" },
};

export interface PayAsset {
  assetId: string;
  symbol: string;
  chain: ChainId;
  decimals: number;
  /** ERC-20 contract on the origin chain; absent for a native gas token. */
  tokenAddress?: string;
}

export const PAY_ASSETS: PayAsset[] = [
  { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", symbol: "USDC", chain: "base", decimals: 6, tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", symbol: "USDC", chain: "arb", decimals: 6, tokenAddress: "0xaf88d065e77c8cC2239327C5EDB3A432268e5831" },
  { assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", symbol: "USDC", chain: "eth", decimals: 6, tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", symbol: "USDC", chain: "sol", decimals: 6 },
  { assetId: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", symbol: "USDT", chain: "eth", decimals: 6, tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near", symbol: "USDT", chain: "tron", decimals: 6 },
  { assetId: "nep141:eth.omft.near", symbol: "ETH", chain: "eth", decimals: 18 },
  { assetId: "nep141:base.omft.near", symbol: "ETH", chain: "base", decimals: 18 },
  { assetId: "nep141:arb.omft.near", symbol: "ETH", chain: "arb", decimals: 18 },
  { assetId: "nep141:sol.omft.near", symbol: "SOL", chain: "sol", decimals: 9 },
  { assetId: "nep141:btc.omft.near", symbol: "BTC", chain: "btc", decimals: 8 },
  { assetId: "nep141:wrap.near", symbol: "NEAR", chain: "near", decimals: 24 },
];

export function findAsset(assetId: string): PayAsset | undefined {
  return PAY_ASSETS.find((a) => a.assetId === assetId);
}

/** Lightweight address-shape checks so a typo never becomes a lost refund. */
export function looksLikeAddress(chain: ChainId, value: string): boolean {
  const v = value.trim();
  switch (chain) {
    case "eth":
    case "base":
    case "arb":
      return /^0x[0-9a-fA-F]{40}$/.test(v);
    case "sol":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
    case "btc":
      return /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(v);
    case "tron":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v);
    case "near":
      return isNearAccountId(v);
  }
}

/** NEAR account id rules: 2–64 chars, lowercase alnum separated by single - _ or . ; or a 64-hex implicit account. */
export function isNearAccountId(v: string): boolean {
  if (v.length < 2 || v.length > 64) return false;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v);
}

export function centsToUsdcAtomic(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("amount must be a positive whole number of cents");
  return (BigInt(cents) * 10_000n).toString();
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
