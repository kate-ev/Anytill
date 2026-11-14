import { useEffect } from "react";
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import prisma, { ephemeralStore } from "../db.server";
import site from "../styles/site.css?url";
import { Logo } from "../components/Logo";
import { DEMO_SHOP, config } from "../lib/config.server";
import { DEMO_PRODUCTS, createDemoOrder, ensureDemoMerchant } from "../lib/demo.server";
import { PaymentError, createSitePayment } from "../lib/payments.server";
import { formatUsd } from "../lib/assets";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: site }];
export const meta: MetaFunction = () => [{ title: "Demo store · Anytill" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const merchant = await ensureDemoMerchant();
  const paymentId = new URL(request.url).searchParams.get("payment");
  const events = await prisma.paymentEvent.findMany({
    where: { payment: { shop: DEMO_SHOP } },
    orderBy: { id: "desc" },
    take: 14,
    include: { payment: { select: { orderName: true } } },
  });
  return {
    paymentId,
    ephemeral: ephemeralStore,
    mode: config.mode,
    source: config.quoteSource,
    cap: formatUsd(merchant.perOrderCapCents),
    products: DEMO_PRODUCTS.map((p) => ({ ...p, price: formatUsd(p.cents) })),
    events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), kind: e.kind, detail: e.detail, order: e.payment.orderName })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  try {
    const order = await createDemoOrder(String(form.get("product")));
    const p = await createSitePayment({ site: DEMO_SHOP, amountCents: order.cents, orderRef: order.ref, orderName: order.name });
    return redirect(`/demo?payment=${p.id}`);
  } catch (e) {
    if (e instanceof PaymentError) return { error: e.message, product: String(form.get("product")) };
    throw e;
  }
};

export default function DemoStore() {
  const { paymentId, products, events, cap, source, ephemeral } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const onStatus = () => revalidate();
    document.addEventListener("anytill:status", onStatus);
    return () => document.removeEventListener("anytill:status", onStatus);
  }, [revalidate]);

  return (
    <>
      <div className="demo-banner" role="note">
        Demo store. Prices come from {source === "recorded" ? "1Click quotes recorded from the live API" : "live 1Click dry-run quotes"}; deposits are simulated and no funds move.{ephemeral ? " This hosted demo keeps data in temporary serverless storage, so orders and receipts reset." : ""}
      </div>
      <div className="store-top">
        <div className="wrap nav">
          <Logo />
          <span style={{ fontWeight: 600 }}>Lagos Leather Co.</span>
        </div>
      </div>
      <main className="wrap store" id="main">
        <section aria-labelledby="h-shop">
          <h1 id="h-shop" style={{ fontSize: 34, maxWidth: "none", marginBottom: 8 }}>Shop</h1>
          <p style={{ color: "var(--slate)", marginTop: 0 }}>Pick an item to check out with any crypto. Orders above {cap} hit this store's per-order cap.</p>
          <div className="products">
            {products.map((p) => (
              <article className="product" key={p.id}>
                <div className="swatch" style={{ background: p.tone }} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></svg>
                </div>
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.detail}</p>
                </div>
                <Form method="post">
                  <span className="price">{p.price}</span>
                  <input type="hidden" name="product" value={p.id} />
                  <button className="pillbtn" type="submit" disabled={nav.state !== "idle"} data-testid={`buy-${p.id}`}>
                    {nav.state !== "idle" && nav.formData?.get("product") === p.id ? "Creating order…" : "Buy with crypto"}
                  </button>
                </Form>
              </article>
            ))}
          </div>

          <section className="ledger" aria-labelledby="h-ledger">
            <h2 id="h-ledger">Merchant ledger</h2>
            <p style={{ color: "var(--slate)", margin: 0, fontSize: 15 }}>What the store's server did, newest first. This is the same log the Shopify admin shows.</p>
            {events.length === 0 ? (
              <p className="empty" style={{ marginTop: 14 }}>No payments yet. Buy something to see each step land here.</p>
            ) : (
              <ol data-testid="ledger">
                {events.map((e) => (
                  <li key={e.id}>
                    <time dateTime={e.at}>{new Date(e.at).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC</time>
                    <b>{e.order} · {e.kind.replace(/_/g, " ")}</b>
                    <span>{e.detail}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>

        <section className="checkout-col" aria-labelledby="h-co">
          <h2 id="h-co">Checkout</h2>
          {actionData?.error ? (
            <div className="err-box" role="alert" data-testid="order-error">{actionData.error}</div>
          ) : paymentId ? (
            <intents-checkout key={paymentId} payment-id={paymentId} />
          ) : (
            <div className="empty">Your cart is empty. Choose an item to see the checkout.</div>
          )}
        </section>
      </main>
      <script type="module" src="/widget/anytill.js" />
    </>
  );
}
