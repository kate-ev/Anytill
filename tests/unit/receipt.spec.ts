import { expect, test } from "@playwright/test";
import { findAsset } from "../../app/lib/assets";
import { computeSpread, recordedMid } from "../../app/lib/price.server";
import recorded from "../../app/lib/fixtures/quotes.recorded";

test("spread compares both sides at the same mid-market snapshot", () => {
  const mid = { assetUsd: 80, usdcUsd: 1, source: "test", at: "2026-11-12T00:00:00Z" };
  // 0.6 SOL at $80 = $48.00 paid for 48 USDC received → 0 bps
  expect(computeSpread("600000000", 9, "48000000", mid).bps).toBe(0);
  // 0.606 SOL = $48.48 → 100 bps
  expect(computeSpread("606000000", 9, "48000000", mid).bps).toBe(100);
});

test("recorded receipts use the CoinGecko snapshot taken with the quotes, and say so", () => {
  const sol = findAsset("nep141:sol.omft.near")!;
  const mid = recordedMid(sol)!;
  expect(mid.source).toContain("CoinGecko");
  expect(mid.source).toContain("recorded");
  const q = (recorded as unknown as Record<string, { amountIn: string; amountOut: string }>)["nep141:sol.omft.near"];
  const s = computeSpread(q.amountIn, 9, q.amountOut, mid);
  // A real quote with a 1% slippage buffer: the spread is positive and below 3%.
  expect(s.bps).toBeGreaterThan(0);
  expect(s.bps).toBeLessThan(300);
});
