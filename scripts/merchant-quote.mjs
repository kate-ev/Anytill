// What a merchant pays to accept crypto, priced live right now.
//   node scripts/merchant-quote.mjs 250        → markdown table for a $250 order across assets
// Each row is a live NEAR Intents 1Click EXACT_OUTPUT quote with dry:true (no deposit address, no funds),
// valued against CoinGecko's mid-market price fetched in the same run.
const USD = Number(process.argv[2] || 250);
const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const ROWS = [
  ["USDC", "Base", "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", 6, "usd-coin", "0x8ba1f109551bD432803012645Ac136ddd64DBA72"],
  ["USDT", "Ethereum", "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", 6, "tether", "0x8ba1f109551bD432803012645Ac136ddd64DBA72"],
  ["ETH", "Arbitrum", "nep141:arb.omft.near", 18, "ethereum", "0x8ba1f109551bD432803012645Ac136ddd64DBA72"],
  ["SOL", "Solana", "nep141:sol.omft.near", 9, "solana", "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"],
  ["BTC", "Bitcoin", "nep141:btc.omft.near", 8, "bitcoin", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"],
  ["NEAR", "NEAR", "nep141:wrap.near", 24, "near", "aurora"],
];

const ids = [...new Set(ROWS.map((r) => r[4]).concat("usd-coin"))].join(",");
const cgAt = new Date().toISOString();
const cg = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)).json();
const num = (a, d) => Number(a) / 10 ** d;
const received = USD * cg["usd-coin"].usd;
const out = [];

for (const [sym, chain, asset, dec, cgId, refund] of ROWS) {
  const body = {
    dry: true,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: asset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: USDC_NEAR,
    amount: String(Math.round(USD * 1e6)),
    refundTo: refund,
    refundType: asset === "nep141:wrap.near" ? "INTENTS" : "ORIGIN_CHAIN",
    recipient: "intents.near",
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 1800e3).toISOString(),
  };
  const res = await fetch("https://1click.chaindefuser.com/v0/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) {
    out.push(`| ${sym} on ${chain} | – | – | – | 1Click: ${j.message} |`);
    continue;
  }
  const bps = (atomic) => Math.round(((num(atomic, dec) * cg[cgId].usd - received) / received) * 10000);
  out.push(`| ${sym} on ${chain} | ${j.quote.amountInFormatted} | ${bps(j.quote.minAmountIn)} bps | ${bps(j.quote.amountIn)} bps | ~${j.quote.timeEstimate} s |`);
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`Live 1Click dry:true quotes for a $${USD.toFixed(2)} order (merchant receives exactly ${USD.toFixed(2)} USDC on NEAR), ${cgAt}.`);
console.log(`Mid-market: CoinGecko /api/v3/simple/price, same run (${ROWS.map((r) => `${r[0]} $${cg[r[4]].usd}`).join(", ")}, USDC $${cg["usd-coin"].usd}).\n`);
console.log("| Buyer pays with | Buyer sends (quote) | Spread at minimum input | Spread at quoted input (incl. 1% slippage buffer) | 1Click time estimate |");
console.log("|---|---|---|---|---|");
for (const l of out) console.log(l);
