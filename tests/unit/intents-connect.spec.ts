import { expect, test } from "@playwright/test";
// The exact module the widget lazy-loads for "Pay from wallet".
import { makeTransfer } from "@aurora-is-near/intents-connect-wallet/evm";

// A scripted EIP-1193 wallet: records every request, answers like an injected wallet would.
function wallet(chainIdHex: string) {
  const calls: { method: string; params?: unknown[] }[] = [];
  let chain = chainIdHex;
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId": return chain;
        case "eth_accounts":
        case "eth_requestAccounts": return ["0x8ba1f109551bD432803012645Ac136ddd64DBA72"];
        case "wallet_switchEthereumChain": chain = (params?.[0] as { chainId: string }).chainId; return null;
        case "eth_sendTransaction": return "0x" + "ab".repeat(32);
        default: return null;
      }
    },
  };
  return { provider, calls };
}

const DEPOSIT = "0x1111111111111111111111111111111111111111";

test("Intent Connect sends an ERC-20 transfer of the exact quoted amount to the 1Click deposit address", async () => {
  const w = wallet("0x2105"); // already on Base
  const { hash } = await makeTransfer(
    { amountAtomic: "48489061", decimals: 6, address: DEPOSIT, tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base", evmChainId: 8453, isNativeEvmTokenTransfer: false },
    { provider: w.provider as never },
  );
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  const tx = w.calls.find((c) => c.method === "eth_sendTransaction")!.params![0] as { to: string; data: string };
  expect(tx.to.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"); // USDC on Base
  expect(tx.data.slice(0, 10)).toBe("0xa9059cbb"); // transfer(address,uint256)
  expect(tx.data.slice(34, 74)).toBe(DEPOSIT.slice(2));
  expect(BigInt("0x" + tx.data.slice(74))).toBe(48489061n);
});

test("Intent Connect sends native ETH as a value transfer", async () => {
  const w = wallet("0xa4b1"); // Arbitrum
  await makeTransfer(
    { amountAtomic: "23678349159338315", decimals: 18, address: DEPOSIT, chain: "arb", evmChainId: 42161, isNativeEvmTokenTransfer: true },
    { provider: w.provider as never },
  );
  const tx = w.calls.find((c) => c.method === "eth_sendTransaction")!.params![0] as { to: string; value: string };
  expect(tx.to.toLowerCase()).toBe(DEPOSIT);
  expect(BigInt(tx.value)).toBe(23678349159338315n);
});

test("Intent Connect asks the wallet to switch chains before paying", async () => {
  const w = wallet("0x1"); // wallet on Ethereum, paying on Base
  await makeTransfer(
    { amountAtomic: "1000000", decimals: 6, address: DEPOSIT, tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base", evmChainId: 8453, isNativeEvmTokenTransfer: false },
    { provider: w.provider as never },
  );
  const order = w.calls.map((c) => c.method);
  expect(order).toContain("wallet_switchEthereumChain");
  expect(order.indexOf("wallet_switchEthereumChain")).toBeLessThan(order.indexOf("eth_sendTransaction"));
});
