export interface Asset {
  assetId: string;
  symbol: string;
  chain: string;
  chainName: string;
  color: string;
  decimals: number;
  addressHint: string;
  tokenAddress?: string;
  evmChainId: number | null;
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface PaymentView {
  id: string;
  mode: "demo" | "live";
  merchant: { name: string; account: string };
  order: { name: string; amountCents: number; amount: string };
  status: string;
  quote: null | {
    source: string | null;
    originAsset: string;
    symbol: string;
    chain: string;
    chainName: string;
    decimals: number;
    tokenAddress: string | null;
    evmChainId: number | null;
    amountIn: string;
    amountInDisplay: string;
    depositAddress: string;
    depositMemo: string | null;
    refundTo: string | null;
    deadline: string | null;
    timeEstimateSec: number | null;
  };
  refunded: null | { amount: string | null; reason: string | null; to: string | null };
  settledInSec: number | null;
  proofTx: string | null;
  checks: Check[] | null;
}
