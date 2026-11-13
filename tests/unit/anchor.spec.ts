import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
// @ts-expect-error plain ESM helpers without type declarations
import { b58decode, b58encode, loadKey, serializeTx, signTx, verifySignature, actions, TESTNET_RPCS, view } from "../../app/lib/near-tx.mjs";
// @ts-expect-error plain ESM helper without type declarations
import { canonicalReceipt, receiptHash } from "../../app/lib/receipt-canonical.mjs";

const RECEIPTS = readdirSync("docs/anchored-receipts").map((f) => JSON.parse(readFileSync(`docs/anchored-receipts/${f}`, "utf8")));

test("receipt hash is stable, ignores the anchor block and key order", async () => {
  const r = RECEIPTS[0];
  const reordered = Object.fromEntries(Object.entries(r).reverse());
  expect(await receiptHash(reordered)).toBe(await receiptHash(r));
  expect(await receiptHash({ ...r, anchor: null })).toBe(await receiptHash(r));
  expect(canonicalReceipt(r)).not.toContain("anchor");
});

test("any edit to a receipt changes its hash", async () => {
  const r = RECEIPTS[0];
  const h = await receiptHash(r);
  const edits = [
    { ...r, orderAmount: "$4.80" },
    { ...r, recipient: "attacker.near" },
    { ...r, spread: { ...r.spread, bps: 1 } },
    { ...r, paid: { ...r.paid, amount: "0.1" } },
    { ...r, stages: r.stages.map((s: { at: string }, i: number) => (i === 2 ? { ...s, at: "2026-11-14T00:00:00.000Z" } : s)) },
  ];
  for (const e of edits) expect(await receiptHash(e)).not.toBe(h);
});

test("the signer produces valid ed25519 signatures over the borsh transaction", () => {
  // Throwaway key generated for this test only; it controls no account.
  const key = loadKey({ secret: "ed25519:" + b58encode(new Uint8Array(64).fill(7)), accountId: "test.testnet" });
  const tx = serializeTx({ signerId: "test.testnet", publicKey: key.publicKey, nonce: 5n, receiverId: "receipts.test.testnet", blockHash: new Uint8Array(32), actionList: [actions.functionCall("anchor", { receipt_id: "r", hash: "a".repeat(64) })] });
  const s = signTx(tx, key);
  expect(verifySignature(s.digest, s.signature, key.publicKey)).toBe(true);
  expect(b58decode(s.hash)).toHaveLength(32);
  expect(b58decode(b58encode(Uint8Array.from([0, 0, 1, 2, 255])))).toEqual(Uint8Array.from([0, 0, 1, 2, 255]));
});

test("committed receipts match their on-chain anchors (opt-in: ANYTILL_LIVE_TESTNET=1)", async () => {
  test.skip(!process.env.ANYTILL_LIVE_TESTNET, "network test; run with ANYTILL_LIVE_TESTNET=1");
  for (const r of RECEIPTS) {
    const onChain = await view(TESTNET_RPCS, "receipts.anytill-hk1113.testnet", "get_anchor", { receipt_id: r.id });
    expect(onChain.hash).toBe(await receiptHash(r));
    expect(await view(TESTNET_RPCS, "receipts.anytill-hk1113.testnet", "verify", { receipt_id: r.id, hash: "0".repeat(64) })).toBe(false);
  }
});
