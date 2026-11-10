import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { PayBlock } from "./PayBlock.jsx";

export default async () => {
  render(<PayBlock orderId={shopify.order.value?.id} />, document.body);
};
