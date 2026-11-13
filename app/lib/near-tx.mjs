// Minimal NEAR transaction signer and RPC client. No dependencies: borsh by hand, ed25519 from node:crypto.
// Used to deploy the receipt-anchor contract and to anchor receipt hashes. Keys are read at runtime from
// a NEAR CLI key file or an env var, never stored in the repo.

import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";

// ───────── base58 ─────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
export function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

// ───────── borsh ─────────
class W {
  parts = [];
  u8(v) { this.parts.push(Uint8Array.of(v)); return this; }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.parts.push(b); return this; }
  u64(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); this.parts.push(b); return this; }
  u128(v) { const x = BigInt(v); const b = Buffer.alloc(16); b.writeBigUInt64LE(x & 0xffffffffffffffffn); b.writeBigUInt64LE(x >> 64n, 8); this.parts.push(b); return this; }
  fixed(bytes) { this.parts.push(Uint8Array.from(bytes)); return this; }
  bytes(bytes) { this.u32(bytes.length); return this.fixed(bytes); }
  str(s) { return this.bytes(Buffer.from(s, "utf8")); }
  out() { return Buffer.concat(this.parts.map((p) => Buffer.from(p))); }
}

// ───────── actions ─────────
export const actions = {
  createAccount: () => (w) => w.u8(0),
  deployContract: (code) => (w) => w.u8(1).bytes(code),
  functionCall: (method, args, gas = 30_000_000_000_000n, deposit = 0n) => (w) =>
    w.u8(2).str(method).bytes(Buffer.from(JSON.stringify(args))).u64(gas).u128(deposit),
  transfer: (yocto) => (w) => w.u8(3).u128(yocto),
  addFullAccessKey: (publicKey) => (w) => w.u8(5).u8(0).fixed(publicKey).u64(0).u8(1),
};

export const NEAR = 10n ** 24n;

// ───────── keys ─────────
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

/** Load a key from a NEAR CLI key file ({account_id?, public_key, private_key}) or "ed25519:<base58>" secret. */
export function loadKey({ file, secret, accountId }) {
  let raw = secret;
  let account = accountId;
  if (!raw && file) {
    const j = JSON.parse(readFileSync(file, "utf8"));
    raw = j.private_key || j.secret_key;
    account = account || j.account_id;
  }
  if (!raw) throw new Error("no NEAR key provided");
  const sk = b58decode(raw.replace(/^ed25519:/, ""));
  const seed = sk.slice(0, 32);
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  const pubDer = createPublicKey(priv).export({ format: "der", type: "spki" });
  const publicKey = Uint8Array.from(pubDer.subarray(pubDer.length - 32));
  return { accountId: account, priv, publicKey, publicKeyStr: "ed25519:" + b58encode(publicKey) };
}

// ───────── rpc ─────────
export async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "anytill", method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error.data ?? j.error.cause ?? j.error.message)}`);
  return j.result;
}

/** Free, keyless view call. */
export async function view(url, contractId, method, args = {}) {
  const r = await rpc(url, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString() || "null");
}

// ───────── transactions ─────────
export function serializeTx({ signerId, publicKey, nonce, receiverId, blockHash, actionList }) {
  const w = new W().str(signerId).u8(0).fixed(publicKey).u64(nonce).str(receiverId).fixed(blockHash).u32(actionList.length);
  for (const a of actionList) a(w);
  return w.out();
}

export function signTx(txBytes, key) {
  const hash = createHash("sha256").update(txBytes).digest();
  const signature = edSign(null, hash, key.priv);
  const signed = Buffer.concat([txBytes, Buffer.from([0]), signature]);
  return { hash: b58encode(hash), signed, signature, digest: hash };
}

export function verifySignature(digest, signature, publicKey) {
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]);
  return edVerify(null, digest, createPublicKey({ key: der, format: "der", type: "spki" }), signature);
}

/** Sign and send; waits for final execution. Returns { txHash, outcome }. Throws if any receipt failed. */
export async function signAndSend({ rpcUrl, key, receiverId, actionList }) {
  const ak = await rpc(rpcUrl, "query", { request_type: "view_access_key", finality: "final", account_id: key.accountId, public_key: key.publicKeyStr });
  const tx = serializeTx({
    signerId: key.accountId,
    publicKey: key.publicKey,
    nonce: BigInt(ak.nonce) + 1n,
    receiverId,
    blockHash: b58decode(ak.block_hash),
    actionList,
  });
  const { hash, signed } = signTx(tx, key);
  const outcome = await rpc(rpcUrl, "send_tx", { signed_tx_base64: signed.toString("base64"), wait_until: "FINAL" });
  const failure = [outcome.status, ...(outcome.receipts_outcome ?? []).map((r) => r.outcome.status)].find((s) => s && s.Failure);
  if (failure) throw Object.assign(new Error(`transaction ${hash} failed: ${JSON.stringify(failure.Failure)}`), { txHash: hash });
  return { txHash: hash, outcome };
}
