import type { ActionFunctionArgs } from "react-router";
import { body, handle, preflight } from "../lib/http.server";
import { publicView, quotePayment } from "../lib/payments.server";

export const loader = ({ request }: { request: Request }) => preflight(request) ?? new Response(null, { status: 405 });
export const action = async ({ request, params }: ActionFunctionArgs) =>
  preflight(request) ??
  handle(async () => {
    const b = await body(request);
    return publicView(await quotePayment(params.id!, { originAsset: String(b.originAsset ?? ""), refundTo: String(b.refundTo ?? "") }));
  });
