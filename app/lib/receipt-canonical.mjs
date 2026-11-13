// The exact bytes Anytill anchors on NEAR for a receipt. Shared by the server, the /verify page (in the
// browser) and scripts/verify-receipt.mjs, so all three compute the same SHA-256.
//
// Canonical form: JSON of the fields below, object keys sorted recursively, no whitespace.
// The anchor block itself is excluded (it is added after hashing).

export const HASHED_FIELDS = ["id", "mode", "status", "merchant", "recipient", "order", "orderAmount", "paid", "received", "spread", "stages", "proofTx", "checksPassed", "quoteSource"];

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

export function canonicalReceipt(receipt) {
  const picked = {};
  for (const k of HASHED_FIELDS) picked[k] = receipt[k] ?? null;
  return JSON.stringify(sortKeys(picked));
}

export async function receiptHash(receipt) {
  const bytes = new TextEncoder().encode(canonicalReceipt(receipt));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
