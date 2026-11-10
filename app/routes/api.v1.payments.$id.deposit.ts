import type { ActionFunctionArgs } from "react-router";
import { body, handle, preflight } from "../lib/http.server";
import { PaymentError, getPayment, publicView, simulateDeposit, submitDepositTx } from "../lib/payments.server";

// { txHash } after a wallet transfer (forwarded to 1Click to speed things up), or { simulate: true } in demo mode.
export const loader = ({ request }: { request: Request }) => preflight(request) ?? new Response(null, { status: 405 });
export const action = async ({ request, params }: ActionFunctionArgs) =>
  preflight(request) ??
  handle(async () => {
    const b = await body(request);
    if (b.simulate) await simulateDeposit(params.id!);
    else if (typeof b.txHash === "string" && b.txHash.length < 200) await submitDepositTx(params.id!, b.txHash);
    else throw new PaymentError("txHash required", "tx_hash");
    return publicView(await getPayment(params.id!));
  });
