import { test } from "@playwright/test";

// yarn screenshots → docs/screens/*.png (README images). Not part of `yarn test`.
const out = (n: string) => `docs/screens/${n}.png`;

test("capture README screenshots", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.screenshot({ path: out("landing") });
  await page.locator('[data-scene="settled"]').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out("landing-settled") });

  await page.goto("/demo");
  await page.getByTestId("buy-weekender").click();
  const card = page.locator("intents-checkout");
  await card.locator("label.row", { hasText: "SOL" }).click();
  await page.screenshot({ path: out("store-choose") });
  await card.getByRole("textbox").fill("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
  await card.getByRole("button", { name: "Continue with SOL" }).click();
  await card.getByTestId("amount-in").waitFor();
  await page.screenshot({ path: out("store-quote") });
  await card.getByTestId("simulate").click();
  await card.getByText("Swapping to USDC").waitFor();
  await page.screenshot({ path: out("store-paying") });
  await card.getByTestId("settled").waitFor({ timeout: 20_000 });
  await card.getByRole("button", { name: /server-side checks passed/ }).click();
  await page.reload();
  await card.getByTestId("settled").waitFor();
  await card.getByRole("button", { name: /server-side checks passed/ }).click();
  await page.screenshot({ path: out("store-settled"), fullPage: true });

  await page.goto("/app");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out("admin"), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/demo");
  await page.getByTestId("buy-card-wallet").click();
  await page.locator("intents-checkout").getByText("$24.00").waitFor();
  await page.locator("intents-checkout").scrollIntoViewIfNeeded();
  await page.screenshot({ path: out("mobile-checkout") });
  await page.goto("/");
  await page.screenshot({ path: out("mobile-landing") });
});
