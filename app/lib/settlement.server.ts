// Server-side settlement verification. An order is marked paid ONLY when every check passes.
// Nothing the buyer's browser says is trusted: the inputs are (a) what we stored when we issued
// the quote, (b) 1Click's status for that deposit address, and (c) the NEAR chain itself.

import { USDC_NEAR } from "./assets";
import type { StatusResponse } from "./oneclick.server";

export interface IssuedQuote {
  depositAddress: string;
  depositMemo?: string | null;
  signature: string;
  recipient: string;
  amountOutAtomic: string;
  originAsset: string;
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Verification {
  ok: boolean;
  checks: Check[];
  /** NEAR tx hash whose receipt moved USDC to the merchant, when found. */
  proofTx?: string;
  amountReceivedAtomic?: string;
}

/** A NEP-141 ft_transfer as it appears in a NEAR receipt's EVENT_JSON log. */
export interface FtTransferEvent {
  txHash: string;
  contract: string;
  oldOwner: string;
  newOwner: string;
  amount: string;
}

export interface ChainReader {
  /** Return every NEP-141 ft_transfer event emitted while executing the given NEAR transactions. */
  ftTransfers(txHashes: string[]): Promise<FtTransferEvent[]>;
}

export function verifyQuoteMatch(issued: IssuedQuote, status: StatusResponse): Check[] {
  const qr = status.quoteResponse?.quoteRequest;
  const q = status.quoteResponse?.quote;
  return [
    {
      id: "status",
      label: "1Click reports the swap complete",
      ok: status.status === "SUCCESS",
      detail: `status = ${status.status}`,
    },
    {
      id: "signature",
      label: "Same quote we issued (1Click signature matches)",
      ok: !!status.quoteResponse?.signature && status.quoteResponse.signature === issued.signature,
      detail: shorten(status.quoteResponse?.signature),
    },
    {
      id: "deposit",
      label: "Deposit address matches this order",
      ok: q?.depositAddress === issued.depositAddress && (q?.depositMemo ?? null) === (issued.depositMemo ?? null),
      detail: shorten(q?.depositAddress),
    },
    {
      id: "recipient",
      label: "Payout goes to the merchant's NEAR account",
      ok: qr?.recipient === issued.recipient && qr?.recipientType === "DESTINATION_CHAIN",
      detail: `${qr?.recipient ?? "?"} (${qr?.recipientType ?? "?"})`,
    },
    {
      id: "asset",
      label: "Payout asset is USDC on NEAR",
      ok: qr?.destinationAsset === USDC_NEAR.assetId,
      detail: qr?.destinationAsset ?? "?",
    },
    {
      id: "exact",
      label: "Quote is EXACT_OUTPUT for the order amount",
      ok: qr?.swapType === "EXACT_OUTPUT" && qr?.amount === issued.amountOutAtomic,
      detail: `${qr?.swapType ?? "?"} ${qr?.amount ?? "?"}`,
    },
    {
      id: "amountOut",
      label: "1Click delivered at least the order amount",
      ok: safeBig(status.swapDetails?.amountOut) >= BigInt(issued.amountOutAtomic),
      detail: `${status.swapDetails?.amountOut ?? "none"} ≥ ${issued.amountOutAtomic}`,
    },
  ];
}

export async function verifySettlement(
  issued: IssuedQuote,
  status: StatusResponse,
  chain: ChainReader,
): Promise<Verification> {
  const checks = verifyQuoteMatch(issued, status);
  const quoteOk = checks.every((c) => c.ok);

  let proofTx: string | undefined;
  let received = 0n;
  const txs = uniq([
    ...(status.swapDetails?.destinationChainTxHashes ?? []).map((t) => t.hash),
    ...(status.swapDetails?.nearTxHashes ?? []),
  ]);

  if (quoteOk && txs.length) {
    try {
      const events = await chain.ftTransfers(txs);
      for (const e of events) {
        if (e.contract === USDC_NEAR.contract && e.newOwner === issued.recipient) {
          received += safeBig(e.amount);
          proofTx ??= e.txHash;
        }
      }
      checks.push({
        id: "onchain",
        label: "NEAR chain shows the USDC transfer to the merchant",
        ok: received >= BigInt(issued.amountOutAtomic),
        detail: proofTx ? `${received} atomic USDC in ${shorten(proofTx)}` : `no USDC transfer to ${issued.recipient} in ${txs.length} tx`,
      });
    } catch (err) {
      checks.push({
        id: "onchain",
        label: "NEAR chain shows the USDC transfer to the merchant",
        ok: false,
        detail: `RPC error, will retry: ${(err as Error).message}`,
      });
    }
  } else {
    checks.push({
      id: "onchain",
      label: "NEAR chain shows the USDC transfer to the merchant",
      ok: false,
      detail: quoteOk ? "1Click returned no NEAR transaction hashes yet" : "skipped: quote checks failed",
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
    proofTx,
    amountReceivedAtomic: received ? received.toString() : undefined,
  };
}

/** Parse NEP-141 ft_transfer events out of NEAR receipt outcome logs. */
export function parseFtTransferLogs(txHash: string, contract: string, logs: string[]): FtTransferEvent[] {
  const out: FtTransferEvent[] = [];
  for (const log of logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const ev = JSON.parse(log.slice("EVENT_JSON:".length));
      if (ev.standard !== "nep141" || ev.event !== "ft_transfer" || !Array.isArray(ev.data)) continue;
      for (const d of ev.data) {
        out.push({ txHash, contract, oldOwner: d.old_owner_id, newOwner: d.new_owner_id, amount: String(d.amount) });
      }
    } catch {
      /* not JSON: ignore */
    }
  }
  return out;
}

function safeBig(v: unknown): bigint {
  try {
    return typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs.filter(Boolean))];
}

export function shorten(s?: string | null, n = 10): string {
  if (!s) return "none";
  return s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s;
}
