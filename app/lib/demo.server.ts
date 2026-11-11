// Demo store: a fictional shop with seeded, deterministic data. Clearly labelled as demo in the UI.
import { randomUUID } from "node:crypto";
import prisma from "../db.server";
import { DEMO_SHOP } from "./config.server";

export const DEMO_PRODUCTS = [
  { id: "weekender", name: "Weekender bag", detail: "Vegetable-tanned leather, 32 L", cents: 4800, tone: "#8A5A3B" },
  { id: "card-wallet", name: "Card wallet", detail: "Six slots, hand-stitched", cents: 2400, tone: "#3E2A1F" },
  { id: "atelier-trunk", name: "Atelier trunk", detail: "Made to order", cents: 64000, tone: "#B07A4F" },
] as const;

export async function ensureDemoMerchant() {
  return prisma.merchant.upsert({
    where: { shop: DEMO_SHOP },
    update: {},
    create: {
      shop: DEMO_SHOP,
      displayName: "Lagos Leather Co. (demo)",
      nearAccount: "lagos-leather.near",
      enabled: true,
      perOrderCapCents: 50000,
      dailyCapCents: 500000,
    },
  });
}

/** Creates a demo "order": the total is computed here from the catalog, never taken from the browser. */
export async function createDemoOrder(productId: string) {
  const product = DEMO_PRODUCTS.find((p) => p.id === productId);
  if (!product) throw new Error("Unknown product");
  await ensureDemoMerchant();
  const count = await prisma.payment.count({ where: { shop: DEMO_SHOP } });
  // Unique per order: two buyers checking out in the same millisecond must never share an order.
  const ref = `demo-order-${randomUUID()}`;
  return { ref, name: `#${1041 + count}`, cents: product.cents, product };
}
