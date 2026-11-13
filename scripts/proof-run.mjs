// Runs real demo checkouts against a running Anytill server with anchoring enabled, waits until each
// receipt is anchored on NEAR, and saves the receipts to docs/anchored-receipts/ for anyone to verify.
//   ANYTILL_URL=http://localhost:3400 node scripts/proof-run.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.ANYTILL_URL || "http://localhost:3400";
const ORDERS = [
  { amount: "48.00", asset: "nep141:sol.omft.near", refund: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" },
  { amount: "24.00", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", refund: "0x8ba1f109551bD432803012645Ac136ddd64DBA72" },
  { amount: "120.00", asset: "nep141:arb.omft.near", refund: "0x8ba1f109551bD432803012645Ac136ddd64DBA72" },
  { amount: "250.00", asset: "nep141:btc.omft.near", refund: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
];

async function j(path, body) {
  const r = await fetch(BASE + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const out = await r.json();
  if (!r.ok) throw new Error(`${path}: ${out.error}`);
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 30; i++) {
  if (await fetch(BASE + "/api/v1/assets").then((r) => r.ok, () => false)) break;
  await sleep(1000);
}
mkdirSync("docs/anchored-receipts", { recursive: true });

const only = process.env.ONLY?.split(",");
for (const o of ORDERS.filter((x) => !only || only.includes(x.amount))) {
  const p = await j("/api/v1/payments", { merchant: "demo", amount: o.amount, orderRef: `proof-${Date.now()}`, orderName: `proof $${o.amount}` });
  await j(`/api/v1/payments/${p.id}/quote`, { originAsset: o.asset, refundTo: o.refund });
  await j(`/api/v1/payments/${p.id}/deposit`, { simulate: true });
  let r;
  for (let i = 0; i < 120; i++) {
    await j(`/api/v1/payments/${p.id}`);
    r = await j(`/api/v1/payments/${p.id}/receipt`);
    if (r.anchor) break;
    await sleep(1000);
  }
  if (!r?.anchor) throw new Error(`receipt ${p.id} was not anchored`);
  writeFileSync(`docs/anchored-receipts/${p.id}.json`, JSON.stringify(r, null, 2) + "\n");
  console.log(`${o.amount} via ${r.paid.amount} ${r.paid.symbol} on ${r.paid.chain} | spread ${r.spread?.bps} bps (${r.spread?.source}) | anchor ${r.anchor.txHash}`);
}
