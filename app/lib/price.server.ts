// Mid-market reference prices for receipts. Source: CoinGecko's public /simple/price endpoint.
// Captured once, at quote time, and stored with the payment, so a receipt never changes later.
// Offline / recorded mode uses the CoinGecko snapshot recorded together with the quotes.

import recorded from "./fixtures/quotes.recorded";
import type { PayAsset } from "./assets";

export const COINGECKO_IDS: Record<string, string> = {
  SOL: "solana",
  ETH: "ethereum",
  BTC: "bitcoin",
  NEAR: "near",
  USDC: "usd-coin",
  USDT: "tether",
};

export interface MidSnapshot {
  /** USD price of the asset the buyer pays with. */
  assetUsd: number;
  /** USD price of USDC, so both sides are valued by the same source. */
  usdcUsd: number;
  source: string;
  at: string;
}

const CG = "https://api.coingecko.com/api/v3/simple/price";

export async function fetchMid(asset: PayAsset, mode: "live" | "dry" | "recorded", f: typeof fetch = fetch): Promise<MidSnapshot | null> {
  const id = COINGECKO_IDS[asset.symbol];
  if (!id) return null;
  if (mode === "recorded") return recordedMid(asset);
  try {
    const res = await f(`${CG}?ids=${id},usd-coin&vs_currencies=usd&include_last_updated_at=true`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as Record<string, { usd: number; last_updated_at?: number }>;
    if (!j[id]?.usd || !j["usd-coin"]?.usd) throw new Error("missing price");
    return {
      assetUsd: j[id].usd,
      usdcUsd: j["usd-coin"].usd,
      source: "CoinGecko /simple/price (live)",
      at: new Date((j[id].last_updated_at ?? Date.now() / 1000) * 1000).toISOString(),
    };
  } catch {
    // No price is better than a wrong one: never value a live quote with the recorded snapshot.
    return null;
  }
}

export function recordedMid(asset: PayAsset): MidSnapshot | null {
  const p = (recorded as unknown as { _prices: { source: string; fetchedAt: string; usd: Record<string, number> } })._prices;
  const id = COINGECKO_IDS[asset.symbol];
  if (!p || !id || !p.usd[id] || !p.usd["usd-coin"]) return null;
  return { assetUsd: p.usd[id], usdcUsd: p.usd["usd-coin"], source: `${p.source} (recorded snapshot)`, at: p.fetchedAt };
}

export interface Spread {
  paidUsd: number;
  receivedUsd: number;
  /** Positive = the buyer paid more than the merchant received, at mid-market. */
  bps: number;
}

/** Spread between what the buyer sent and what the merchant got, both valued at the same mid-market snapshot. */
export function computeSpread(amountInAtomic: string, decimals: number, amountOutAtomicUsdc: string, mid: MidSnapshot): Spread {
  const paid = atomicToNumber(amountInAtomic, decimals) * mid.assetUsd;
  const received = atomicToNumber(amountOutAtomicUsdc, 6) * mid.usdcUsd;
  return { paidUsd: round(paid, 4), receivedUsd: round(received, 4), bps: Math.round(((paid - received) / received) * 10_000) };
}

function atomicToNumber(atomic: string, decimals: number): number {
  const s = atomic.padStart(decimals + 1, "0");
  return Number(`${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`);
}

function round(n: number, d: number) {
  const k = 10 ** d;
  return Math.round(n * k) / k;
}
