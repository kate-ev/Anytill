import { useEffect, useState } from "react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import site from "../styles/site.css?url";
import { Logo } from "../components/Logo";
// @ts-expect-error plain ESM helper without type declarations
import { canonicalReceipt, receiptHash } from "../lib/receipt-canonical.mjs";

// Keyless receipt verification. Everything happens in the browser: fetch the receipt, hash it locally,
// read the anchor straight from the NEAR contract over public RPC, compare.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: site }];
export const meta: MetaFunction = () => [{ title: "Verify a receipt · Anytill" }];

export const loader = async ({ request }: LoaderFunctionArgs) => ({
  id: new URL(request.url).searchParams.get("id") ?? "",
  contract: process.env.ANCHOR_CONTRACT || "receipts.anytill-hk1113.testnet",
  network: process.env.ANCHOR_NETWORK || "testnet",
  rpcs: process.env.ANCHOR_RPC
    ? process.env.ANCHOR_RPC.split(",")
    : (process.env.ANCHOR_NETWORK || "testnet") === "mainnet"
      ? ["https://free.rpc.fastnear.com", "https://near.drpc.org", "https://rpc.mainnet.near.org"]
      : ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://rpc.testnet.near.org"],
});

type Result =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; verdict: "match" | "altered" | "not_anchored"; receiptId: string; local: string; onChain: { hash: string; anchored_at_ms: number; block_height: number } | null; canonical: string; tx?: string | null }
  | { kind: "error"; message: string };

async function readAnchor(rpcs: string[], contract: string, receiptId: string) {
  let last: Error | undefined;
  for (const rpc of rpcs) {
    try {
      return await readAnchorFrom(rpc, contract, receiptId);
    } catch (e) {
      last = e as Error;
    }
  }
  throw last ?? new Error("no NEAR RPC reachable");
}

async function readAnchorFrom(rpc: string, contract: string, receiptId: string) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "v", method: "query", params: { request_type: "call_function", finality: "final", account_id: contract, method_name: "get_anchor", args_base64: btoa(JSON.stringify({ receipt_id: receiptId })) } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "NEAR RPC error");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result)) || "null");
}

export default function Verify() {
  const cfg = useLoaderData<typeof loader>();
  const [input, setInput] = useState(cfg.id);
  const [r, setR] = useState<Result>({ kind: "idle" });

  async function run(value: string) {
    try {
      let receipt: Record<string, unknown>;
      const v = value.trim();
      if (v.startsWith("{")) {
        receipt = JSON.parse(v);
      } else {
        const id = v.split("/").filter(Boolean).pop()!.split("?")[0];
        setR({ kind: "working", step: "Fetching the receipt…" });
        const res = await fetch(`/api/v1/payments/${encodeURIComponent(id)}/receipt`);
        if (!res.ok) throw new Error("Receipt not found on this server. Paste the receipt JSON instead.");
        receipt = await res.json();
      }
      setR({ kind: "working", step: "Hashing it in your browser…" });
      const local: string = await receiptHash(receipt);
      setR({ kind: "working", step: `Reading the anchor from ${cfg.contract} on NEAR ${cfg.network}…` });
      const onChain = await readAnchor(cfg.rpcs, cfg.contract, String(receipt.id));
      const tx = (receipt.anchor as { txHash?: string } | null)?.txHash ?? null;
      setR({ kind: "done", verdict: !onChain ? "not_anchored" : onChain.hash === local ? "match" : "altered", receiptId: String(receipt.id), local, onChain, canonical: canonicalReceipt(receipt), tx });
    } catch (e) {
      setR({ kind: "error", message: (e as Error).message });
    }
  }

  useEffect(() => {
    if (cfg.id) void run(cfg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="receipt-page">
      <div className="receipt">
        <header className="receipt-head"><Logo /><span className="stamp">Verify</span></header>
        <h1>Was this receipt altered?</h1>
        <p className="receipt-sub">Anytill anchors the SHA-256 of every verified receipt on NEAR. This page recomputes the hash in your browser and reads the anchor from the chain. No keys, no trust in this server's answer.</p>
        <form className="verify-form" onSubmit={(e) => { e.preventDefault(); void run(input); }}>
          <label htmlFor="v-in">Receipt link, receipt id, or the receipt JSON</label>
          <textarea id="v-in" rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://…/r/cm… or {…}" spellCheck={false} />
          <button className="pillbtn" type="submit" disabled={r.kind === "working"}>{r.kind === "working" ? "Checking…" : "Verify on NEAR"}</button>
        </form>
        <div aria-live="polite">
          {r.kind === "working" ? <p className="verify-step">{r.step}</p> : null}
          {r.kind === "error" ? <p className="err-box" role="alert">{r.message}</p> : null}
          {r.kind === "done" ? (
            <div className={`verdict ${r.verdict}`} data-testid="verdict">
              <strong>
                {r.verdict === "match" ? "Matches the chain. This receipt has not been altered." : r.verdict === "altered" ? "Does NOT match the chain. This receipt was altered." : "Not anchored on chain (yet)."}
              </strong>
              <dl>
                <div><dt>Receipt</dt><dd><code>{r.receiptId}</code></dd></div>
                <div><dt>SHA-256 (your browser)</dt><dd><code>{r.local}</code></dd></div>
                <div><dt>SHA-256 (on NEAR)</dt><dd><code>{r.onChain?.hash ?? "–"}</code></dd></div>
                {r.onChain ? <div><dt>Anchored</dt><dd>block {r.onChain.block_height} · {new Date(r.onChain.anchored_at_ms).toISOString().replace("T", " ").slice(0, 19)} UTC</dd></div> : null}
                <div><dt>Contract</dt><dd><code>{cfg.contract}</code> ({cfg.network})</dd></div>
                {r.tx ? <div><dt>Anchor tx</dt><dd><a href={`https://${cfg.network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${r.tx}`}>{r.tx.slice(0, 12)}…</a></dd></div> : null}
              </dl>
              <details><summary>Exact bytes hashed</summary><pre>{r.canonical}</pre></details>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
