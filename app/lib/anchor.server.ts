// Anchors the SHA-256 of each verified receipt on NEAR (contract/), after the order is marked paid.
// Off unless ANCHOR_CONTRACT is set. The signing key comes from ANCHOR_PRIVATE_KEY (hosting) or a NEAR CLI
// key file (ANCHOR_KEY_FILE, default ~/.near-credentials/<network>/<signer>.json). Never from the repo.

import { homedir } from "node:os";
import prisma from "../db.server";
// @ts-expect-error plain ESM helper without type declarations
import { MAINNET_RPCS, TESTNET_RPCS, actions, loadKey, signAndSend } from "./near-tx.mjs";
// @ts-expect-error plain ESM helper without type declarations
import { receiptHash } from "./receipt-canonical.mjs";

export const anchorConfig = {
  get contract() { return process.env.ANCHOR_CONTRACT || ""; },
  get signer() { return process.env.ANCHOR_SIGNER || ""; },
  get network() { return process.env.ANCHOR_NETWORK || "testnet"; },
  get rpc(): string[] { return process.env.ANCHOR_RPC ? process.env.ANCHOR_RPC.split(",") : this.network === "mainnet" ? MAINNET_RPCS : TESTNET_RPCS; },
  get explorer() { return this.network === "mainnet" ? "https://nearblocks.io/txns/" : "https://testnet.nearblocks.io/txns/"; },
  get enabled() { return !!(this.contract && this.signer); },
};

export async function anchorReceipt(paymentId: string, receipt: Record<string, unknown>): Promise<void> {
  if (!anchorConfig.enabled) return;
  const hash: string = await receiptHash(receipt);
  // Claim: only one process anchors a given receipt.
  const claim = await prisma.payment.updateMany({ where: { id: paymentId, anchorHash: null }, data: { anchorHash: hash } });
  if (claim.count === 0) return;
  try {
    const key = loadKey({
      secret: process.env.ANCHOR_PRIVATE_KEY,
      file: process.env.ANCHOR_PRIVATE_KEY ? undefined : process.env.ANCHOR_KEY_FILE || `${homedir()}/.near-credentials/${anchorConfig.network}/${anchorConfig.signer}.json`,
      accountId: anchorConfig.signer,
    });
    const { txHash } = await signAndSend({
      rpcUrl: anchorConfig.rpc,
      key,
      receiverId: anchorConfig.contract,
      actionList: [actions.functionCall("anchor", { receipt_id: paymentId, hash }, 10_000_000_000_000n)],
    });
    await prisma.payment.update({ where: { id: paymentId }, data: { anchorTx: txHash } });
    await prisma.paymentEvent.create({ data: { paymentId, kind: "anchored", detail: `receipt sha256 ${hash.slice(0, 16)}… anchored on NEAR ${anchorConfig.network} in ${txHash}` } });
  } catch (e) {
    await prisma.payment.update({ where: { id: paymentId }, data: { anchorHash: null } });
    await prisma.paymentEvent.create({ data: { paymentId, kind: "anchor_failed", detail: (e as Error).message.slice(0, 300) } });
  }
}
