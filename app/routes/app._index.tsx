import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { DEMO_SHOP, config } from "../lib/config.server";
import { ensureDemoMerchant } from "../lib/demo.server";
import { checkPayoutAccount } from "../lib/near.server";
import { PaymentError, createRefund, stagesOf } from "../lib/payments.server";
import { formatUsd, isNearAccountId } from "../lib/assets";

async function shopFor(request: Request): Promise<string> {
  if (config.mode === "demo" && !config.shopifyConfigured) {
    await ensureDemoMerchant();
    return DEMO_SHOP;
  }
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  return session.shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = await shopFor(request);
  const merchant = await prisma.merchant.findUnique({ where: { shop } });
  const selected = new URL(request.url).searchParams.get("payment");
  const payments = await prisma.payment.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 20 });
  const timeline = selected
    ? await prisma.paymentEvent.findMany({ where: { paymentId: selected, payment: { shop } }, orderBy: { id: "asc" } })
    : [];
  const paid = payments.filter((p) => p.status === "paid");
  const settleTimes = paid.filter((p) => p.settledAt && p.depositSeenAt).map((p) => (p.settledAt!.getTime() - p.depositSeenAt!.getTime()) / 1000).sort((a, b) => a - b);
  return {
    demo: config.mode === "demo",
    shop,
    merchant: merchant && {
      nearAccount: merchant.nearAccount,
      enabled: merchant.enabled,
      perOrderCap: (merchant.perOrderCapCents / 100).toFixed(2),
      dailyCap: (merchant.dailyCapCents / 100).toFixed(2),
    },
    stats: {
      paidCount: paid.length,
      volume: formatUsd(paid.reduce((s, p) => s + p.amountCents, 0)),
      medianSettle: settleTimes.length ? `${Math.round(settleTimes[Math.floor(settleTimes.length / 2)])} s` : "–",
    },
    payments: payments.map((p) => ({
      id: p.id,
      order: p.orderName,
      amount: formatUsd(p.amountCents),
      paidWith: p.amountInDisplay ? `${p.amountInDisplay} ${p.originSymbol}` : "–",
      status: p.status,
      stage: (() => {
        const reached = stagesOf(p).filter((st) => st.at);
        const last = reached[reached.length - 1];
        return last ? `${last.label} · ${new Date(last.at!).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC` : "–";
      })(),
      refund: p.refundJson ? (JSON.parse(p.refundJson) as Record<string, string | boolean>) : null,
      at: p.createdAt.toISOString(),
    })),
    selected,
    timeline: timeline.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, at: e.at.toISOString() })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shop = await shopFor(request);
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "refund") {
      await createRefund(String(form.get("paymentId")), shop);
      return { ok: "Refund quote ready. Send the USDC shown in the payments table to complete it." };
    }
    const nearAccount = String(form.get("nearAccount") ?? "").trim().toLowerCase();
    const enabled = form.get("enabled") === "on";
    const perOrderCapCents = Math.round(Number(form.get("perOrderCap")) * 100);
    const dailyCapCents = Math.round(Number(form.get("dailyCap")) * 100);
    if (!isNearAccountId(nearAccount)) return { error: "Enter a NEAR account like yourstore.near." };
    if (!(perOrderCapCents >= 100) || !(dailyCapCents >= perOrderCapCents)) return { error: "Caps must be at least $1, and the daily cap at least the per-order cap." };
    let warning: string | undefined;
    if (config.mode === "live") {
      const check = await checkPayoutAccount(config.nearRpc, nearAccount);
      if (check.error && !check.exists) return { error: `Could not check ${nearAccount} on NEAR: ${check.error}` };
      if (!check.exists) return { error: `${nearAccount} does not exist on NEAR mainnet.` };
      if (check.usdcRegistered === false && enabled) {
        return { error: `${nearAccount} is not registered with the USDC contract yet, so it cannot receive USDC. Register it once (storage_deposit on 17208628…36133a1, about 0.00125 NEAR), then turn payments on.` };
      }
    } else {
      warning = "Demo mode: the account is not checked on NEAR.";
    }
    await prisma.merchant.upsert({
      where: { shop },
      update: { nearAccount, enabled, perOrderCapCents, dailyCapCents },
      create: { shop, displayName: shop.replace(".myshopify.com", ""), nearAccount, enabled, perOrderCapCents, dailyCapCents },
    });
    return { ok: `Saved. Payments ${enabled ? "on" : "off"}; payouts go to ${nearAccount}.`, warning };
  } catch (e) {
    if (e instanceof PaymentError) return { error: e.message };
    throw e;
  }
};

const TONE: Record<string, "success" | "warning" | "critical" | "info" | "neutral"> = {
  paid: "success", needs_review: "critical", failed: "critical", refunded: "warning", expired: "neutral",
  quoted: "info", deposit_seen: "info", processing: "info", verifying: "info", created: "neutral",
};

export default function Admin() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const m = d.merchant;

  return (
    <s-page heading="Crypto checkout">
      {d.demo ? (
        <s-banner tone="warning" heading="Demo merchant">
          You are viewing the seeded demo store outside Shopify. Install the app on a store to manage a real one.
        </s-banner>
      ) : null}
      {result && "error" in result && result.error ? <s-banner tone="critical">{result.error}</s-banner> : null}
      {result && "ok" in result && result.ok ? <s-banner tone="success">{result.ok}{"warning" in result && result.warning ? ` ${result.warning}` : ""}</s-banner> : null}

      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          <s-box><s-text color="subdued">Paid orders</s-text><s-heading>{d.stats.paidCount}</s-heading></s-box>
          <s-box><s-text color="subdued">USDC received</s-text><s-heading>{d.stats.volume}</s-heading></s-box>
          <s-box><s-text color="subdued">Median settlement</s-text><s-heading>{d.stats.medianSettle}</s-heading></s-box>
        </s-grid>
      </s-section>

      <s-section heading="Payout and limits">
        <Form method="post">
          <s-stack gap="base">
            <s-text-field label="NEAR account that receives USDC" name="nearAccount" defaultValue={m?.nearAccount ?? ""} placeholder="yourstore.near" details="USDC lands here directly from NEAR Intents. Anytill never holds funds." />
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field label="Per-order cap (USD)" name="perOrderCap" defaultValue={m?.perOrderCap ?? "500.00"} min={1} step={1} />
              <s-number-field label="24-hour cap (USD)" name="dailyCap" defaultValue={m?.dailyCap ?? "5000.00"} min={1} step={1} />
            </s-grid>
            <s-checkbox label='Offer "Pay with any crypto" to buyers' name="enabled" defaultChecked={m?.enabled ?? false} />
            <s-button type="submit" variant="primary" loading={busy || undefined}>Save</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Turn it on in your store">
        <s-ordered-list>
          <s-list-item>Settings → Payments → Manual payment methods → Create custom payment method named <s-text type="strong">Pay with any crypto</s-text>.</s-list-item>
          <s-list-item>Online Store → Checkout → Customize → Thank you and Order status pages → add the <s-text type="strong">Anytill pay</s-text> block.</s-list-item>
          <s-list-item>Place a test order with that method. The buyer gets a "Pay with any crypto" button; the order is marked paid once USDC is verified on NEAR.</s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="Payments">
        {d.payments.length === 0 ? (
          <s-text color="subdued">No crypto payments yet. They appear here as soon as a buyer opens the pay page.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Amount</s-table-header>
              <s-table-header>Paid with</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Money state</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.payments.map((p) => (
                <s-table-row key={p.id}>
                  <s-table-cell><s-link href={`?payment=${p.id}`}>{p.order}</s-link></s-table-cell>
                  <s-table-cell>{p.amount}</s-table-cell>
                  <s-table-cell>{p.paidWith}</s-table-cell>
                  <s-table-cell><s-badge tone={TONE[p.status] ?? "neutral"}>{p.status.replace(/_/g, " ")}</s-badge></s-table-cell>
                  <s-table-cell>{p.stage}</s-table-cell>
                  <s-table-cell>
                    <s-link href={`/r/${p.id}`} target="_blank">Receipt</s-link>{" "}
                    {p.refund ? (
                      <s-text>Send {String(p.refund.sendUsdc)} USDC to <code>{String(p.refund.depositAddress)}</code></s-text>
                    ) : p.status === "paid" || p.status === "needs_review" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="refund" />
                        <input type="hidden" name="paymentId" value={p.id} />
                        <s-button type="submit" variant="secondary">Refund in crypto</s-button>
                      </Form>
                    ) : null}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {d.selected ? (
        <s-section heading="Proof timeline">
          <s-stack gap="small-200">
            {d.timeline.map((e) => (
              <s-text key={e.id}><s-text type="strong">{new Date(e.at).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC · {e.kind.replace(/_/g, " ")}</s-text> {e.detail}</s-text>
            ))}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
