import { useEffect, useState } from "preact/hooks";

// Asks the Anytill server (authenticated with the checkout session token) for this order's pay link.
// The server reads the amount from the Admin API; nothing here sets a price.
export function PayBlock({ orderId }) {
  const [state, setState] = useState({ kind: "loading" });
  const appUrl = (shopify.settings.value.app_url || "").replace(/\/$/, "");

  useEffect(() => {
    if (!orderId || !appUrl) {
      setState({ kind: "hidden" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await shopify.sessionToken.get();
        const res = await fetch(`${appUrl}/api/checkout/session`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.payUrl) setState({ kind: body.status === "paid" ? "paid" : "ready", payUrl: body.payUrl });
        else if (body.code === "not_crypto_order" || body.code === "order_paid") setState({ kind: "hidden" });
        else setState({ kind: "error", message: body.error || "Crypto checkout is unavailable right now." });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Couldn't reach crypto checkout. Refresh to try again." });
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, appUrl]);

  if (state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return <s-banner heading="Pay with any crypto"><s-spinner accessibilityLabel="Preparing crypto payment" /></s-banner>;
  }
  if (state.kind === "error") {
    return <s-banner tone="critical" heading="Pay with any crypto">{state.message}</s-banner>;
  }
  if (state.kind === "paid") {
    return <s-banner tone="success" heading="Paid in crypto">Your payment was verified on NEAR.</s-banner>;
  }
  return (
    <s-banner heading="Complete your payment">
      <s-stack gap="base">
        <s-text>Pay with USDC, ETH, SOL, BTC or NEAR from any chain. Your order ships once the payment settles.</s-text>
        <s-button variant="primary" href={state.payUrl} target="_blank">Pay with any crypto</s-button>
      </s-stack>
    </s-banner>
  );
}
