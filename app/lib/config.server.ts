import { createOneClick, type OneClickClient } from "./oneclick.server";

export type Mode = "demo" | "live";

export const config = {
  get mode(): Mode {
    return process.env.ANYTILL_MODE === "live" ? "live" : "demo";
  },
  get quoteSource(): "live" | "dry" | "recorded" {
    if (this.mode === "live") return "live";
    return process.env.ONECLICK_SOURCE === "recorded" ? "recorded" : "dry";
  },
  get nearRpc(): string {
    return process.env.NEAR_RPC_URL || "https://rpc.mainnet.near.org";
  },
  get appUrl(): string {
    return (process.env.SHOPIFY_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  /** How long the simulated swap takes in demo mode after "I've sent it". */
  get demoSettleMs(): number {
    return Number(process.env.DEMO_SETTLE_MS || 6000);
  },
  get shopifyConfigured(): boolean {
    return !!(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET);
  },
};

let client: OneClickClient | undefined;
let clientKey = "";
export function oneClick(): OneClickClient {
  const key = `${config.quoteSource}|${process.env.ONECLICK_BASE_URL}|${process.env.ONECLICK_JWT}`;
  if (!client || key !== clientKey) {
    client = createOneClick({
      source: config.quoteSource,
      baseUrl: process.env.ONECLICK_BASE_URL,
      jwt: process.env.ONECLICK_JWT || undefined,
    });
    clientKey = key;
  }
  return client;
}

export const DEMO_SHOP = "demo.anytill.local";
