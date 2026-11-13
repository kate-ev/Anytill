// Keyless receipt check against the NEAR chain.
//   node scripts/verify-receipt.mjs docs/anchored-receipts/<id>.json
//   node scripts/verify-receipt.mjs https://<anytill-host>/r/<id>
// Exit code 0 = matches the on-chain anchor, 1 = altered or not anchored.
import { readFileSync } from "node:fs";
import { TESTNET_RPCS, view } from "../app/lib/near-tx.mjs";
import { receiptHash } from "../app/lib/receipt-canonical.mjs";

const RPC = process.env.ANCHOR_RPC?.split(",") || TESTNET_RPCS;
const CONTRACT = process.env.ANCHOR_CONTRACT || "receipts.anytill-hk1113.testnet";
const arg = process.argv[2];
if (!arg) { console.error("usage: node scripts/verify-receipt.mjs <receipt.json | receipt URL>"); process.exit(2); }

let receipt;
if (/^https?:/.test(arg)) {
  const u = new URL(arg);
  const id = u.pathname.split("/").filter(Boolean).pop();
  receipt = await (await fetch(`${u.origin}/api/v1/payments/${id}/receipt`)).json();
} else {
  receipt = JSON.parse(readFileSync(arg, "utf8"));
}
const local = await receiptHash(receipt);
const onChain = await view(RPC, CONTRACT, "get_anchor", { receipt_id: receipt.id });
console.log(`receipt   ${receipt.id}  (${receipt.order}, ${receipt.orderAmount}, ${receipt.merchant})`);
console.log(`local     sha256 ${local}`);
console.log(`on chain  sha256 ${onChain?.hash ?? "(not anchored)"}  ${onChain ? `block ${onChain.block_height}` : ""}  [${CONTRACT}]`);
const ok = onChain?.hash === local;
console.log(ok ? "MATCH: this receipt is exactly what was anchored on NEAR." : onChain ? "MISMATCH: this receipt was altered after anchoring." : "NOT ANCHORED");
process.exit(ok ? 0 : 1);
