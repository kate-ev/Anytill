// Minimal NEAR Intents 1Click client (https://1click.chaindefuser.com).
// Shapes follow @defuse-protocol/one-click-sdk-typescript 0.1.26.

import recordedQuotes from "./fixtures/quotes.recorded.json";

export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  deadline: string;
  referral?: string;
  quoteWaitingTimeMs?: number;
}

export interface Quote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  timeEstimate: number;
  refundFee?: string;
  withdrawFee?: string;
}

export interface QuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
}

export interface SwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  amountIn?: string;
  amountInFormatted?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  originChainTxHashes: { hash: string; explorerUrl: string }[];
  destinationChainTxHashes: { hash: string; explorerUrl: string }[];
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundReason?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
}

export interface StatusResponse {
  correlationId: string;
  quoteResponse: QuoteResponse;
  status: SwapStatus;
  updatedAt: string;
  swapDetails: SwapDetails;
}

export class OneClickError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface OneClickClient {
  quote(req: QuoteRequest): Promise<QuoteResponse & { source: "live" | "dry" | "recorded" }>;
  status(depositAddress: string, depositMemo?: string): Promise<StatusResponse>;
  submitDeposit(txHash: string, depositAddress: string): Promise<void>;
}

type FetchLike = typeof fetch;

export function createOneClick(opts: {
  baseUrl?: string;
  jwt?: string;
  fetch?: FetchLike;
  /** "recorded" never touches the network. */
  source: "live" | "dry" | "recorded";
}): OneClickClient {
  const baseUrl = (opts.baseUrl || "https://1click.chaindefuser.com").replace(/\/$/, "");
  const f = opts.fetch ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await f(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const msg =
        (body && typeof body === "object" && "message" in body && String((body as { message: unknown }).message)) ||
        `1Click ${path} failed with ${res.status}`;
      throw new OneClickError(msg, res.status, body);
    }
    return body as T;
  }

  return {
    async quote(req) {
      if (opts.source === "recorded") return { ...recordedQuote(req), source: "recorded" };
      const body: QuoteRequest = { ...req, dry: opts.source === "dry" ? true : req.dry };
      const res = await call<QuoteResponse>("/v0/quote", { method: "POST", body: JSON.stringify(body) });
      return { ...res, source: body.dry ? "dry" : "live" };
    },
    async status(depositAddress, depositMemo) {
      const q = new URLSearchParams({ depositAddress });
      if (depositMemo) q.set("depositMemo", depositMemo);
      return call<StatusResponse>(`/v0/status?${q}`);
    },
    async submitDeposit(txHash, depositAddress) {
      await call("/v0/deposit/submit", { method: "POST", body: JSON.stringify({ txHash, depositAddress }) });
    },
  };
}

/**
 * Recorded mode: replays real dry:true responses captured from the live API on 2026-11-10,
 * rescaled linearly to the requested USDC amount. Deterministic and offline.
 */
export function recordedQuote(req: QuoteRequest): QuoteResponse {
  const rec = (recordedQuotes as Record<string, { amountOut: string; amountIn: string; minAmountIn: string; decimals: number; amountInUsd: string; timeEstimate: number; signature: string }>)[req.originAsset];
  if (!rec) throw new OneClickError(`No recorded quote for ${req.originAsset}`, 400);
  const scale = (x: string) => ((BigInt(x) * BigInt(req.amount)) / BigInt(rec.amountOut)).toString();
  const amountIn = scale(rec.amountIn);
  const usdOut = (Number(req.amount) / 1e6).toFixed(6);
  return {
    correlationId: "recorded-00000000",
    timestamp: "2026-11-10T06:48:56.202Z",
    signature: rec.signature,
    quoteRequest: { ...req, dry: true },
    quote: {
      amountIn,
      amountInFormatted: formatAtomic(amountIn, rec.decimals),
      amountInUsd: ((Number(rec.amountInUsd) * Number(req.amount)) / Number(rec.amountOut)).toFixed(6),
      minAmountIn: scale(rec.minAmountIn),
      amountOut: req.amount,
      amountOutFormatted: usdOut.replace(/0+$/, "").replace(/\.$/, ""),
      amountOutUsd: usdOut,
      minAmountOut: req.amount,
      timeEstimate: rec.timeEstimate,
      withdrawFee: "0",
    },
  };
}

export function formatAtomic(atomic: string, decimals: number, maxFrac = 8): string {
  const neg = atomic.startsWith("-");
  const digits = (neg ? atomic.slice(1) : atomic).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  let frac = decimals ? digits.slice(digits.length - decimals) : "";
  frac = frac.slice(0, maxFrac).replace(/0+$/, "");
  return `${neg ? "-" : ""}${BigInt(whole).toString()}${frac ? "." + frac : ""}`;
}
