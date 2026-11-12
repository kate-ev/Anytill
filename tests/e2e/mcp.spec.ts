import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { expect, test } from "@playwright/test";

// Drives the real MCP server over stdio, as an AI agent's MCP client would, against the E2E Anytill server.
function startMcp(baseURL: string) {
  const proc = spawn(process.execPath, ["mcp/anytill-mcp.mjs"], { env: { ...process.env, ANYTILL_URL: baseURL }, stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map<number, (v: any) => void>();
  createInterface({ input: proc.stdout }).on("line", (l) => {
    const m = JSON.parse(l);
    waiting.get(m.id)?.(m);
  });
  let next = 1;
  const rpc = (method: string, params?: unknown) =>
    new Promise<any>((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const call = async (name: string, args: Record<string, unknown> = {}) => (await rpc("tools/call", { name, arguments: args })).result;
  return { proc, rpc, call };
}

test("an AI agent pays at an Anytill store end to end over MCP", async ({ baseURL }) => {
  test.setTimeout(60_000);
  const { proc, rpc, call } = startMcp(baseURL!);
  try {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-agent", version: "1" } });
    expect(init.result.serverInfo.name).toBe("anytill");
    expect(init.result.capabilities.tools).toBeTruthy();
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const tools = (await rpc("tools/list")).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["create_checkout", "quote", "pay_status", "receipt", "list_assets"]));

    const assets = (await call("list_assets")).structuredContent.assets;
    expect(assets.some((a: { symbol: string }) => a.symbol === "SOL")).toBe(true);

    const co = (await call("create_checkout", { merchant: "demo", amount: "30.00" })).structuredContent;
    expect(co.status).toBe("created");

    const q = (await call("quote", { payment_id: co.payment_id, origin_asset: "nep141:sol.omft.near", refund_to: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" })).structuredContent;
    expect(q.send.symbol).toBe("SOL");
    expect(q.merchant_receives).toBe("30.00 USDC on NEAR");

    await call("simulate_deposit", { payment_id: co.payment_id });
    let status = "";
    for (let i = 0; i < 40 && status !== "paid"; i++) {
      status = (await call("pay_status", { payment_id: co.payment_id })).structuredContent.status;
      if (status !== "paid") await new Promise((r) => setTimeout(r, 500));
    }
    expect(status).toBe("paid");

    const r = (await call("receipt", { payment_id: co.payment_id })).structuredContent;
    expect(r.received).toMatchObject({ amount: "30", symbol: "USDC", chain: "NEAR" });
    expect(r.spread.source).toContain("CoinGecko");
    expect(r.stages.every((s: { at: string | null }) => s.at)).toBe(true);
    expect(r.receipt_url).toContain(`/r/${co.payment_id}`);

    // Errors come back as tool errors, not crashes.
    const over = await call("create_checkout", { merchant: "demo", amount: "9999" });
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toContain("limit");
    const unknown = await rpc("tools/call", { name: "mark_paid", arguments: {} });
    expect(unknown.error.code).toBe(-32602);
  } finally {
    proc.kill();
  }
});
