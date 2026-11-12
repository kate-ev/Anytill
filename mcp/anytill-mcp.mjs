#!/usr/bin/env node
// Anytill MCP server (stdio, JSON-RPC 2.0, newline-delimited). Lets an AI shopping agent pay at an
// Anytill store: create a checkout, get an EXACT_OUTPUT quote, follow settlement, fetch the receipt.
// No dependencies. Talks to an Anytill server over its public HTTP API.
//
//   ANYTILL_URL=http://localhost:3000 node mcp/anytill-mcp.mjs
//
// The agent never holds the merchant's keys and cannot mark anything paid: only the Anytill server
// does that, after verifying settlement on NEAR.

import { createInterface } from "node:readline";

const BASE = (process.env.ANYTILL_URL || "http://localhost:3000").replace(/\/$/, "");
const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "list_assets",
    description: "List the assets and chains a buyer can pay with. Settlement is always USDC on NEAR.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_checkout",
    description: "Open a checkout at an Anytill store. merchant is the store's NEAR account (or \"demo\" for the demo store). amount is in USD. Returns a payment id. The store's per-order and daily caps apply.",
    inputSchema: {
      type: "object",
      properties: {
        merchant: { type: "string", description: "Merchant NEAR account, e.g. shop.near, or \"demo\"" },
        amount: { type: "string", description: "Order total in USD, e.g. \"48.00\"" },
        order_ref: { type: "string", description: "Your order reference; reused to resume the same checkout" },
      },
      required: ["merchant", "amount"],
      additionalProperties: false,
    },
  },
  {
    name: "quote",
    description: "Get a live NEAR Intents 1Click EXACT_OUTPUT quote: how much of origin_asset to send so the merchant receives exactly the order amount in USDC. refund_to is where 1Click returns funds if the swap cannot complete.",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: { type: "string" },
        origin_asset: { type: "string", description: "assetId from list_assets, e.g. nep141:sol.omft.near" },
        refund_to: { type: "string", description: "Refund address on the origin chain" },
      },
      required: ["payment_id", "origin_asset", "refund_to"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_deposit_tx",
    description: "After sending the deposit, report the origin-chain transaction hash so 1Click picks it up faster.",
    inputSchema: {
      type: "object",
      properties: { payment_id: { type: "string" }, tx_hash: { type: "string" } },
      required: ["payment_id", "tx_hash"],
      additionalProperties: false,
    },
  },
  {
    name: "simulate_deposit",
    description: "Demo stores only: pretend the deposit landed so the agent can walk the full flow without funds.",
    inputSchema: { type: "object", properties: { payment_id: { type: "string" } }, required: ["payment_id"], additionalProperties: false },
  },
  {
    name: "pay_status",
    description: "Current state of a payment: created, quoted, deposit_seen, processing, verifying, paid, refunded, failed, expired or needs_review, with Pending / Settled / Paid out timestamps. Polling this also advances settlement checks on the server.",
    inputSchema: { type: "object", properties: { payment_id: { type: "string" } }, required: ["payment_id"], additionalProperties: false },
  },
  {
    name: "receipt",
    description: "The payment receipt: what the buyer paid, what the merchant received in USDC, the spread against a named mid-market price source, stage timestamps and a public receipt URL.",
    inputSchema: { type: "object", properties: { payment_id: { type: "string" } }, required: ["payment_id"], additionalProperties: false },
  },
];

async function api(path, init) {
  const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Anytill API ${path} → ${res.status}`);
  return body;
}

const id = (s) => encodeURIComponent(String(s));

async function callTool(name, a = {}) {
  switch (name) {
    case "list_assets": return api("/api/v1/assets");
    case "create_checkout": {
      const ref = a.order_ref || `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const p = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ merchant: a.merchant, amount: a.amount, orderRef: ref, orderName: ref }) });
      return { payment_id: p.id, order_ref: ref, ...p, pay_page: `${BASE}/pay/${p.id}` };
    }
    case "quote": {
      const p = await api(`/api/v1/payments/${id(a.payment_id)}/quote`, { method: "POST", body: JSON.stringify({ originAsset: a.origin_asset, refundTo: a.refund_to }) });
      return { payment_id: p.id, status: p.status, mode: p.mode, send: p.quote && { amount: p.quote.amountInDisplay, symbol: p.quote.symbol, chain: p.quote.chainName, to: p.quote.depositAddress, memo: p.quote.depositMemo, deadline: p.quote.deadline }, merchant_receives: `${(p.order.amountCents / 100).toFixed(2)} USDC on NEAR` };
    }
    case "submit_deposit_tx": return api(`/api/v1/payments/${id(a.payment_id)}/deposit`, { method: "POST", body: JSON.stringify({ txHash: a.tx_hash }) });
    case "simulate_deposit": return api(`/api/v1/payments/${id(a.payment_id)}/deposit`, { method: "POST", body: JSON.stringify({ simulate: true }) });
    case "pay_status": {
      const p = await api(`/api/v1/payments/${id(a.payment_id)}`);
      return { payment_id: p.id, status: p.status, mode: p.mode, order: p.order, stages: p.stages, settled_in_sec: p.settledInSec, checks_passed: p.checks ? `${p.checks.filter((c) => c.ok).length}/${p.checks.length}` : null, receipt_url: `${BASE}${p.receiptUrl}` };
    }
    case "receipt": {
      const r = await api(`/api/v1/payments/${id(a.payment_id)}/receipt`);
      return { ...r, receipt_url: `${BASE}/r/${r.id}` };
    }
    default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg) {
  const { id: rid, method, params } = msg;
  if (rid === undefined) return; // notifications (e.g. notifications/initialized)
  try {
    switch (method) {
      case "initialize":
        return send({ jsonrpc: "2.0", id: rid, result: { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "anytill", version: "0.1.0" }, instructions: "Pay at Anytill stores with any crypto. Flow: create_checkout → quote → (send deposit, or simulate_deposit on demo) → pay_status until paid → receipt." } });
      case "ping":
        return send({ jsonrpc: "2.0", id: rid, result: {} });
      case "tools/list":
        return send({ jsonrpc: "2.0", id: rid, result: { tools: TOOLS } });
      case "tools/call": {
        try {
          const out = await callTool(params?.name, params?.arguments);
          return send({ jsonrpc: "2.0", id: rid, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out } });
        } catch (e) {
          if (e.code === -32602) throw e;
          return send({ jsonrpc: "2.0", id: rid, result: { content: [{ type: "text", text: e.message }], isError: true } });
        }
      }
      default:
        return send({ jsonrpc: "2.0", id: rid, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (e) {
    send({ jsonrpc: "2.0", id: rid, error: { code: e.code ?? -32603, message: e.message } });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  void handle(msg);
});
