// Records docs/media/demo.mp4 from the real app in demo mode (Playwright video), with captions burned in.
//
//   yarn build
//   ANCHOR_CONTRACT=receipts.<you>.testnet ANCHOR_SIGNER=<you>.testnet node scripts/record-demo.mjs
//
// With ANCHOR_* set, the receipt created on camera is anchored on NEAR testnet by the server and then
// verified live (browser page + CLI). Without it, the verify segment uses a receipt already anchored in
// docs/anchored-receipts/. Quotes are live 1Click dry:true (falls back to recorded quotes offline).
// Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg) and Playwright's Chromium.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORT = 3500;
const BASE = `http://localhost:${PORT}`;
const W = 1280;
const H = 720;
const OUT = "docs/media/demo.mp4";
const TMP = "test-results/demo-video";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const anchoring = !!(process.env.ANCHOR_CONTRACT && process.env.ANCHOR_SIGNER);

// ───────── server ─────────
const env = {
  ...process.env,
  DATABASE_URL: "file:./demo-video.sqlite",
  ANYTILL_MODE: "demo",
  ONECLICK_SOURCE: process.env.ONECLICK_SOURCE || "dry",
  DEMO_SETTLE_MS: "6000",
  PORT: String(PORT),
  NODE_ENV: "production",
};
for (const f of ["prisma/demo-video.sqlite", "prisma/demo-video.sqlite-journal"]) if (existsSync(f)) rmSync(f);
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env, stdio: "ignore" });
const server = spawn("node_modules/.bin/react-router-serve", ["./build/server/index.js"], { env, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  if (await fetch(`${BASE}/api/v1/assets`).then((r) => r.ok, () => false)) break;
  await sleep(500);
}
// Warm every route so nothing on camera waits for a cold start.
for (const p of ["/", "/demo", "/verify", "/widget/anytill.js"]) await fetch(BASE + p).then((r) => r.arrayBuffer());

// ───────── recording ─────────
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: TMP, size: { width: W, height: H } } });
const page = await context.newPage();
const t0 = Date.now();

const CARD_CSS = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&display=swap">
  <style>
    html,body{margin:0;height:100%;background:#fff;color:#0A2540;font-family:'Hanken Grotesk',system-ui,sans-serif}
    .card{height:100%;display:grid;place-content:center;padding:0 120px;position:relative;overflow:hidden}
    .band{position:absolute;left:-10%;right:-10%;bottom:-40px;height:150px;transform:skewY(-6deg);
      background:linear-gradient(100deg,#627eea,#0052ff 22%,#14f195 45%,#f7931a 70%,#00c08b)}
    .eyebrow{color:#0b7a5f;font-weight:700;font-size:22px;margin-bottom:18px}
    h1{font-size:58px;line-height:1.05;letter-spacing:-.03em;margin:0 0 22px;max-width:18ch}
    p{font-size:26px;color:#425466;margin:0 0 10px;max-width:46ch;line-height:1.4}
    ul{font-size:25px;color:#0A2540;line-height:1.55;margin:6px 0 0;padding-left:28px}
    .fine{font-size:19px;color:#5b6b7d;margin-top:22px}
    .term{background:#0A2540;color:#e6edf5;border-radius:14px;padding:30px 34px;font:20px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:1040px}
    .term .ok{color:#7fe3c6;font-weight:700}
    .term .cmd{color:#9fc3ff}
  </style>`;

async function card(html, ms) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${CARD_CSS}</head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await caption("");
  await page.waitForTimeout(ms);
}

// Burned-in caption bar (part of the recorded frames; the app itself is not restyled).
async function caption(text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:1100px;background:rgba(10,37,64,.92);color:#fff;font:600 21px/1.35 'Hanken Grotesk',system-ui,sans-serif;padding:10px 18px;border-radius:10px;text-align:center;pointer-events:none";
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.display = t ? "block" : "none";
  }, text);
}

// 1. The problem
await card(`<div class="card"><div class="band"></div>
  <div class="eyebrow">The problem</div>
  <h1>A Shopify store can't take crypto from any chain without a custodian.</h1>
  <p>And when a crypto checkout says "paid", the merchant has to take its word for it.</p></div>`, 5500);

// 2. Landing
await page.goto(`${BASE}/`);
await page.evaluate(() => document.fonts.ready);
await caption("Anytill: the buyer pays with any crypto, the store receives the exact total in USDC on NEAR.");
await page.waitForTimeout(4500);

// 3. One complete purchase
await page.goto(`${BASE}/demo`);
await page.evaluate(() => document.fonts.ready);
await caption("Demo store. The $48 price comes from the order on the server, never from the browser.");
await page.waitForTimeout(2800);
await page.getByTestId("buy-weekender").click();
const card$ = page.locator("intents-checkout");
await card$.getByText("$48.00").waitFor();
await caption("The buyer picks SOL and gives a refund address.");
await card$.locator("label.row").filter({ has: page.locator("b", { hasText: /^SOL$/ }) }).click();
await card$.getByRole("textbox").pressSequentially("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", { delay: 25 });
await page.waitForTimeout(600);
await card$.getByRole("button", { name: "Continue with SOL" }).click();
await card$.getByTestId("amount-in").waitFor();
await caption("Live NEAR Intents 1Click quote, EXACT_OUTPUT: send this much SOL, the store gets exactly 48 USDC. (Demo address: no funds move.)");
await page.waitForTimeout(5500);
await card$.getByTestId("simulate").click();
await caption("Deposit simulated in demo mode. Pending, then Settled, then Paid out, each with a timestamp.");
await card$.getByTestId("settled").waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await card$.getByRole("button", { name: /server-side checks passed/ }).click();
await card$.getByTestId("money-states").scrollIntoViewIfNeeded();
await caption("Marked paid only after 8 server-side checks, including reading the USDC transfer on NEAR.");
await page.waitForTimeout(5500);

// 4. The receipt
const paymentId = await card$.getByTestId("receipt-link").getAttribute("href").then((h) => h.split("/").pop());
if (anchoring) {
  for (let i = 0; i < 90; i++) {
    const r = await (await fetch(`${BASE}/api/v1/payments/${paymentId}/receipt`)).json();
    if (r.anchor) break;
    await sleep(1000);
  }
}
await page.goto(`${BASE}/r/${paymentId}`);
await page.evaluate(() => document.fonts.ready);
await caption("A shareable receipt: what the buyer paid, what the store received, and the spread in bps against CoinGecko mid-market.");
await page.waitForTimeout(6500);
await page.mouse.wheel(0, 400);
await caption(anchoring ? "The receipt's SHA-256 is anchored on NEAR testnet the moment the order is paid." : "Receipt hashes are anchored on NEAR testnet.");
await page.waitForTimeout(4000);

// 5. Verify against the chain
const verifyId = anchoring ? paymentId : readdirSync("docs/anchored-receipts")[0].replace(".json", "");
await page.goto(`${BASE}/verify?id=${anchoring ? verifyId : ""}`);
if (!anchoring) {
  const json = (await import("node:fs")).readFileSync(`docs/anchored-receipts/${verifyId}.json`, "utf8");
  await page.locator("#v-in").fill(json);
  await page.getByRole("button", { name: "Verify on NEAR" }).click();
}
await page.getByTestId("verdict").waitFor({ timeout: 60000 });
await caption("Anyone can check it: the hash is recomputed in the browser and read from the NEAR contract. Match.");
await page.waitForTimeout(6500);

// 6. Same check from the command line: the real output, rendered as-is
const receiptFile = `${TMP}/receipt-${verifyId}.json`;
if (anchoring) writeFileSync(receiptFile, JSON.stringify(await (await fetch(`${BASE}/api/v1/payments/${verifyId}/receipt`)).json(), null, 2));
const cliArgs = ["scripts/verify-receipt.mjs", anchoring ? receiptFile : `docs/anchored-receipts/${verifyId}.json`];
let cliOut;
try {
  cliOut = execFileSync("node", cliArgs, { encoding: "utf8" });
} catch (e) {
  cliOut = (e.stdout || "") + (e.stderr || "");
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const shown = esc(cliOut.trim()).replace(/^(MATCH.*)$/m, '<span class="ok">$1</span>');
await card(`<div class="card"><div class="term"><span class="cmd">$ node scripts/verify-receipt.mjs receipt.json</span>\n${shown}</div></div>`, 0);
await caption("The same check from the command line, against NEAR testnet. No keys needed.");
await page.waitForTimeout(6500);

// 7. What NEAR does here
await card(`<div class="card"><div class="band"></div>
  <div class="eyebrow">What NEAR does here</div>
  <ul>
    <li>NEAR Intents 1Click turns any coin on any chain into exactly the order total in USDC.</li>
    <li>The USDC lands in the merchant's own NEAR account. No custodian.</li>
    <li>The order is marked paid only after the transfer is read on NEAR.</li>
    <li>Every receipt's hash is anchored on NEAR, so anyone can check it.</li>
  </ul>
  <p class="fine">Demo mode: deposit and payout are simulated; quotes and the testnet anchor are real. Anytill, built at NEAR HACKATHON.</p></div>`, 7500);

const seconds = ((Date.now() - t0) / 1000).toFixed(1);
const videoPath = await page.video().path();
await context.close();
await browser.close();
server.kill();

// ───────── encode ─────────
mkdirSync("docs/media", { recursive: true });
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", videoPath, "-ss", "0.4", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-r", "30", "-an", "-movflags", "+faststart", `${OUT}.tmp.mp4`]);
renameSync(`${OUT}.tmp.mp4`, OUT);
console.log(`recorded ~${seconds}s → ${OUT}${anchoring ? " (receipt anchored and verified live)" : ""}`);
