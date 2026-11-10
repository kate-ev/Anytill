import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import site from "../styles/site.css?url";
import { getPayment } from "../lib/payments.server";

// Hosted pay page. Shopify's Thank-you / Order-status extension links buyers here.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: site }];
export const meta: MetaFunction = () => [{ title: "Pay with any crypto" }, { name: "robots", content: "noindex" }];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const p = await getPayment(params.id!).catch(() => null);
  if (!p) throw new Response("Payment not found", { status: 404 });
  return { id: p.id, shop: p.shop.startsWith("site:") || p.shop.endsWith(".local") ? null : p.shop };
};

export default function Pay() {
  const { id, shop } = useLoaderData<typeof loader>();
  return (
    <main className="pay-page">
      <div>
        {shop ? <a className="back" href={`https://${shop}`}>← Back to the store</a> : null}
        <intents-checkout payment-id={id} />
      </div>
      <script type="module" src="/widget/anytill.js" />
    </main>
  );
}
