import { expect, test } from "@playwright/test";
import { PAY_ASSETS, USDC_NEAR, centsToUsdcAtomic, isNearAccountId, looksLikeAddress } from "../../app/lib/assets";
import { createOneClick, formatAtomic, recordedQuote, type QuoteRequest } from "../../app/lib/oneclick.server";

const base: QuoteRequest = {
  dry: true, swapType: "EXACT_OUTPUT", slippageTolerance: 100, originAsset: "nep141:sol.omft.near", depositType: "ORIGIN_CHAIN",
  destinationAsset: USDC_NEAR.assetId, amount: "48000000", refundTo: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", refundType: "ORIGIN_CHAIN",
  recipient: "intents.near", recipientType: "DESTINATION_CHAIN", deadline: new Date(Date.now() + 3600e3).toISOString(),
};

test("every pay asset has a recorded quote for offline demo mode", () => {
  for (const a of PAY_ASSETS) {
    const q = recordedQuote({ ...base, originAsset: a.assetId });
    expect(BigInt(q.quote.amountIn)).toBeGreaterThan(0n);
    expect(q.quote.amountOut).toBe("48000000");
  }
});

test("recorded quotes scale to the order amount and keep the output exact", () => {
  const q = recordedQuote({ ...base, amount: centsToUsdcAtomic(2400) });
  const full = recordedQuote(base);
  expect(q.quote.amountOut).toBe("24000000");
  expect(BigInt(q.quote.amountIn) * 2n).toBeGreaterThanOrEqual(BigInt(full.quote.amountIn) - 2n);
});

test("amounts are converted without floating point", () => {
  expect(centsToUsdcAtomic(4800)).toBe("48000000");
  expect(centsToUsdcAtomic(1)).toBe("10000");
  expect(() => centsToUsdcAtomic(0)).toThrow();
  expect(formatAtomic("577142683", 9)).toBe("0.57714268");
  expect(formatAtomic("13096743331244671280554455", 24)).toBe("13.09674333");
});

test("refund addresses are shape-checked per chain", () => {
  expect(looksLikeAddress("base", "0x8ba1f109551bD432803012645Ac136ddd64DBA72")).toBe(true);
  expect(looksLikeAddress("base", "0x8ba1")).toBe(false);
  expect(looksLikeAddress("sol", "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin")).toBe(true);
  expect(looksLikeAddress("btc", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(true);
  expect(looksLikeAddress("btc", "0x8ba1f109551bD432803012645Ac136ddd64DBA72")).toBe(false);
  expect(isNearAccountId("lagos-leather.near")).toBe(true);
  expect(isNearAccountId("Bad..near")).toBe(false);
});

test("the 1Click client sends an EXACT_OUTPUT request and forces dry in dry mode", async () => {
  let sent: QuoteRequest | undefined;
  const fake = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ ...recordedQuote(sent!), signature: "sig" }), { status: 200 });
  }) as typeof fetch;
  const client = createOneClick({ source: "dry", fetch: fake });
  const res = await client.quote({ ...base, dry: false });
  expect(sent?.dry).toBe(true);
  expect(sent?.swapType).toBe("EXACT_OUTPUT");
  expect(res.source).toBe("dry");
});

test("live 1Click dry quote (opt-in: ANYTILL_LIVE_DRY=1)", async () => {
  test.skip(!process.env.ANYTILL_LIVE_DRY, "network test; run with yarn test:live-dry");
  const client = createOneClick({ source: "dry" });
  const res = await client.quote(base);
  expect(res.quote.amountOut).toBe("48000000");
  expect(res.quoteRequest.swapType).toBe("EXACT_OUTPUT");
  expect(BigInt(res.quote.amountIn)).toBeGreaterThan(BigInt(res.quote.minAmountIn) - 1n);
});
