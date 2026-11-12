import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { USDC_NEAR } from "../../app/lib/assets";
import type { StatusResponse } from "../../app/lib/oneclick.server";
import { verifySettlement, type ChainReader, type IssuedQuote } from "../../app/lib/settlement.server";

// "Try to break it": real attacks against settlement verification and the running server.
// Every attack must be refused. The test prints "N of N refused".

const SOL = "nep141:sol.omft.near";
const SOL_REFUND = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

const orderA: IssuedQuote = { depositAddress: "DepAAAA1111111111111111111111111111", signature: "ed25519:quoteA", recipient: "lagos-leather.near", amountOutAtomic: "48000000", originAsset: SOL };
const orderB: IssuedQuote = { ...orderA, depositAddress: "DepBBBB2222222222222222222222222222", signature: "ed25519:quoteB" };

function successFor(q: IssuedQuote, over: Partial<{ recipient: string; amountOut: string; dest: string }> = {}): StatusResponse {
  return {
    correlationId: "x", status: "SUCCESS", updatedAt: new Date().toISOString(),
    quoteResponse: {
      correlationId: "x", timestamp: "", signature: q.signature,
      quoteRequest: { dry: false, swapType: "EXACT_OUTPUT", slippageTolerance: 100, originAsset: SOL, depositType: "ORIGIN_CHAIN", destinationAsset: over.dest ?? USDC_NEAR.assetId, amount: q.amountOutAtomic, refundTo: SOL_REFUND, refundType: "ORIGIN_CHAIN", recipient: over.recipient ?? q.recipient, recipientType: "DESTINATION_CHAIN", deadline: "" },
      quote: { depositAddress: q.depositAddress, amountIn: "1", amountInFormatted: "", amountInUsd: "", minAmountIn: "1", amountOut: q.amountOutAtomic, amountOutFormatted: "", amountOutUsd: "", minAmountOut: q.amountOutAtomic, timeEstimate: 20 },
    },
    swapDetails: { intentHashes: [], nearTxHashes: ["TX"], amountOut: over.amountOut ?? q.amountOutAtomic, originChainTxHashes: [], destinationChainTxHashes: [{ hash: "TX", explorerUrl: "" }] },
  };
}
const chainPays = (to: string, amount: string, contract = USDC_NEAR.contract): ChainReader => ({
  ftTransfers: async () => [{ txHash: "TX", contract, oldOwner: "intents.near", newOwner: to, amount }],
});
const honestChain = chainPays(orderB.recipient, orderB.amountOutAtomic);

test("try to break it: every attack is refused", async ({ request }) => {
  test.setTimeout(90_000);
  const results: { attack: string; refused: boolean; how: string }[] = [];
  const attempt = async (attack: string, run: () => Promise<{ refused: boolean; how: string }>) => {
    await test.step(attack, async () => {
      const r = await run();
      results.push({ attack, ...r });
    });
  };

  // ── settlement verification (the code that decides "mark paid") ──
  await attempt("Forged deposit: SUCCESS for a different deposit address", async () => {
    const st = successFor({ ...orderB, depositAddress: "AttackerDeposit999999999999999999" });
    const v = await verifySettlement(orderB, st, honestChain);
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });
  await attempt("Wrong amount: 1 USDC short of the order", async () => {
    const v = await verifySettlement(orderB, successFor(orderB, { amountOut: "47000000" }), chainPays(orderB.recipient, "47000000"));
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });
  await attempt("Replayed quote: order A's settled swap presented for order B", async () => {
    const v = await verifySettlement(orderB, successFor(orderA), honestChain);
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });
  await attempt("Wrong recipient: payout redirected to attacker.near", async () => {
    const v = await verifySettlement(orderB, successFor(orderB, { recipient: "attacker.near" }), chainPays("attacker.near", "48000000"));
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });
  await attempt("Fake token: a look-alike USDC contract pays the merchant", async () => {
    const v = await verifySettlement(orderB, successFor(orderB), chainPays(orderB.recipient, "48000000", "usdc-lookalike.near"));
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });
  await attempt("Lying status: 1Click says SUCCESS, NEAR shows no transfer", async () => {
    const v = await verifySettlement(orderB, successFor(orderB), { ftTransfers: async () => [] });
    return { refused: !v.ok, how: v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") };
  });

  // ── the running server ──
  const newPayment = async (amount = "20.00") => (await (await request.post("/api/v1/payments", { data: { merchant: "demo", amount, orderRef: `atk-${Date.now()}-${Math.random()}` } })).json());
  const quote = (id: string, data: Record<string, unknown>) => request.post(`/api/v1/payments/${id}/quote`, { data: { originAsset: SOL, refundTo: SOL_REFUND, ...data } });

  await attempt("Over-cap order: $9,000 against a $500 per-order cap", async () => {
    const r = await request.post("/api/v1/payments", { data: { merchant: "demo", amount: "9000", orderRef: `atk-cap-${Date.now()}` } });
    const j = await r.json();
    return { refused: r.status() === 400 && j.code === "per_order_cap", how: `${r.status()} ${j.code}` };
  });
  await attempt("Price tampering: client sends amount 0.01 with the quote", async () => {
    const p = await newPayment("20.00");
    const q = await (await quote(p.id, { amount: "0.01", amountCents: 1, amountOut: "10000" })).json();
    return { refused: q.order.amountCents === 2000, how: `quote still for ${q.order.amount}` };
  });
  await attempt("Forged deposit tx: buyer reports a made-up hash, then polls", async () => {
    const p = await newPayment();
    await quote(p.id, {});
    await request.post(`/api/v1/payments/${p.id}/deposit`, { data: { txHash: "0xdeadbeef" } });
    const after = await (await request.get(`/api/v1/payments/${p.id}`)).json();
    return { refused: after.status !== "paid", how: `status stays ${after.status}` };
  });
  await attempt("Quote swap mid-flight: re-quote after the deposit landed", async () => {
    const p = await newPayment();
    await quote(p.id, {});
    await request.post(`/api/v1/payments/${p.id}/deposit`, { data: { simulate: true } });
    const r = await quote(p.id, { originAsset: "nep141:btc.omft.near", refundTo: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" });
    return { refused: r.status() === 409, how: `${r.status()} ${(await r.json()).code}` };
  });
  await attempt("Unlisted asset: pay with a token the store doesn't accept", async () => {
    const p = await newPayment();
    const r = await quote(p.id, { originAsset: "nep141:scamcoin.near" });
    return { refused: r.status() === 400, how: `${r.status()} ${(await r.json()).code}` };
  });
  await attempt("Deposit before quote: simulate on an unquoted order", async () => {
    const p = await newPayment();
    const r = await request.post(`/api/v1/payments/${p.id}/deposit`, { data: { simulate: true } });
    return { refused: r.status() === 400, how: `${r.status()} ${(await r.json()).code}` };
  });
  await attempt("Double mark-paid: 12 concurrent pollers race on one settled order", async () => {
    const p = await newPayment("12.00");
    await quote(p.id, {});
    await request.post(`/api/v1/payments/${p.id}/deposit`, { data: { simulate: true } });
    await new Promise((r) => setTimeout(r, 3000)); // DEMO_SETTLE_MS = 2500 in E2E
    await Promise.all(Array.from({ length: 12 }, () => request.get(`/api/v1/payments/${p.id}`)));
    const db = new PrismaClient({ datasourceUrl: "file:./e2e.sqlite" });
    const paidEvents = await db.paymentEvent.count({ where: { paymentId: p.id, kind: "paid" } });
    await db.$disconnect();
    return { refused: paidEvents === 1, how: `${paidEvents} "paid" event` };
  });

  const refused = results.filter((r) => r.refused).length;
  console.log(`\nTry to break it: ${refused} of ${results.length} attacks refused`);
  for (const r of results) console.log(`  ${r.refused ? "refused" : "GOT THROUGH"}  ${r.attack}  (${r.how})`);
  expect(results.filter((r) => !r.refused).map((r) => r.attack)).toEqual([]);
  expect(refused).toBe(13);
});
