import type { LoaderFunctionArgs } from "react-router";
import { handle, preflight } from "../lib/http.server";
import { getPayment, receiptOf } from "../lib/payments.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) =>
  preflight(request) ?? handle(async () => receiptOf(await getPayment(params.id!)));
