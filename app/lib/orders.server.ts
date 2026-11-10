// The store side of a payment: read the order's outstanding amount, then mark it paid.
// Live: Shopify Admin GraphQL (manual payment method → orderMarkAsPaid; no payments-app approval needed).
// Demo: a stand-in that records what it would have done, labelled as demo.

import prisma from "../db.server";
import { config } from "./config.server";

export interface StoreOrder {
  ref: string;
  name: string;
  outstandingCents: number;
  currency: string;
  cancelled: boolean;
  paid: boolean;
  /** True when the buyer picked the store's "Pay with any crypto" manual payment method. */
  viaCrypto: boolean;
}

export interface OrderBackend {
  getOrder(shop: string, ref: string): Promise<StoreOrder | null>;
  markPaid(shop: string, ref: string, proof: { paymentId: string; proofTx?: string }): Promise<void>;
}

const ORDER_QUERY = `#graphql
  query AnytillOrder($id: ID!) {
    order(id: $id) {
      id
      name
      cancelledAt
      displayFinancialStatus
      paymentGatewayNames
      totalOutstandingSet { shopMoney { amount currencyCode } }
    }
  }`;

const MARK_PAID = `#graphql
  mutation AnytillMarkPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id displayFinancialStatus }
      userErrors { field message }
    }
  }`;

const TAG = `#graphql
  mutation AnytillTag($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { message } }
  }`;

const METAFIELD = `#graphql
  mutation AnytillProof($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { message } }
  }`;

async function shopifyAdmin(shop: string) {
  const { unauthenticated } = await import("../shopify.server");
  const { admin } = await unauthenticated.admin(shop);
  return admin;
}

export const shopifyOrders: OrderBackend = {
  async getOrder(shop, ref) {
    const admin = await shopifyAdmin(shop);
    const res = await admin.graphql(ORDER_QUERY, { variables: { id: ref } });
    const j = (await res.json()) as { data?: { order?: { id: string; name: string; cancelledAt: string | null; displayFinancialStatus: string; paymentGatewayNames: string[]; totalOutstandingSet: { shopMoney: { amount: string; currencyCode: string } } } | null } };
    const o = j.data?.order;
    if (!o) return null;
    return {
      ref: o.id,
      name: o.name,
      outstandingCents: Math.round(Number(o.totalOutstandingSet.shopMoney.amount) * 100),
      currency: o.totalOutstandingSet.shopMoney.currencyCode,
      cancelled: !!o.cancelledAt,
      paid: o.displayFinancialStatus === "PAID",
      viaCrypto: o.paymentGatewayNames.some((g) => /crypto/i.test(g)),
    };
  },
  async markPaid(shop, ref, proof) {
    const admin = await shopifyAdmin(shop);
    const res = await admin.graphql(MARK_PAID, { variables: { input: { id: ref } } });
    const j = (await res.json()) as { data?: { orderMarkAsPaid?: { userErrors: { message: string }[] } } };
    const errs = j.data?.orderMarkAsPaid?.userErrors ?? [];
    if (errs.length) throw new Error(`orderMarkAsPaid: ${errs.map((e) => e.message).join("; ")}`);
    await admin.graphql(TAG, { variables: { id: ref, tags: ["anytill-paid"] } });
    await admin.graphql(METAFIELD, {
      variables: {
        metafields: [{
          ownerId: ref,
          namespace: "anytill",
          key: "settlement",
          type: "json",
          value: JSON.stringify({ payment: proof.paymentId, nearTx: proof.proofTx ?? null }),
        }],
      },
    });
  },
};

/** Demo store: the order IS the payment row (amount computed server-side from the demo catalog). */
export const demoOrders: OrderBackend = {
  async getOrder(shop, ref) {
    const p = await prisma.payment.findFirst({ where: { shop, orderRef: ref }, orderBy: { createdAt: "desc" } });
    if (!p) return null;
    return {
      ref,
      name: p.orderName,
      outstandingCents: p.markedPaidAt ? 0 : p.amountCents,
      currency: p.currency,
      cancelled: false,
      paid: !!p.markedPaidAt,
      viaCrypto: true,
    };
  },
  async markPaid() {
    /* recorded as a PaymentEvent by the caller */
  },
};

export function ordersFor(shop: string): OrderBackend {
  return config.mode === "live" && !shop.startsWith("site:") ? shopifyOrders : demoOrders;
}
