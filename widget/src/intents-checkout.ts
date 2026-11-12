import { LitElement, html, svg, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { encode } from "uqr";
import { styles } from "./styles";
import { PREVIEW } from "./preview";
import type { Asset, PaymentView } from "./types";

type Phase = "loading" | "choose" | "quote" | "paying" | "settled" | "refunded" | "failed" | "expired" | "review" | "error";

const PAYING = ["deposit_seen", "processing", "verifying"];

/**
 * <intents-checkout> — pay with any crypto, merchant receives an exact USDC amount on NEAR.
 *
 *   <intents-checkout payment-id="…"></intents-checkout>                       (Shopify hosted pay page)
 *   <intents-checkout merchant="you.near" amount="48.00" order-ref="A-1001">    (any site)
 *   <intents-checkout preview="quote">                                          (static showcase, no network)
 */
@customElement("intents-checkout")
export class IntentsCheckout extends LitElement {
  static styles = styles;

  @property() api = defaultApi();
  @property({ attribute: "payment-id" }) paymentId = "";
  @property() merchant = "";
  @property() amount = "";
  @property({ attribute: "order-ref" }) orderRef = "";
  @property({ attribute: "order-name" }) orderName = "";
  @property() preview = "";

  @state() private view?: PaymentView;
  @state() private assets: Asset[] = [];
  @state() private selected = "";
  @state() private refundTo = "";
  @state() private busy = false;
  @state() private error = "";
  @state() private fieldError = "";
  @state() private copied = false;
  @state() private now = Date.now();
  @state() private showChecks = false;
  @state() private walletNote = "";

  private timer?: number;
  private poll?: number;
  private payingSince = 0;

  connectedCallback() {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = Date.now()), 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.timer);
    clearTimeout(this.poll);
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("preview") && this.preview) {
      const p = PREVIEW(this.preview);
      this.view = p.view;
      this.assets = p.assets;
      this.selected = p.selected;
      this.refundTo = p.refundTo;
      this.payingSince = Date.now() - 4000;
    }
  }

  protected firstUpdated() {
    if (!this.preview) void this.boot();
  }

  // ───────── data ─────────

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.api}${path}`, { ...init, headers: { "content-type": "application/json" } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
    return j as T;
  }

  private async boot() {
    this.error = "";
    try {
      const [{ assets }, view] = await Promise.all([
        this.req<{ assets: Asset[] }>("/api/v1/assets"),
        this.paymentId
          ? this.req<PaymentView>(`/api/v1/payments/${this.paymentId}`)
          : this.req<PaymentView>("/api/v1/payments", {
              method: "POST",
              body: JSON.stringify({ merchant: this.merchant, amount: this.amount, orderRef: this.orderRef, orderName: this.orderName }),
            }),
      ]);
      this.assets = assets;
      this.setView(view);
      this.selected ||= view.quote?.originAsset ?? assets[0]?.assetId ?? "";
      this.refundTo ||= view.quote?.refundTo ?? "";
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  private setView(v: PaymentView) {
    const before = this.view?.status;
    this.view = v;
    if (PAYING.includes(v.status) && !PAYING.includes(before ?? "")) this.payingSince = Date.now();
    this.dispatchEvent(new CustomEvent("anytill:status", { detail: { status: v.status, paymentId: v.id }, bubbles: true, composed: true }));
    clearTimeout(this.poll);
    if (["quoted", ...PAYING].includes(v.status) && !this.preview) {
      this.poll = window.setTimeout(() => void this.refresh(), v.status === "quoted" ? 4000 : 1500);
    }
  }

  private async refresh() {
    if (!this.view) return;
    try {
      this.setView(await this.req<PaymentView>(`/api/v1/payments/${this.view.id}`));
    } catch {
      this.poll = window.setTimeout(() => void this.refresh(), 5000);
    }
  }

  private async getQuote(e?: Event) {
    e?.preventDefault();
    if (this.preview || !this.view) return;
    const asset = this.asset;
    if (!asset) return;
    if (!this.refundTo.trim()) {
      this.fieldError = `Add a ${asset.chainName} address for refunds.`;
      return;
    }
    this.busy = true;
    this.error = this.fieldError = "";
    try {
      this.setView(await this.req<PaymentView>(`/api/v1/payments/${this.view.id}/quote`, {
        method: "POST",
        body: JSON.stringify({ originAsset: asset.assetId, refundTo: this.refundTo.trim() }),
      }));
    } catch (err) {
      const m = (err as Error).message;
      if (/address/i.test(m)) this.fieldError = m;
      else this.error = m;
    } finally {
      this.busy = false;
    }
  }

  private async simulate() {
    if (this.preview || !this.view) return;
    this.busy = true;
    try {
      this.setView(await this.req<PaymentView>(`/api/v1/payments/${this.view.id}/deposit`, { method: "POST", body: JSON.stringify({ simulate: true }) }));
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }

  /** Pay from an injected EVM wallet through Aurora Intents Connect's transfer helper. */
  private async payWithWallet() {
    const q = this.view?.quote;
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!q || !eth || !q.evmChainId) return;
    this.busy = true;
    this.walletNote = "Confirm the transfer in your wallet…";
    try {
      const { makeTransfer } = await import("@aurora-is-near/intents-connect-wallet/evm");
      const { hash } = await makeTransfer(
        {
          amountAtomic: q.amountIn,
          decimals: q.decimals,
          address: q.depositAddress,
          tokenAddress: q.tokenAddress ?? undefined,
          chain: q.chain,
          evmChainId: q.evmChainId,
          isNativeEvmTokenTransfer: !q.tokenAddress,
        },
        { provider: eth as never },
      );
      this.walletNote = "Sent. Waiting for the deposit to confirm.";
      this.setView(await this.req<PaymentView>(`/api/v1/payments/${this.view!.id}/deposit`, { method: "POST", body: JSON.stringify({ txHash: hash }) }));
    } catch (e) {
      this.walletNote = "";
      this.error = /reject|denied/i.test((e as Error).message) ? "Transfer cancelled in your wallet." : (e as Error).message;
    } finally {
      this.busy = false;
    }
  }

  private async useWalletAddress() {
    const eth = (window as unknown as { ethereum?: { request(a: { method: string }): Promise<string[]> } }).ethereum;
    if (!eth) return;
    try {
      const [addr] = await eth.request({ method: "eth_requestAccounts" });
      if (addr) this.refundTo = addr;
    } catch {
      /* user closed the wallet */
    }
  }

  private async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1600);
    } catch {
      /* clipboard blocked: the address is selectable */
    }
  }

  // ───────── derived ─────────

  private get asset() {
    return this.assets.find((a) => a.assetId === this.selected);
  }

  private get phase(): Phase {
    if (this.error && !this.view) return "error";
    const s = this.view?.status;
    if (!s) return "loading";
    if (s === "created") return "choose";
    if (s === "quoted") return "quote";
    if (PAYING.includes(s)) return "paying";
    if (s === "paid") return "settled";
    if (s === "refunded") return "refunded";
    if (s === "failed") return "failed";
    if (s === "expired") return "expired";
    if (s === "needs_review") return "review";
    return "loading";
  }

  // ───────── render ─────────

  render() {
    const phase = this.phase;
    return html`
      <section class="card" part="card" aria-live="polite" aria-busy=${this.busy || phase === "loading"} data-phase=${phase}>
        ${this.header()}
        <div class="body">
          ${phase === "loading" ? this.loading() : nothing}
          ${phase === "error" ? this.fatal() : nothing}
          ${phase === "choose" || (phase === "expired" && this.view) ? this.choose(phase === "expired") : nothing}
          ${phase === "quote" ? this.quote() : nothing}
          ${phase === "paying" ? this.paying() : nothing}
          ${phase === "settled" ? this.settled() : nothing}
          ${phase === "refunded" ? this.refunded() : nothing}
          ${phase === "failed" || phase === "review" ? this.problem(phase) : nothing}
          ${this.error && phase !== "error" ? html`<p class="alert" role="alert">${icon("alert")}<span>${this.error}</span></p>` : nothing}
        </div>
        <footer class="foot">
          ${icon("lock")}<span>Settles as USDC on NEAR via NEAR Intents</span>
        </footer>
      </section>
    `;
  }

  private header() {
    const v = this.view;
    return html`
      <header class="head">
        <div class="merchant">
          ${v ? html`<span>${v.merchant.name}</span>` : html`<span class="skel" style="width:120px"></span>`}
          ${v?.mode === "demo" ? html`<span class="pill" title="Demo mode: quotes are real prices, deposits are simulated, no funds move">Demo · no real funds</span>` : nothing}
        </div>
        <div class="amount">${v ? v.order.amount : html`<span class="skel" style="width:96px;height:30px"></span>`}</div>
        ${v ? html`<div class="sub">Order ${v.order.name}</div>` : nothing}
      </header>
    `;
  }

  private loading() {
    return html`<div class="rows">${[0, 1, 2].map(() => html`<div class="row skel-row"><span class="skel" style="width:40%"></span></div>`)}</div>`;
  }

  private fatal() {
    return html`
      <div class="state">
        <div class="state-icon err">${icon("alert")}</div>
        <h3>Checkout unavailable</h3>
        <p>${this.error}</p>
        <button class="btn ghost" @click=${() => this.boot()}>Try again</button>
      </div>`;
  }

  private choose(expired: boolean) {
    const groups = groupBySymbol(this.assets);
    const a = this.asset;
    const hasEvmWallet = !!(window as unknown as { ethereum?: unknown }).ethereum && !!a?.evmChainId;
    return html`
      ${expired ? html`<p class="note">${icon("clock")}<span>Your last quote expired before a deposit arrived. Nothing was charged. Get a fresh one below.</span></p>` : nothing}
      <form @submit=${this.getQuote} novalidate>
        <fieldset class="assets">
          <legend>Pay with</legend>
          ${groups.map(([sym, list]) => html`
            <div class="group">
              ${list.map((x) => html`
                <label class="row ${x.assetId === this.selected ? "on" : ""}">
                  <input type="radio" name="asset" .value=${x.assetId} .checked=${x.assetId === this.selected}
                    @change=${() => { this.selected = x.assetId; this.fieldError = ""; }} />
                  <span class="tok">${tokenMark(sym)}<b>${sym}</b><span class="on-chain">on ${x.chainName}</span></span>
                  <i class="dot" style="background:${x.color}" aria-hidden="true"></i>
                </label>`)}
            </div>`)}
        </fieldset>
        <label class="field">
          <span class="label">Refund address on ${a?.chainName ?? "the origin chain"}</span>
          <span class="input-wrap ${this.fieldError ? "invalid" : ""}">
            <input name="refundTo" autocomplete="off" spellcheck="false" .value=${this.refundTo}
              placeholder=${a?.addressHint ?? ""} aria-invalid=${!!this.fieldError} aria-describedby="refund-help"
              @input=${(e: InputEvent) => { this.refundTo = (e.target as HTMLInputElement).value; this.fieldError = ""; }} />
            ${hasEvmWallet ? html`<button type="button" class="link" @click=${this.useWalletAddress}>Use wallet</button>` : nothing}
          </span>
          <span id="refund-help" class=${this.fieldError ? "help err" : "help"}>${this.fieldError || "If the swap can't complete, 1Click returns your funds here automatically."}</span>
        </label>
        <button class="btn" type="submit" ?disabled=${this.busy || !a}>
          ${this.busy ? html`${spinner()} Getting a live quote…` : html`Continue with ${a?.symbol ?? "crypto"}`}
        </button>
      </form>`;
  }

  private quote() {
    const q = this.view!.quote!;
    const left = q.deadline ? Math.max(0, new Date(q.deadline).getTime() - this.now) : 0;
    const mm = String(Math.floor(left / 60000)).padStart(2, "0");
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    const demo = this.view!.mode === "demo";
    const canWallet = !demo && !!q.evmChainId && !!(window as unknown as { ethereum?: unknown }).ethereum;
    return html`
      <div class="send">
        <span class="label">Send exactly</span>
        <div class="big mono" data-testid="amount-in">${q.amountInDisplay} <span>${q.symbol}</span></div>
        <span class="muted">on ${q.chainName} · merchant receives exactly ${this.view!.order.amount.replace("$", "")} USDC</span>
      </div>
      <div class="deposit">
        <div class="qr" role="img" aria-label="QR code of the deposit address">${demo ? html`<div class="qr-demo">${qr(`anytill-demo:${q.depositAddress}`)}<span>DEMO</span></div>` : qr(q.depositAddress)}</div>
        <div class="addr">
          <span class="label">To this ${q.chainName} address</span>
          <code class="mono" data-testid="deposit-address">${q.depositAddress}</code>
          ${q.depositMemo ? html`<span class="label">Memo (required)</span><code class="mono">${q.depositMemo}</code>` : nothing}
          <button class="btn ghost sm" @click=${() => this.copy(q.depositAddress)}>${this.copied ? html`${icon("check")} Copied` : html`${icon("copy")} Copy address`}</button>
        </div>
      </div>
      <div class="meta">
        <span>${icon("clock")} Quote holds for <b class="mono">${mm}:${ss}</b></span>
        <span>~${q.timeEstimateSec ?? 30}s after deposit</span>
      </div>
      ${canWallet ? html`<button class="btn" ?disabled=${this.busy} @click=${this.payWithWallet}>${this.busy ? html`${spinner()} Waiting for wallet…` : html`Pay ${q.amountInDisplay} ${q.symbol} from wallet`}</button>` : nothing}
      ${this.walletNote ? html`<p class="note">${this.walletNote}</p>` : nothing}
      ${demo ? html`<button class="btn" data-testid="simulate" ?disabled=${this.busy} @click=${this.simulate}>${this.busy ? html`${spinner()} Sending…` : "Simulate the deposit"}</button>
        <p class="fine">Demo: this is a live 1Click ${q.source === "recorded" ? "price recorded from the live API" : "dry-run price"} with a placeholder address. Do not send funds.</p>` : nothing}
      <button class="link center" @click=${() => { if (this.view) this.view = { ...this.view, status: "created" }; }}>Pay with something else</button>`;
  }

  private paying() {
    const s = this.view!.status;
    const steps: [string, string][] = [
      ["deposit_seen", "Deposit detected"],
      ["processing", "Swapping to USDC through NEAR Intents"],
      ["verifying", "Checking the USDC landed on NEAR"],
      ["paid", "Order marked paid"],
    ];
    const at = steps.findIndex(([k]) => k === s);
    const secs = Math.max(0, Math.round((this.now - this.payingSince) / 1000));
    return html`
      <div class="progress">
        <div class="timer"><span class="mono">${secs}s</span><span class="muted">since your deposit</span></div>
        <ol class="steps">
          ${steps.map(([, label], i) => html`
            <li class=${i < at ? "done" : i === at ? "now" : ""}>
              <span class="mark">${i < at ? icon("check") : i === at ? spinner() : nothing}</span>${label}
            </li>`)}
        </ol>
        ${this.stagesRow()}
        <p class="fine">You can close this page. The order is marked paid by the store's server, not by your browser.</p>
      </div>`;
  }

  private settled() {
    const v = this.view!;
    const checks = v.checks ?? [];
    return html`
      <div class="state ok">
        <div class="state-icon">${icon("check")}</div>
        <h3>Paid</h3>
        <p data-testid="settled">${v.settledInSec !== null ? html`Settled in <b>${v.settledInSec} s</b> · ` : nothing}${v.merchant.name.replace(" (demo)", "")} received ${v.order.amount.replace("$", "")} USDC</p>
      </div>
      ${checks.length ? html`
        <button class="checks-toggle" aria-expanded=${this.showChecks} @click=${() => (this.showChecks = !this.showChecks)}>
          ${icon("shield")}<span>${checks.filter((c) => c.ok).length} of ${checks.length} server-side checks passed</span>${icon(this.showChecks ? "up" : "down")}
        </button>
        ${this.showChecks ? html`<ul class="checks">${checks.map((c) => html`<li class=${c.ok ? "ok" : "bad"}>${icon(c.ok ? "check" : "alert")}<span>${c.label}<small class="mono">${c.detail}</small></span></li>`)}</ul>` : nothing}` : nothing}
      ${this.stagesRow()}
      ${v.receiptUrl && !this.preview ? html`<a class="btn ghost sm center" data-testid="receipt-link" href=${this.api + v.receiptUrl} target="_blank" rel="noopener">View receipt</a>` : nothing}
      ${v.proofTx ? html`<p class="fine center">${v.mode === "demo" ? html`Simulated NEAR receipt <span class="mono">${short(v.proofTx)}</span>` : html`<a href="https://nearblocks.io/txns/${v.proofTx}" target="_blank" rel="noopener">View the USDC transfer on NEAR</a>`}</p>` : nothing}`;
  }

  private stagesRow() {
    const st = this.view?.stages;
    if (!st) return nothing;
    const t = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–");
    return html`<ol class="money" aria-label="Money states" data-testid="money-states">
      ${st.map((s) => html`<li class=${s.at ? "done" : ""}><i aria-hidden="true"></i><b>${s.label}</b><time class="mono">${t(s.at)}</time></li>`)}
    </ol>`;
  }

  private refunded() {
    const r = this.view!.refunded;
    return html`
      <div class="state">
        <div class="state-icon warn">${icon("return")}</div>
        <h3>Refunded</h3>
        <p>The swap couldn't complete, so 1Click sent ${r?.amount ? html`<b>${r.amount} ${this.view!.quote?.symbol ?? ""}</b>` : "your deposit"} back to <span class="mono">${short(r?.to ?? "")}</span>.${r?.reason ? ` Reason: ${r.reason}.` : ""} Your order is still unpaid.</p>
        <button class="btn ghost" @click=${() => { if (this.view) this.view = { ...this.view, status: "created" }; }}>Try again</button>
      </div>`;
  }

  private problem(kind: "failed" | "review") {
    return html`
      <div class="state">
        <div class="state-icon err">${icon("alert")}</div>
        <h3>${kind === "failed" ? "The swap failed" : "Held for the store to review"}</h3>
        <p>${kind === "failed"
          ? "1Click could not complete this swap. Deposits are returned to your refund address automatically."
          : "Your payment arrived, but something didn't match the order, so it wasn't marked paid automatically. The store has been told and will confirm or refund you."}</p>
        <p class="fine">Reference <span class="mono">${this.view!.id}</span></p>
      </div>`;
  }
}

// ───────── helpers ─────────

function defaultApi(): string {
  const s = document.currentScript as HTMLScriptElement | null;
  const src = s?.src || [...document.querySelectorAll<HTMLScriptElement>("script[src*='anytill']")].pop()?.src;
  return src ? new URL(src).origin : location.origin;
}

function groupBySymbol(assets: Asset[]): [string, Asset[]][] {
  const m = new Map<string, Asset[]>();
  for (const a of assets) m.set(a.symbol, [...(m.get(a.symbol) ?? []), a]);
  return [...m.entries()];
}

function short(s: string) {
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

function qr(text: string) {
  const { data, size } = encode(text, { ecc: "M", border: 0 });
  let d = "";
  data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return svg`<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><path d=${d} fill="currentColor"/></svg>`;
}

function spinner() {
  return html`<span class="spin" aria-hidden="true"></span>`;
}

const MARKS: Record<string, string> = { USDC: "#2775CA", USDT: "#26A17B", ETH: "#627EEA", SOL: "#14F195", BTC: "#F7931A", NEAR: "#0A2540" };
function tokenMark(sym: string) {
  return html`<span class="mark-tok" style="--c:${MARKS[sym] ?? "#425466"}" aria-hidden="true">${sym.slice(0, 1)}</span>`;
}

function icon(name: string) {
  const p: Record<string, ReturnType<typeof svg>> = {
    check: svg`<path d="M4 10.5l3.5 3.5L16 5.5" />`,
    alert: svg`<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.5v.5"/>`,
    lock: svg`<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 016 0V9"/>`,
    clock: svg`<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l2.5 2"/>`,
    copy: svg`<rect x="7" y="7" width="9" height="9" rx="2"/><path d="M4 13V5a1 1 0 011-1h8"/>`,
    shield: svg`<path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5z"/><path d="M7.2 10l2 2 3.6-3.8"/>`,
    down: svg`<path d="M5.5 8l4.5 4.5L14.5 8"/>`,
    up: svg`<path d="M5.5 12.5L10 8l4.5 4.5"/>`,
    return: svg`<path d="M8 5L4.5 8.5 8 12"/><path d="M5 8.5h7a4 4 0 010 8h-2"/>`,
  };
  return html`<svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]}</svg>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "intents-checkout": IntentsCheckout;
  }
}
