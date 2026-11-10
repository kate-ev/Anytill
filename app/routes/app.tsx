import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { config } from "../lib/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Demo mode without Shopify keys: show the admin for the seeded demo merchant, outside Shopify.
  if (config.mode === "demo" && !config.shopifyConfigured) return { apiKey: "", demo: true };
  const { authenticate } = await import("../shopify.server");
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "", demo: false };
};

export default function App() {
  const { apiKey, demo } = useLoaderData<typeof loader>();
  if (demo) {
    return (
      <>
        <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
        <Outlet />
      </>
    );
  }
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Crypto checkout</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
