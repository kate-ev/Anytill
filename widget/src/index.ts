export { IntentsCheckout } from "./intents-checkout";

// One-script-tag install: <script src=".../anytill.js" data-merchant="you.near" data-amount="48.00" data-order-ref="A-1001"></script>
const tag = document.currentScript as HTMLScriptElement | null;
if (tag?.dataset.merchant) {
  const el = document.createElement("intents-checkout");
  el.setAttribute("api", new URL(tag.src).origin);
  el.setAttribute("merchant", tag.dataset.merchant);
  el.setAttribute("amount", tag.dataset.amount ?? "");
  el.setAttribute("order-ref", tag.dataset.orderRef ?? `web-${Date.now().toString(36)}`);
  if (tag.dataset.orderName) el.setAttribute("order-name", tag.dataset.orderName);
  tag.after(el);
}
