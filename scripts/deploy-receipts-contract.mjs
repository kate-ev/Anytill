// Deploys contract/ (receipt anchors) to receipts.<signer> on NEAR testnet in ONE transaction:
// create sub-account → fund → add the signer's key → deploy wasm → new({ owner: signer }).
// Usage: ANCHOR_SIGNER=you.testnet node scripts/deploy-receipts-contract.mjs
// The key is read from ~/.near-credentials/testnet/<signer>.json (NEAR CLI legacy keychain) and never copied.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { NEAR, actions, loadKey, rpc, signAndSend, view } from "../app/lib/near-tx.mjs";

const RPC = process.env.NEAR_TESTNET_RPC || "https://rpc.testnet.near.org";
const signer = process.env.ANCHOR_SIGNER || "anytill-hk1113.testnet";
const contractId = process.env.ANCHOR_CONTRACT || `receipts.${signer}`;
const key = loadKey({ file: process.env.ANCHOR_KEY_FILE || `${homedir()}/.near-credentials/testnet/${signer}.json`, accountId: signer });
const wasm = readFileSync(new URL("../contract/target/near/anytill_receipts.wasm", import.meta.url));

const exists = await rpc(RPC, "query", { request_type: "view_account", finality: "final", account_id: contractId }).then(() => true, () => false);
const actionList = exists
  ? [actions.deployContract(wasm)]
  : [
      actions.createAccount(),
      actions.transfer(3n * NEAR),
      actions.addFullAccessKey(key.publicKey),
      actions.deployContract(wasm),
      actions.functionCall("new", { owner: signer }, 30_000_000_000_000n),
    ];
console.log(`${exists ? "Redeploying" : "Creating and deploying"} ${contractId} (${wasm.length} bytes) signed by ${signer} …`);
const { txHash } = await signAndSend({ rpcUrl: RPC, key, receiverId: contractId, actionList });
console.log(`tx ${txHash}\n   https://testnet.nearblocks.io/txns/${txHash}`);
console.log("owner():", await view(RPC, contractId, "owner"), " count():", await view(RPC, contractId, "count"));
