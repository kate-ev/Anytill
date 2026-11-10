// NEAR JSON-RPC: reads the receipts of the settlement transaction to confirm the USDC landed,
// and checks that a merchant's payout account exists and can hold USDC.

import { USDC_NEAR } from "./assets";
import { parseFtTransferLogs, type ChainReader, type FtTransferEvent } from "./settlement.server";

type FetchLike = typeof fetch;

async function rpc<T>(url: string, method: string, params: unknown, f: FetchLike = fetch): Promise<T> {
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "anytill", method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as { result?: T; error?: { message?: string; cause?: { name?: string } } };
  if (j.error) throw new Error(j.error.cause?.name || j.error.message || "NEAR RPC error");
  return j.result as T;
}

interface TxStatus {
  receipts_outcome: { outcome: { logs: string[]; executor_id: string } }[];
}

export function nearChainReader(rpcUrl: string, f?: FetchLike): ChainReader {
  return {
    async ftTransfers(txHashes) {
      const out: FtTransferEvent[] = [];
      for (const hash of txHashes) {
        // sender_account_id is required by the RPC but any value works for lookups by hash on archival-backed nodes.
        const tx = await rpc<TxStatus>(rpcUrl, "EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: "intents.near", wait_until: "FINAL" }, f);
        for (const r of tx.receipts_outcome) {
          out.push(...parseFtTransferLogs(hash, r.outcome.executor_id, r.outcome.logs));
        }
      }
      return out;
    },
  };
}

export interface AccountCheck {
  exists: boolean;
  usdcRegistered: boolean | null;
  error?: string;
}

/** Does the payout account exist, and is it registered on the USDC contract (NEP-145 storage)? */
export async function checkPayoutAccount(rpcUrl: string, accountId: string, f?: FetchLike): Promise<AccountCheck> {
  try {
    await rpc(rpcUrl, "query", { request_type: "view_account", finality: "final", account_id: accountId }, f);
  } catch (e) {
    const msg = (e as Error).message;
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(msg)) return { exists: false, usdcRegistered: null };
    return { exists: false, usdcRegistered: null, error: msg };
  }
  try {
    const r = await rpc<{ result: number[] }>(rpcUrl, "query", {
      request_type: "call_function",
      finality: "final",
      account_id: USDC_NEAR.contract,
      method_name: "storage_balance_of",
      args_base64: Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64"),
    }, f);
    const val = JSON.parse(Buffer.from(r.result).toString() || "null");
    return { exists: true, usdcRegistered: val !== null };
  } catch (e) {
    return { exists: true, usdcRegistered: null, error: (e as Error).message };
  }
}

/**
 * Demo-mode chain reader. Returns the receipt a real settlement would produce, built from the
 * simulated transfer stored on the payment. Labelled "simulated" everywhere it is shown.
 */
export function demoChainReader(transfers: FtTransferEvent[]): ChainReader {
  return { ftTransfers: async (hashes) => transfers.filter((t) => hashes.includes(t.txHash)) };
}
