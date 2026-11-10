import { PaymentError } from "./payments.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function json(data: unknown, init: number | ResponseInit = 200) {
  const base = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(data), {
    ...base,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...(base.headers as Record<string, string>) },
  });
}

export function preflight(request: Request) {
  return request.method === "OPTIONS" ? new Response(null, { status: 204, headers: CORS }) : null;
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof PaymentError) return json({ error: e.message, code: e.code }, e.httpStatus);
    console.error(e);
    return json({ error: "Something went wrong on our side. Your funds are safe; try again.", code: "internal" }, 500);
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
