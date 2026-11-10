import type { ActionFunctionArgs } from "react-router";
import { body, handle, preflight } from "../lib/http.server";
import { PaymentError, createSitePayment, publicView } from "../lib/payments.server";
import { isNearAccountId } from "../lib/assets";

// Script-tag sites: <intents-checkout merchant="you.near" amount="48.00" order-ref="..."> creates a payment here.
export const loader = ({ request }: { request: Request }) => preflight(request) ?? new Response("Method not allowed", { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) =>
  preflight(request) ??
  handle(async () => {
    const b = await body(request);
    const merchant = String(b.merchant ?? "");
    const site = merchant.startsWith("demo") ? "demo.anytill.local" : `site:${merchant}`;
    if (!site.startsWith("demo") && !isNearAccountId(merchant)) throw new PaymentError("merchant must be a NEAR account id", "merchant");
    const amountCents = Math.round(Number(b.amount) * 100);
    const orderRef = String(b.orderRef ?? "").slice(0, 120);
    if (!orderRef) throw new PaymentError("orderRef is required", "order_ref");
    const p = await createSitePayment({ site, amountCents, orderRef, orderName: String(b.orderName ?? orderRef).slice(0, 60) });
    return publicView(p);
  });
