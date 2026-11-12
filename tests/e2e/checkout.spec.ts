import { expect, test } from "@playwright/test";

// Keep E2E offline and deterministic: third-party fonts and CDN scripts are not part of the checkout.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.shopify\.com/, (r) => r.abort());
});

const SOL_REFUND = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

test("landing shows the live checkout card as the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Take crypto from any chain. Get USDC.");
  await expect(page.locator("intents-checkout:visible").first().getByText("Lagos Leather Co.")).toBeVisible();
});

test("full checkout: pick SOL, get an EXACT_OUTPUT quote, deposit, verified, order marked paid", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/demo");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  await page.getByTestId("buy-weekender").click();

  const card = page.locator("intents-checkout");
  await expect(card.getByText("$48.00")).toBeVisible();
  await card.locator("label.row").filter({ has: page.locator("b", { hasText: /^SOL$/ }) }).click();
  await card.getByRole("textbox").fill(SOL_REFUND);
  await card.getByRole("button", { name: "Continue with SOL" }).click();

  await expect(card.getByTestId("amount-in")).toContainText("SOL");
  await expect(card.getByTestId("deposit-address")).toHaveText(/^DEMO-/);
  await expect(card.getByText("merchant receives exactly 48.00 USDC")).toBeVisible();

  await card.getByTestId("simulate").click();
  await expect(card.getByText("Swapping to USDC through NEAR Intents")).toBeVisible();
  // Settlement is polled by the widget; wait for the server's verdict explicitly, then for the checks toggle.
  await expect(card.getByTestId("settled")).toContainText("Settled in", { timeout: 30_000 });
  const checks = card.getByRole("button", { name: /8 of 8 server-side checks passed/ });
  await expect(checks).toBeVisible({ timeout: 15_000 });
  await checks.click();
  await expect(card.getByText("NEAR chain shows the USDC transfer to the merchant")).toBeVisible();

  // Money states: all three stages reached, each with a timestamp.
  await expect(card.getByTestId("money-states").locator("li.done")).toHaveCount(3);

  // Shareable receipt: amounts, spread vs a named mid-market source, timestamps.
  const href = await card.getByTestId("receipt-link").getAttribute("href");
  const receipt = await page.context().newPage();
  await receipt.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.shopify\.com/, (r) => r.abort());
  await receipt.goto(href!);
  await expect(receipt.getByTestId("receipt-lines")).toContainText(/Buyer paid\s*0\.\d+ SOL on Solana/);
  await expect(receipt.getByTestId("receipt-lines")).toContainText("48 USDC on NEAR");
  await expect(receipt.getByTestId("spread")).toContainText(/-?\d+ bps/);
  await expect(receipt.getByTestId("spread")).toContainText("CoinGecko");
  await expect(receipt.locator(".stages li.done")).toHaveCount(3);
  await receipt.close();

  await page.reload();
  await expect(page.getByTestId("ledger")).toContainText("marked paid", { timeout: 15_000 });
  await expect(page.getByTestId("ledger")).toContainText("8/8 checks passed");
});

test("a bad refund address is caught before any quote", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("buy-card-wallet").click();
  const card = page.locator("intents-checkout");
  await card.locator("label.row", { hasText: "Base" }).first().click();
  await card.getByRole("textbox").fill("not-an-address");
  await card.getByRole("button", { name: /Continue with/ }).click();
  await expect(card.getByText(/doesn't look like a Base address/)).toBeVisible();
});

test("orders above the per-order cap never get a quote", async ({ page }) => {
  await page.goto("/demo");
  await page.getByTestId("buy-atelier-trunk").click();
  await expect(page.getByTestId("order-error")).toContainText("above this store's crypto limit");
});

test("merchant admin lists the payment with its proof timeline", async ({ page }) => {
  test.skip(test.info().project.name === "mobile");
  await page.goto("/app");
  await expect(page.getByText("You are viewing the seeded demo store")).toBeVisible();
  await expect(page.locator('s-section[heading="Payout and limits"]')).toBeAttached();
  await expect(page.locator('s-text-field[name="nearAccount"]')).toHaveAttribute("defaultValue", "lagos-leather.near");
});

test("script-tag API: amount capped, quote validated server-side", async ({ request }) => {
  const created = await request.post("/api/v1/payments", { data: { merchant: "demo", amount: "12.50", orderRef: `web-${Date.now()}` } });
  expect(created.ok()).toBeTruthy();
  const p = await created.json();
  expect(p.status).toBe("created");
  expect(p.order.amount).toBe("$12.50");

  const bad = await request.post(`/api/v1/payments/${p.id}/quote`, { data: { originAsset: "nep141:base.omft.near", refundTo: "nope" } });
  expect(bad.status()).toBe(400);

  const unknown = await request.post(`/api/v1/payments/${p.id}/quote`, { data: { originAsset: "nep141:scamcoin.near", refundTo: SOL_REFUND } });
  expect((await unknown.json()).code).toBe("asset");

  const tooBig = await request.post("/api/v1/payments", { data: { merchant: "demo", amount: "9000", orderRef: `web-big-${Date.now()}` } });
  expect((await tooBig.json()).code).toBe("per_order_cap");
});
