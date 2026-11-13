import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import site from "../styles/site.css?url";
import { Logo } from "../components/Logo";
import { getPayment, receiptOf } from "../lib/payments.server";

// Public, shareable receipt. Holds no refund address or other buyer details.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: site }];
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `Receipt ${data.order} · ${data.merchant}` : "Receipt" },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const p = await getPayment(params.id!).catch(() => null);
  if (!p) throw new Response("Receipt not found", { status: 404 });
  return receiptOf(p);
};

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "–");

export default function Receipt() {
  const r = useLoaderData<typeof loader>();
  const done = r.status === "paid";
  return (
    <main className="receipt-page">
      <div className="receipt">
        <header className="receipt-head">
          <Logo />
          <span className={`stamp ${done ? "ok" : ""}`}>{done ? "Paid" : r.status.replace(/_/g, " ")}</span>
        </header>
        {r.mode === "demo" ? <p className="receipt-demo" role="note">Demo receipt: real 1Click price, simulated deposit and payout. No funds moved.</p> : null}
        <h1>{r.merchant}</h1>
        <p className="receipt-sub">Order {r.order} · {r.orderAmount}</p>

        <dl className="receipt-lines" data-testid="receipt-lines">
          <div><dt>Buyer paid</dt><dd>{r.paid ? <><b>{r.paid.amount} {r.paid.symbol}</b> on {r.paid.chain}<small>{r.paid.basis}</small></> : "–"}</dd></div>
          <div><dt>Merchant received</dt><dd>{r.received ? <><b>{r.received.amount} {r.received.symbol}</b> on {r.received.chain} · {r.recipient}</> : "–"}</dd></div>
          <div>
            <dt>Spread vs mid-market</dt>
            <dd data-testid="spread">
              {r.spread ? (
                <>
                  <b>{r.spread.bps} bps</b> (${r.spread.paidUsd.toFixed(2)} sent vs ${r.spread.receivedUsd.toFixed(2)} received)
                  <small>Mid-market: {r.paid?.symbol} ${r.spread.assetUsd} and USDC ${r.spread.usdcUsd}, from {r.spread.source}, {fmtTime(r.spread.at)}. Includes 1Click fees and the slippage buffer.</small>
                </>
              ) : "Not available: no reference price was captured for this asset at quote time."}
            </dd>
          </div>
        </dl>

        <ol className="stages" aria-label="Money states">
          {r.stages.map((s) => (
            <li key={s.id} className={s.at ? "done" : ""}>
              <span className="dot" aria-hidden="true" />
              <b>{s.label}</b>
              <time dateTime={s.at ?? undefined}>{fmtTime(s.at)}</time>
              <small>{s.detail}</small>
            </li>
          ))}
        </ol>

        <p className="receipt-foot">
          {r.checksPassed ? <>Server-side checks passed: {r.checksPassed}. </> : null}
          {r.proofTx ? (r.mode === "demo" ? <>Simulated NEAR receipt <code>{r.proofTx.slice(0, 18)}…</code></> : <a href={`https://nearblocks.io/txns/${r.proofTx}`}>USDC transfer on NEAR</a>) : null}
          <br />
          {r.anchor ? (
            <>Receipt hash anchored on NEAR {r.anchor.network}: <a href={r.anchor.explorer} data-testid="anchor-tx">{r.anchor.txHash.slice(0, 12)}…</a> · </>
          ) : done ? <>Not anchored on chain yet · </> : null}
          <a href={`/verify?id=${r.id}`}>Verify this receipt</a>
          <br />Receipt {r.id} · settled through NEAR Intents 1Click
        </p>
      </div>
    </main>
  );
}
