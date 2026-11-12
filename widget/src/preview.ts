// Static showcase states for the landing page. Seeded, offline, labelled demo. Prices are from a
// live 1Click dry:true quote recorded on 2026-11-10 (48 USDC ← 0.577142683 SOL).
import type { Asset, PaymentView } from "./types";

const ASSETS: Asset[] = [
  { assetId: "sol", symbol: "SOL", chain: "sol", chainName: "Solana", color: "#14F195", decimals: 9, addressHint: "Base58 address", evmChainId: null },
  { assetId: "usdc-base", symbol: "USDC", chain: "base", chainName: "Base", color: "#0052FF", decimals: 6, addressHint: "0x…", evmChainId: 8453 },
  { assetId: "eth", symbol: "ETH", chain: "eth", chainName: "Ethereum", color: "#627EEA", decimals: 18, addressHint: "0x…", evmChainId: 1 },
  { assetId: "btc", symbol: "BTC", chain: "btc", chainName: "Bitcoin", color: "#F7931A", decimals: 8, addressHint: "bc1…", evmChainId: null },
];

const CHECKS = [
  "1Click reports the swap complete",
  "Same quote we issued (1Click signature matches)",
  "Deposit address matches this order",
  "Payout goes to the merchant's NEAR account",
  "Payout asset is USDC on NEAR",
  "Quote is EXACT_OUTPUT for the order amount",
  "1Click delivered at least the order amount",
  "NEAR chain shows the USDC transfer to the merchant",
].map((label, i) => ({ id: String(i), label, ok: true, detail: "demo" }));

export function PREVIEW(scene: string) {
  const status = { choose: "created", quote: "quoted", paying: "processing", settled: "paid" }[scene] ?? "created";
  const view: PaymentView = {
    id: "preview",
    mode: "demo",
    merchant: { name: "Lagos Leather Co.", account: "lagos-leather.near" },
    order: { name: "#1042", amountCents: 4800, amount: "$48.00" },
    status,
    quote: status === "created" ? null : {
      source: "recorded", originAsset: "sol", symbol: "SOL", chain: "sol", chainName: "Solana", decimals: 9, tokenAddress: null, evmChainId: null,
      amountIn: "577142683", amountInDisplay: "0.577142683", depositAddress: "DEMO-7f3a9c2e41b05d8e6a1c94f2",
      depositMemo: null, refundTo: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", deadline: new Date(Date.now() + 29 * 60e3 + 41e3).toISOString(), timeEstimateSec: 20,
    },
    refunded: null,
    settledInSec: status === "paid" ? 38 : null,
    proofTx: status === "paid" ? "DEMO4be1c0a7f29e" : null,
    checks: status === "paid" ? CHECKS : null,
    stages: [
      { id: "pending", label: "Pending", detail: "", at: status === "created" || status === "quoted" ? null : new Date(Date.now() - 38e3).toISOString() },
      { id: "settled", label: "Settled", detail: "", at: status === "paid" ? new Date(Date.now() - 2e3).toISOString() : null },
      { id: "paid_out", label: "Paid out", detail: "", at: status === "paid" ? new Date().toISOString() : null },
    ],
  };
  return { view, assets: ASSETS, selected: "sol", refundTo: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" };
}
