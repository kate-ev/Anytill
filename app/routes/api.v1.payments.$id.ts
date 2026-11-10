import type { LoaderFunctionArgs } from "react-router";
import { handle, preflight } from "../lib/http.server";
import { getPayment, publicView, refreshPayment, startPoller } from "../lib/payments.server";

// GET polls 1Click, verifies and marks paid if settled, then returns the buyer-safe view.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  startPoller();
  return preflight(request) ?? handle(async () => {
    await getPayment(params.id!);
    return publicView(await refreshPayment(params.id!));
  });
};
