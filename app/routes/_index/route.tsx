import { useEffect, useRef, useState } from "react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import site from "../../styles/site.css?url";
import { CHAIN_MARKS, Logo } from "../../components/Logo";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: site }];
export const meta: MetaFunction = () => [
  { title: "Anytill · Take crypto from any chain. Get USDC." },
  { name: "description", content: "A Shopify app and one-script-tag checkout. Buyers pay with any crypto; you receive an exact USDC amount on NEAR, verified before the order is marked paid." },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Shopify sends merchants here with ?shop= after install.
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return null;
};

const SCENES = [
  {
    id: "choose",
    eyebrow: "1 · Choose",
    title: "Your buyer pays with whatever they hold.",
    body: "USDC on Base, ETH on Arbitrum, SOL, BTC, NEAR. The card lists eleven assets on six chains and asks for one thing: where to send funds back if anything goes wrong.",
    ticks: ["No account, no sign-up for the buyer", "A refund address is required before any quote", "Pay from a connected EVM wallet, or by QR from any wallet"],
    label: "Choose an asset",
  },
  {
    id: "quote",
    eyebrow: "2 · Quote",
    title: "An exact USDC amount, priced live.",
    body: "The server asks NEAR Intents 1Click for an EXACT_OUTPUT quote: the store receives exactly the order total in USDC, and the buyer sees exactly what to send. Slippage sits on the buyer's side and any excess is returned.",
    ticks: ["Quote signed by 1Click and stored with the order", "Deposit address unique to this order", "Quote holds for 30 minutes, then refreshes"],
    label: "Live quote",
  },
  {
    id: "paying",
    eyebrow: "3 · Settle",
    title: "Solvers swap it. NEAR settles it.",
    body: "The deposit is swapped through the NEAR Intents verifier and paid out as USDC to the store's own NEAR account. No custodian, and no contract of ours in the money path.",
    ticks: ["Funds go straight to the merchant's account", "Short or late deposits are refunded by 1Click automatically", "The buyer can close the tab: the server finishes the job"],
    label: "Settling",
  },
  {
    id: "settled",
    eyebrow: "4 · Verified",
    title: "Marked paid only after eight checks pass.",
    body: "Before the order is marked paid in Shopify, the server checks that 1Click's status matches the quote it issued, then reads the NEAR receipt to confirm the USDC reached the merchant. The browser is never trusted.",
    ticks: ["Signature, deposit address, recipient, asset and amount must match", "The USDC transfer is read from NEAR itself", "Order re-read before marking paid; mismatches go to review"],
    label: "Paid and verified",
  },
] as const;

export default function Landing() {
  const [scene, setScene] = useState<string>("choose");
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setScene((e.target as HTMLElement).dataset.scene!);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const current = SCENES.find((s) => s.id === scene) ?? SCENES[0];

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="hero">
        <div className="band" aria-hidden="true" />
        <div className="wrap">
          <nav className="nav" aria-label="Main">
            <Logo />
            <ul>
              <li><a href="#how">How it works</a></li>
              <li><a href="#protections">Protections</a></li>
              <li><a href="#developers">Developers</a></li>
            </ul>
            <a className="pillbtn" href="/demo">Try the demo store</a>
          </nav>
          <div className="grid">
            <main id="main">
              <section className="hero-copy">
                <span className="eyebrow">Checkout for Shopify and any site</span>
                <h1>Take crypto from any chain. Get USDC.</h1>
                <p className="lede">One Shopify app or one script tag. Your buyer pays with whatever they hold; you receive the exact order total in USDC on NEAR.</p>
                <div className="ctas">
                  <a className="pillbtn" href="/auth/login">Add to Shopify</a>
                  <a className="textbtn" href="/demo">See it live <span aria-hidden="true">→</span></a>
                </div>
                <div className="marks" aria-label="Chains buyers can pay from">
                  {CHAIN_MARKS.map(([n, c]) => (
                    <span key={n}><i style={{ background: c }} />{n}</span>
                  ))}
                </div>
              </section>

              <div className="steps" id="how">
                {SCENES.map((s, i) => (
                  <section key={s.id} className="step" data-scene={s.id} ref={(el) => { refs.current[i] = el; }} aria-labelledby={`h-${s.id}`}>
                    <span className="eyebrow">{s.eyebrow}</span>
                    <h2 id={`h-${s.id}`}>{s.title}</h2>
                    <p>{s.body}</p>
                    <ul className="ticks">{s.ticks.map((t) => <li key={t}>{t}</li>)}</ul>
                    <div className="inline-card"><intents-checkout preview={s.id} /></div>
                  </section>
                ))}
              </div>
            </main>
            <aside className="rail" aria-label="Live checkout preview">
              <div className="sticky">
                <div className="frame">
                  <div className="frame-bar" aria-hidden="true"><i /><i /><i /><span>lagos-leather.shop/checkout</span></div>
                  <intents-checkout preview={scene} />
                </div>
                <p className="scene-label" aria-live="polite">{current.label} · demo preview, no network</p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <section className="sec panel" id="protections" aria-labelledby="h-prot">
        <div className="wrap">
          <span className="eyebrow">Merchant protections</span>
          <h2 id="h-prot">Built for the store, not just the buyer.</h2>
          <p>Cross-chain payments fail in quiet ways: a short deposit, a swapped recipient, a page that says "paid" when nothing arrived. Every one of these is handled on the server.</p>
          <div className="cols">
            <div><span className="num">Caps</span><h3>Per-order and 24-hour limits</h3><p>Set a ceiling per order ($500 by default) and per day. Orders above it never get a quote, so exposure stays bounded while you try crypto.</p></div>
            <div><span className="num">Verification</span><h3>Settlement checked twice</h3><p>1Click's status must match the signed quote we stored, and the NEAR receipt must show the USDC reaching your account. Only then is the order marked paid.</p></div>
            <div><span className="num">Refunds</span><h3>A refund path for every case</h3><p>Short, late or failed deposits go back to the buyer's refund address automatically. For returns, the admin builds a 1Click quote that turns your USDC back into the buyer's coin.</p></div>
          </div>
          <table className="facts">
            <tbody>
              <tr><th scope="row">Amount source</th><td>Read from the Shopify order on the server. The browser never sets the price.</td></tr>
              <tr><th scope="row">Payout account</th><td>Snapshotted when the quote is issued. Later settings changes cannot redirect a payment in flight.</td></tr>
              <tr><th scope="row">Account check</th><td>Your NEAR account must exist and be registered with the USDC contract before you can switch payments on.</td></tr>
              <tr><th scope="row">Double marking</th><td>An atomic claim makes "mark paid" happen once, however many pollers race.</td></tr>
              <tr><th scope="row">Order changed</th><td>If the order total or status changed since the quote, the payment goes to review instead of being marked paid.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec" id="developers" aria-labelledby="h-dev">
        <div className="wrap">
          <span className="eyebrow">Not on Shopify?</span>
          <h2 id="h-dev">One script tag. A web component that fits any store.</h2>
          <p>{"<intents-checkout>"} is a Lit web component in Shadow DOM: no framework, no style leaks. It inherits your font and takes your colours through CSS variables.</p>
          <pre className="code" aria-label="Embed code"><code>
            <span className="t">{"<script"}</span> <span className="a">src</span>=<span className="s">"https://your-anytill-host/widget/anytill.js"</span>{"\n        "}<span className="a">data-merchant</span>=<span className="s">"you.near"</span> <span className="a">data-amount</span>=<span className="s">"48.00"</span> <span className="a">data-order-ref</span>=<span className="s">"A-1001"</span><span className="t">{"></script>"}</span>{"\n\n"}
            <span className="t">{"<style>"}</span>{" intents-checkout { --anytill-accent: #0F9D7A; --anytill-radius: 10px; } "}<span className="t">{"</style>"}</span>
          </code></pre>
        </div>
      </section>

      <footer className="site">
        <div className="wrap">
          <span>Anytill · MIT licensed · settles through NEAR Intents 1Click</span>
          <span><a href="/demo">Demo store</a> · <a href="/auth/login">Install on Shopify</a></span>
        </div>
      </footer>
      <script type="module" src="/widget/anytill.js" />
    </>
  );
}
