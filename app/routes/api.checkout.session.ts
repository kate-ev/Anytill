import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { config } from "../lib/config.server";
import { PaymentError, createPayment } from "../lib/payments.server";

// Called by the Thank-you / Order-status checkout extension with a Shopify session token.
// Returns the hosted pay URL for this order. The amount is read from the Admin API, not from the extension.
export const loader = async ({ request }: { request: Request }) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shop = new URL(sessionToken.dest).hostname;
  const b = (await request.json().catch(() => ({}))) as { orderId?: string };
  try {
    if (!b.orderId?.startsWith("gid://shopify/Order") && !b.orderId?.startsWith("gid://shopify/OrderIdentity")) throw new PaymentError("orderId required", "order");
    const orderRef = b.orderId.replace("OrderIdentity", "Order");
    const p = await createPayment({ shop, orderRef });
    return cors(Response.json({ payUrl: `${config.appUrl}/pay/${p.id}`, status: p.status }));
  } catch (e) {
    const err = e as PaymentError;
    return cors(Response.json({ error: err.message, code: err.code ?? "internal" }, { status: err.httpStatus ?? 500 }));
  }
};
