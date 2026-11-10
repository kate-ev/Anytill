import { expect, test } from "@playwright/test";
import { USDC_NEAR } from "../../app/lib/assets";
import type { StatusResponse } from "../../app/lib/oneclick.server";
import { parseFtTransferLogs, verifySettlement, type ChainReader, type FtTransferEvent, type IssuedQuote } from "../../app/lib/settlement.server";

const issued: IssuedQuote = {
  depositAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  signature: "ed25519:3mU2eTLcUwftvRkN4ab2voD1EHpaZGhbpM5BbEmGes7iSGq7",
  recipient: "lagos-leather.near",
  amountOutAtomic: "48000000",
  originAsset: "nep141:sol.omft.near",
};

function status(over: { status?: StatusResponse["status"]; recipient?: string; dest?: string; amountOut?: string; signature?: string; deposit?: string; swapType?: "EXACT_OUTPUT" | "EXACT_INPUT"; amount?: string } = {}): StatusResponse {
  return {
    correlationId: "t",
    status: over.status ?? "SUCCESS",
    updatedAt: "2026-11-10T00:00:00Z",
    quoteResponse: {
      correlationId: "t",
      timestamp: "2026-11-10T00:00:00Z",
      signature: over.signature ?? issued.signature,
      quoteRequest: {
        dry: false, swapType: over.swapType ?? "EXACT_OUTPUT", slippageTolerance: 100, originAsset: issued.originAsset, depositType: "ORIGIN_CHAIN",
        destinationAsset: over.dest ?? USDC_NEAR.assetId, amount: over.amount ?? "48000000", refundTo: "9xQe", refundType: "ORIGIN_CHAIN",
        recipient: over.recipient ?? issued.recipient, recipientType: "DESTINATION_CHAIN", deadline: "2026-11-10T01:00:00Z",
      },
      quote: { depositAddress: over.deposit ?? issued.depositAddress, amountIn: "577142683", amountInFormatted: "0.577142683", amountInUsd: "48.5", minAmountIn: "1", amountOut: "48000000", amountOutFormatted: "48", amountOutUsd: "48", minAmountOut: "48000000", timeEstimate: 20 },
    },
    swapDetails: {
      intentHashes: [], nearTxHashes: ["TXA"], amountOut: over.amountOut ?? "48000000",
      originChainTxHashes: [], destinationChainTxHashes: [{ hash: "TXA", explorerUrl: "" }],
    },
  };
}

const chain = (events: Partial<FtTransferEvent>[]): ChainReader => ({
  ftTransfers: async () => events.map((e) => ({ txHash: "TXA", contract: USDC_NEAR.contract, oldOwner: "intents.near", newOwner: issued.recipient, amount: "48000000", ...e })),
});

test.describe("settlement verification", () => {
  test("passes only when 1Click status, the issued quote and the NEAR receipt all agree", async () => {
    const v = await verifySettlement(issued, status(), chain([{}]));
    expect(v.ok).toBe(true);
    expect(v.checks).toHaveLength(8);
    expect(v.proofTx).toBe("TXA");
  });

  const tampered: [string, Parameters<typeof status>[0], string][] = [
    ["not finished", { status: "PROCESSING" }, "status"],
    ["recipient swapped to an attacker", { recipient: "attacker.near" }, "recipient"],
    ["paid out in another asset", { dest: "nep141:wrap.near" }, "asset"],
    ["a different quote (signature mismatch)", { signature: "ed25519:forged" }, "signature"],
    ["a different deposit address", { deposit: "SomeoneElsesAddress111111111111111" }, "deposit"],
    ["delivered less than the order", { amountOut: "47999999" }, "amountOut"],
    ["EXACT_INPUT instead of EXACT_OUTPUT", { swapType: "EXACT_INPUT" }, "exact"],
    ["quote for a smaller amount", { amount: "1000000" }, "exact"],
  ];
  for (const [name, over, failing] of tampered) {
    test(`rejects: ${name}`, async () => {
      const v = await verifySettlement(issued, status(over), chain([{}]));
      expect(v.ok).toBe(false);
      expect(v.checks.find((c) => c.id === failing)?.ok).toBe(false);
    });
  }

  test("rejects when the NEAR receipt shows USDC going to someone else", async () => {
    const v = await verifySettlement(issued, status(), chain([{ newOwner: "attacker.near" }]));
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "onchain")?.ok).toBe(false);
  });

  test("rejects a fake token contract that mimics USDC", async () => {
    const v = await verifySettlement(issued, status(), chain([{ contract: "fake-usdc.near" }]));
    expect(v.ok).toBe(false);
  });

  test("rejects when the on-chain amount is short", async () => {
    const v = await verifySettlement(issued, status(), chain([{ amount: "40000000" }]));
    expect(v.ok).toBe(false);
  });

  test("sums split transfers to the merchant", async () => {
    const v = await verifySettlement(issued, status(), chain([{ amount: "30000000" }, { amount: "18000000" }]));
    expect(v.ok).toBe(true);
  });

  test("an RPC outage never marks an order paid", async () => {
    const down: ChainReader = { ftTransfers: async () => { throw new Error("timeout"); } };
    const v = await verifySettlement(issued, status(), down);
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === "onchain")?.detail).toContain("RPC error");
  });

  test("parses NEP-141 ft_transfer events from receipt logs", () => {
    const logs = [
      "some text log",
      'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"intents.near","new_owner_id":"lagos-leather.near","amount":"48000000"}]}',
      'EVENT_JSON:{"standard":"nep245","event":"mt_transfer","data":[]}',
    ];
    expect(parseFtTransferLogs("TX", USDC_NEAR.contract, logs)).toEqual([
      { txHash: "TX", contract: USDC_NEAR.contract, oldOwner: "intents.near", newOwner: "lagos-leather.near", amount: "48000000" },
    ]);
  });
});
