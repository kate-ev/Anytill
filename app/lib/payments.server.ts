import { createHash } from "node:crypto";
import type { Merchant, Payment } from "@prisma/client";
import prisma from "../db.server";
import { CHAINS, USDC_NEAR, centsToUsdcAtomic, findAsset, formatUsd, looksLikeAddress } from "./assets";
import { config, oneClick } from "./config.server";
import { demoChainReader, nearChainReader } from "./near.server";
import { OneClickError, formatAtomic, recordedQuote, type QuoteResponse, type StatusResponse } from "./oneclick.server";
import { ordersFor } from "./orders.server";
import { verifySettlement, type Verification } from "./settlement.server";
import { computeSpread, fetchMid, type MidSnapshot } from "./price.server";

export class PaymentError extends Error {
  constructor(message: string, public readonly code: string, public readonly httpStatus = 400) {
    super(message);
  }
}

const ACTIVE = ["created", "quoted", "deposit_seen", "processing", "verifying"];
const TERMINAL = ["paid", "refunded", "failed", "needs_review"];

async function log(paymentId: string, kind: string, detail: string) {
  await prisma.paymentEvent.create({ data: { paymentId, kind, detail } });
}

// ───────────────────────── protections ─────────────────────────

export async function checkCaps(merchant: Merchant, amountCents: number, excludePaymentId?: string) {
  if (amountCents > merchant.perOrderCapCents) {
    throw new PaymentError(
      `This order (${formatUsd(amountCents)}) is above this store's crypto limit of ${formatUsd(merchant.perOrderCapCents)} per order. Please choose another payment method.`,
      "per_order_cap",
    );
  }
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const agg = await prisma.payment.aggregate({
    _sum: { amountCents: true },
    where: {
      shop: merchant.shop,
      createdAt: { gte: since },
      status: { in: [...ACTIVE.filter((s) => s !== "created"), "paid"] },
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
    },
  });
  const used = agg._sum.amountCents ?? 0;
  if (used + amountCents > merchant.dailyCapCents) {
    throw new PaymentError(
      `This store has reached its 24-hour crypto limit (${formatUsd(merchant.dailyCapCents)}). Please choose another payment method.`,
      "daily_cap",
    );
  }
}

// ───────────────────────── create ─────────────────────────

export async function createPayment(input: { shop: string; orderRef: string }) {
  const merchant = await prisma.merchant.findUnique({ where: { shop: input.shop } });
  if (!merchant || !merchant.enabled) throw new PaymentError("This store has not turned on crypto payments.", "merchant_disabled", 403);

  // Never trust an amount from the browser: read the order from the store.
  const order = await ordersFor(input.shop).getOrder(input.shop, input.orderRef);
  if (!order) throw new PaymentError("Order not found.", "order_not_found", 404);
  if (order.cancelled) throw new PaymentError("This order was cancelled.", "order_cancelled");
  if (!order.viaCrypto) throw new PaymentError("This order uses another payment method.", "not_crypto_order", 409);
  if (order.paid || order.outstandingCents <= 0) throw new PaymentError("This order is already paid.", "order_paid", 409);
  if (order.currency !== "USD") throw new PaymentError(`Crypto checkout settles in USDC, so it needs a USD order (this one is ${order.currency}).`, "currency");

  const existing = await prisma.payment.findFirst({
    where: { shop: input.shop, orderRef: input.orderRef, status: { in: [...ACTIVE, "expired"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing && existing.amountCents === order.outstandingCents) return existing;

  await checkCaps(merchant, order.outstandingCents);
  const p = await prisma.payment.create({
    data: {
      shop: input.shop,
      orderRef: input.orderRef,
      orderName: order.name,
      amountCents: order.outstandingCents,
      currency: order.currency,
      recipient: merchant.nearAccount,
    },
  });
  await log(p.id, "created", `${order.name} · ${formatUsd(p.amountCents)} → ${merchant.nearAccount}`);
  return p;
}

/** Script-tag merchants have no order system we can read; the amount is the page's, capped by the merchant's limits. */
export async function createSitePayment(input: { site: string; amountCents: number; orderRef: string; orderName?: string }) {
  const shop = input.site;
  if (shop.startsWith("site:")) {
    // First payment from a script-tag site registers it with default caps; payouts can only go to the account it names.
    const account = shop.slice(5);
    await prisma.merchant.upsert({ where: { shop }, update: {}, create: { shop, displayName: account, nearAccount: account, enabled: true } });
  }
  const merchant = await prisma.merchant.findUnique({ where: { shop } });
  if (!merchant || !merchant.enabled) throw new PaymentError("This site has not turned on crypto payments.", "merchant_disabled", 403);
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) throw new PaymentError("Amount must be at least $1.00.", "amount");
  const existing = await prisma.payment.findFirst({ where: { shop, orderRef: input.orderRef, status: { in: [...ACTIVE, "expired"] } } });
  if (existing && existing.amountCents === input.amountCents) return existing;
  const paid = await prisma.payment.findFirst({ where: { shop, orderRef: input.orderRef, status: "paid" } });
  if (paid) throw new PaymentError("This order is already paid.", "order_paid", 409);
  await checkCaps(merchant, input.amountCents);
  const p = await prisma.payment.create({
    data: { shop, orderRef: input.orderRef, orderName: input.orderName || input.orderRef, amountCents: input.amountCents, recipient: merchant.nearAccount },
  });
  await log(p.id, "created", `${p.orderName} · ${formatUsd(p.amountCents)} → ${merchant.nearAccount}`);
  return p;
}

// ───────────────────────── quote ─────────────────────────

export async function quotePayment(paymentId: string, input: { originAsset: string; refundTo: string }) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { merchant: true } });
  if (!p) throw new PaymentError("Payment not found.", "not_found", 404);
  if (!["created", "quoted", "expired"].includes(p.status)) throw new PaymentError("A deposit is already in progress for this order.", "locked", 409);

  const asset = findAsset(input.originAsset);
  if (!asset) throw new PaymentError("That asset is not accepted here.", "asset");
  const refundTo = input.refundTo.trim();
  if (!looksLikeAddress(asset.chain, refundTo)) {
    throw new PaymentError(`That doesn't look like a ${CHAINS[asset.chain].name} address. It is where 1Click returns funds if anything goes wrong.`, "refund_address");
  }
  await checkCaps(p.merchant, p.amountCents, p.id);

  const amountOut = centsToUsdcAtomic(p.amountCents);
  const deadline = new Date(Date.now() + p.merchant.quoteTtlMinutes * 60_000);
  const req = {
    dry: config.mode !== "live",
    swapType: "EXACT_OUTPUT" as const,
    slippageTolerance: p.merchant.slippageBps,
    originAsset: asset.assetId,
    depositType: "ORIGIN_CHAIN" as const,
    destinationAsset: USDC_NEAR.assetId,
    amount: amountOut,
    refundTo,
    refundType: "ORIGIN_CHAIN" as const,
    // Demo merchants are not real NEAR accounts and 1Click rejects unknown recipients, so demo dry
    // quotes price the swap to a real system account; the stored request is relabelled below. No funds move.
    recipient: config.mode === "demo" ? "intents.near" : p.recipient,
    recipientType: "DESTINATION_CHAIN" as const,
    deadline: deadline.toISOString(),
    referral: "anytill",
  };
  let res: QuoteResponse & { source: string };
  const midP = fetchMid(asset, config.quoteSource);
  try {
    res = await oneClick().quote(req);
  } catch (e) {
    const offline = !(e instanceof OneClickError) || e.httpStatus >= 500;
    if (config.mode === "demo" && offline) {
      res = { ...recordedQuote(req), source: "recorded" };
    } else if (e instanceof OneClickError) {
      throw new PaymentError(friendlyQuoteError(e.message), "quote_failed", 502);
    } else {
      throw new PaymentError("Could not reach the quote service. Try again in a moment.", "quote_unreachable", 502);
    }
  }
  if (config.mode === "demo") res.quoteRequest = { ...res.quoteRequest, recipient: p.recipient };

  // Sanity-check the response before showing it to a buyer.
  if (res.quote.amountOut !== amountOut && BigInt(res.quote.amountOut) < BigInt(amountOut)) {
    throw new PaymentError("The quote did not cover the full order amount.", "quote_short", 502);
  }

  let depositAddress = res.quote.depositAddress;
  if (config.mode === "demo") {
    // dry:true quotes carry no deposit address. Use an obviously fake one so no real funds can ever be sent.
    depositAddress = `DEMO-${createHash("sha256").update(p.id + asset.assetId).digest("hex").slice(0, 24)}`;
  }
  if (!depositAddress) throw new PaymentError("1Click returned no deposit address.", "no_deposit_address", 502);
  const signature = config.mode === "demo" ? `demo:${res.signature}` : res.signature;

  const updated = await prisma.payment.update({
    where: { id: p.id },
    data: {
      status: "quoted",
      originAsset: asset.assetId,
      originSymbol: asset.symbol,
      originChain: asset.chain,
      refundTo,
      depositAddress,
      depositMemo: res.quote.depositMemo ?? null,
      amountIn: res.quote.amountIn,
      amountInDisplay: res.quote.amountInFormatted,
      minAmountIn: res.quote.minAmountIn,
      amountOutAtomic: amountOut,
      quoteSignature: signature,
      quoteJson: JSON.stringify({ ...res, quote: { ...res.quote, depositAddress } }),
      quoteSource: res.source,
      midJson: JSON.stringify((await midP) ?? null),
      deadline,
      timeEstimateSec: res.quote.timeEstimate,
      depositSeenAt: null,
      lastStatusJson: null,
      verificationJson: null,
    },
  });
  await log(p.id, "quoted", `${res.quote.amountInFormatted} ${asset.symbol} on ${CHAINS[asset.chain].name} → exactly ${formatAtomic(amountOut, 6)} USDC (${res.source} quote)`);
  return updated;
}

function friendlyQuoteError(msg: string): string {
  if (/minimum swap amount/i.test(msg)) return `This asset has a minimum: ${msg.replace(/^.*?:\s*/, "")}. Pick another asset.`;
  if (/liquidity/i.test(msg)) return "No route for that asset right now. Pick another asset or try again in a minute.";
  if (/refundTo/i.test(msg)) return "1Click rejected the refund address. Double-check it.";
  return `Quote failed: ${msg}`;
}

// ───────────────────────── deposits ─────────────────────────

export async function submitDepositTx(paymentId: string, txHash: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p?.depositAddress) throw new PaymentError("No quote for this payment yet.", "no_quote");
  if (config.mode === "live") {
    await oneClick().submitDeposit(txHash, p.depositAddress).catch(() => undefined);
  }
  await log(p.id, "deposit_tx", `buyer reported tx ${txHash}`);
}

/** Demo only: pretend the buyer's deposit landed. The swap then "settles" after DEMO_SETTLE_MS. */
export async function simulateDeposit(paymentId: string) {
  if (config.mode !== "demo") throw new PaymentError("Simulated deposits exist only in demo mode.", "not_demo", 403);
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "quoted") throw new PaymentError("Get a quote first.", "no_quote");
  await prisma.payment.update({ where: { id: p.id }, data: { status: "deposit_seen", depositSeenAt: new Date() } });
  await log(p.id, "deposit_seen", `simulated deposit of ${p.amountInDisplay} ${p.originSymbol} (demo)`);
}

function demoTxHash(paymentId: string) {
  return "DEMO" + createHash("sha256").update("near-tx" + paymentId).digest("hex").slice(0, 40);
}

function demoStatus(p: Payment): StatusResponse {
  const qr = JSON.parse(p.quoteJson!) as QuoteResponse;
  const elapsed = p.depositSeenAt ? Date.now() - p.depositSeenAt.getTime() : -1;
  const settle = config.demoSettleMs;
  const status = elapsed < 0 ? "PENDING_DEPOSIT" : elapsed < settle * 0.3 ? "KNOWN_DEPOSIT_TX" : elapsed < settle ? "PROCESSING" : "SUCCESS";
  const tx = demoTxHash(p.id);
  return {
    correlationId: "demo",
    quoteResponse: { ...qr, signature: p.quoteSignature! },
    status,
    updatedAt: new Date().toISOString(),
    swapDetails: {
      intentHashes: [],
      nearTxHashes: status === "SUCCESS" ? [tx] : [],
      amountIn: p.amountIn ?? undefined,
      amountOut: status === "SUCCESS" ? p.amountOutAtomic! : undefined,
      originChainTxHashes: [],
      destinationChainTxHashes: status === "SUCCESS" ? [{ hash: tx, explorerUrl: "" }] : [],
    },
  };
}

// ───────────────────────── poll + verify + mark paid ─────────────────────────

const inflight = new Map<string, Promise<Payment>>();

export function refreshPayment(paymentId: string): Promise<Payment> {
  const running = inflight.get(paymentId);
  if (running) return running;
  const job = doRefresh(paymentId).finally(() => inflight.delete(paymentId));
  inflight.set(paymentId, job);
  return job;
}

async function doRefresh(paymentId: string): Promise<Payment> {
  let p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new PaymentError("Payment not found.", "not_found", 404);
  if (TERMINAL.includes(p.status) || p.status === "created" || p.status === "expired" || !p.depositAddress) return p;

  let st: StatusResponse;
  if (config.mode === "demo") {
    st = demoStatus(p);
  } else {
    try {
      st = await oneClick().status(p.depositAddress, p.depositMemo ?? undefined);
    } catch {
      return p; // transient; the next poll retries
    }
  }

  if (st.status === "SUCCESS" && !p.swapDoneAt) {
    p = await prisma.payment.update({ where: { id: p.id }, data: { swapDoneAt: new Date() } });
  }

  const next = mapStatus(st.status);
  if (st.status === "PENDING_DEPOSIT" && p.deadline && p.deadline.getTime() < Date.now()) {
    p = await prisma.payment.update({ where: { id: p.id }, data: { status: "expired", lastStatusJson: JSON.stringify(st) } });
    await log(p.id, "expired", "quote deadline passed with no deposit; buyer can get a fresh quote");
    return p;
  }

  if (st.status !== "SUCCESS") {
    if (next !== p.status) {
      p = await prisma.payment.update({
        where: { id: p.id },
        data: { status: next, lastStatusJson: JSON.stringify(st), depositSeenAt: p.depositSeenAt ?? (next !== "quoted" ? new Date() : null) },
      });
      const extra = st.status === "REFUNDED" ? ` · ${st.swapDetails.refundedAmountFormatted ?? ""} returned to ${p.refundTo} (${st.swapDetails.refundReason ?? "1Click refund"})` : "";
      await log(p.id, next, `1Click status ${st.status}${extra}`);
    }
    return p;
  }

  // SUCCESS: verify independently before touching the order.
  const issued = {
    depositAddress: p.depositAddress,
    depositMemo: p.depositMemo,
    signature: p.quoteSignature!,
    recipient: p.recipient,
    amountOutAtomic: p.amountOutAtomic!,
    originAsset: p.originAsset!,
  };
  const reader = config.mode === "demo"
    ? demoChainReader([{ txHash: demoTxHash(p.id), contract: USDC_NEAR.contract, oldOwner: "intents.near", newOwner: p.recipient, amount: p.amountOutAtomic! }])
    : nearChainReader(config.nearRpc);
  const v = await verifySettlement(issued, st, reader);

  if (!v.ok) {
    const quoteMismatch = v.checks.some((c) => c.id !== "onchain" && !c.ok);
    p = await prisma.payment.update({
      where: { id: p.id },
      data: { status: quoteMismatch ? "needs_review" : "verifying", verificationJson: JSON.stringify(v), lastStatusJson: JSON.stringify(st) },
    });
    if (quoteMismatch) await log(p.id, "needs_review", `settlement did not match the issued quote: ${v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")}`);
    return p;
  }

  return markPaid(p, v, st);
}

async function markPaid(p: Payment, v: Verification, st: StatusResponse): Promise<Payment> {
  // Re-read the order right before marking it: if it changed since the quote, a human decides.
  const order = await ordersFor(p.shop).getOrder(p.shop, p.orderRef);
  if (!order || order.cancelled || order.outstandingCents !== p.amountCents) {
    const why = !order ? "order missing" : order.cancelled ? "order cancelled" : `order now owes ${formatUsd(order.outstandingCents)}, quote was for ${formatUsd(p.amountCents)}`;
    const u = await prisma.payment.update({ where: { id: p.id }, data: { status: "needs_review", verificationJson: JSON.stringify(v), settledAt: new Date() } });
    await log(p.id, "needs_review", `USDC settled but not marking paid: ${why}. Refund from the admin if needed.`);
    return u;
  }

  // Idempotent claim: exactly one caller wins.
  const claim = await prisma.payment.updateMany({ where: { id: p.id, markedPaidAt: null }, data: { markedPaidAt: new Date() } });
  if (claim.count === 0) return (await prisma.payment.findUnique({ where: { id: p.id } }))!;

  try {
    await ordersFor(p.shop).markPaid(p.shop, p.orderRef, { paymentId: p.id, proofTx: v.proofTx });
  } catch (e) {
    await prisma.payment.update({ where: { id: p.id }, data: { markedPaidAt: null } });
    await log(p.id, "mark_paid_failed", (e as Error).message);
    throw e;
  }
  const settledAt = new Date();
  const u = await prisma.payment.update({
    where: { id: p.id },
    data: { status: "paid", settledAt, verificationJson: JSON.stringify(v), lastStatusJson: JSON.stringify(st) },
  });
  const secs = p.depositSeenAt ? Math.round((settledAt.getTime() - p.depositSeenAt.getTime()) / 1000) : null;
  await log(p.id, "verified", `${v.checks.length}/${v.checks.length} checks passed${config.mode === "demo" ? " (demo: simulated NEAR receipt)" : ""}; proof tx ${v.proofTx}`);
  await log(p.id, "paid", `${p.orderName} marked paid${config.mode === "demo" || p.shop.startsWith("site:") ? "" : " in Shopify (orderMarkAsPaid)"}${secs !== null ? ` · settled ${secs}s after deposit` : ""}`);
  return u;
}

function mapStatus(s: StatusResponse["status"]): string {
  switch (s) {
    case "PENDING_DEPOSIT": return "quoted";
    case "KNOWN_DEPOSIT_TX": return "deposit_seen";
    case "INCOMPLETE_DEPOSIT":
    case "PROCESSING": return "processing";
    case "SUCCESS": return "verifying";
    case "REFUNDED": return "refunded";
    case "FAILED": return "failed";
  }
}

// ───────────────────────── merchant refunds ─────────────────────────

/** Build a refund: a 1Click quote that turns the merchant's USDC back into the buyer's original asset at their refund address. */
export async function createRefund(paymentId: string, shop: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, shop } });
  if (!p) throw new PaymentError("Payment not found.", "not_found", 404);
  if (!["paid", "needs_review"].includes(p.status) || !p.originAsset || !p.refundTo) throw new PaymentError("Only settled payments can be refunded.", "not_settled");
  const deadline = new Date(Date.now() + 60 * 60_000);
  const req = {
    dry: config.mode !== "live",
    swapType: "EXACT_INPUT" as const,
    slippageTolerance: 100,
    originAsset: USDC_NEAR.assetId,
    depositType: "ORIGIN_CHAIN" as const,
    destinationAsset: p.originAsset,
    amount: p.amountOutAtomic!,
    refundTo: p.recipient,
    refundType: "ORIGIN_CHAIN" as const,
    recipient: p.refundTo,
    recipientType: "DESTINATION_CHAIN" as const,
    deadline: deadline.toISOString(),
  };
  let res: QuoteResponse;
  try {
    res = await oneClick().quote(req);
  } catch (e) {
    if (config.mode !== "demo") throw new PaymentError(`Refund quote failed: ${(e as Error).message}`, "refund_quote", 502);
    res = { correlationId: "demo", timestamp: new Date().toISOString(), signature: "demo", quoteRequest: req, quote: { amountIn: req.amount, amountInFormatted: formatAtomic(req.amount, 6), amountInUsd: "", minAmountIn: req.amount, amountOut: p.amountIn ?? "0", amountOutFormatted: p.amountInDisplay ?? "", amountOutUsd: "", minAmountOut: "0", timeEstimate: 30 } };
  }
  const depositAddress = res.quote.depositAddress ?? `DEMO-refund-${p.id.slice(-8)}`;
  const usdc = formatAtomic(p.amountOutAtomic!, 6);
  const refund = {
    depositAddress,
    sendUsdc: usdc,
    buyerGets: `${res.quote.amountOutFormatted} ${p.originSymbol}`,
    to: p.refundTo,
    deadline: deadline.toISOString(),
    demo: config.mode === "demo",
    nearCli: `near tokens ${p.recipient} send-ft ${USDC_NEAR.contract} ${depositAddress} amount-ft '${usdc} USDC' memo '' network-config mainnet sign-with-keychain send`,
  };
  await prisma.payment.update({ where: { id: p.id }, data: { refundJson: JSON.stringify(refund) } });
  await log(p.id, "refund_quoted", `send ${usdc} USDC to ${depositAddress} → buyer receives ~${refund.buyerGets} at ${p.refundTo}${refund.demo ? " (demo)" : ""}`);
  return refund;
}

// ───────────────────────── views ─────────────────────────

export async function publicView(p: Payment) {
  const merchant = await prisma.merchant.findUnique({ where: { shop: p.shop } });
  const asset = p.originAsset ? findAsset(p.originAsset) : undefined;
  const v = p.verificationJson ? (JSON.parse(p.verificationJson) as Verification) : null;
  const st = p.lastStatusJson ? (JSON.parse(p.lastStatusJson) as StatusResponse) : null;
  const settledIn = p.settledAt && p.depositSeenAt ? Math.max(1, Math.round((p.settledAt.getTime() - p.depositSeenAt.getTime()) / 1000)) : null;
  return {
    id: p.id,
    mode: config.mode,
    merchant: { name: merchant?.displayName ?? p.shop, account: p.recipient },
    order: { name: p.orderName, amountCents: p.amountCents, amount: formatUsd(p.amountCents) },
    status: p.status,
    quote: p.depositAddress && asset
      ? {
          source: p.quoteSource,
          originAsset: asset.assetId,
          symbol: asset.symbol,
          chain: asset.chain,
          chainName: CHAINS[asset.chain].name,
          decimals: asset.decimals,
          tokenAddress: asset.tokenAddress ?? null,
          evmChainId: CHAINS[asset.chain].evmChainId ?? null,
          amountIn: p.amountIn,
          amountInDisplay: p.amountInDisplay,
          depositAddress: p.depositAddress,
          depositMemo: p.depositMemo,
          refundTo: p.refundTo,
          deadline: p.deadline?.toISOString() ?? null,
          timeEstimateSec: p.timeEstimateSec,
        }
      : null,
    refunded: p.status === "refunded" ? { amount: st?.swapDetails.refundedAmountFormatted ?? null, reason: st?.swapDetails.refundReason ?? null, to: p.refundTo } : null,
    settledInSec: settledIn,
    stages: stagesOf(p),
    receiptUrl: `/r/${p.id}`,
    proofTx: v?.proofTx ?? null,
    checks: v?.checks ?? null,
  };
}

export async function getPayment(id: string) {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) throw new PaymentError("Payment not found.", "not_found", 404);
  return p;
}

// ───────────────────────── background poller (live mode) ─────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var anytillPoller: NodeJS.Timeout | undefined;
}

export function startPoller() {
  if (globalThis.anytillPoller || config.mode !== "live") return;
  globalThis.anytillPoller = setInterval(async () => {
    const open = await prisma.payment.findMany({ where: { status: { in: ["quoted", "deposit_seen", "processing", "verifying"] } }, select: { id: true }, take: 50 });
    for (const { id } of open) await refreshPayment(id).catch(() => undefined);
  }, 10_000);
  globalThis.anytillPoller.unref?.();
}

// ───────────────────────── money states + receipts ─────────────────────────

export function stagesOf(p: Payment) {
  return [
    { id: "pending", label: "Pending", detail: "Deposit seen, swap in progress", at: p.depositSeenAt?.toISOString() ?? null },
    { id: "settled", label: "Settled", detail: "1Click swap complete", at: p.swapDoneAt?.toISOString() ?? null },
    { id: "paid_out", label: "Paid out", detail: "USDC verified in the merchant's NEAR account, order marked paid", at: p.status === "paid" ? p.settledAt?.toISOString() ?? null : null },
  ];
}

export async function receiptOf(p: Payment) {
  const merchant = await prisma.merchant.findUnique({ where: { shop: p.shop } });
  const asset = p.originAsset ? findAsset(p.originAsset) : undefined;
  const st = p.lastStatusJson ? (JSON.parse(p.lastStatusJson) as StatusResponse) : null;
  const mid = p.midJson ? (JSON.parse(p.midJson) as MidSnapshot | null) : null;
  const v = p.verificationJson ? (JSON.parse(p.verificationJson) as Verification) : null;
  // Prefer the amount 1Click actually swapped; fall back to the quoted amount (includes the slippage buffer).
  const actualIn = st?.swapDetails?.amountIn && p.status === "paid" && config.mode === "live" ? st.swapDetails.amountIn : null;
  const amountIn = actualIn ?? p.amountIn;
  const spread = asset && amountIn && p.amountOutAtomic && mid ? computeSpread(amountIn, asset.decimals, p.amountOutAtomic, mid) : null;
  return {
    id: p.id,
    mode: config.mode,
    status: p.status,
    merchant: merchant?.displayName ?? p.shop,
    recipient: p.recipient,
    order: p.orderName,
    orderAmount: formatUsd(p.amountCents),
    paid: asset && amountIn ? { amount: formatAtomic(amountIn, asset.decimals, 9), symbol: asset.symbol, chain: CHAINS[asset.chain].name, basis: actualIn ? "settled amount reported by 1Click" : "quoted amount (includes the slippage buffer; any excess is refunded by 1Click)" } : null,
    received: p.amountOutAtomic ? { amount: formatAtomic(p.amountOutAtomic, 6), symbol: "USDC", chain: "NEAR" } : null,
    spread: spread && mid ? { ...spread, source: mid.source, at: mid.at, assetUsd: mid.assetUsd, usdcUsd: mid.usdcUsd } : null,
    stages: stagesOf(p),
    proofTx: v?.proofTx ?? null,
    checksPassed: v ? `${v.checks.filter((c) => c.ok).length}/${v.checks.length}` : null,
    quoteSource: p.quoteSource,
  };
}
