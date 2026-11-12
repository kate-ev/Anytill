// Runs once after the web server is up and before any browser test: loads each route, the widget
// bundle and one full API round trip so cold module loading and the first SQLite writes are done.
export default async function warmup() {
  const base = "http://localhost:3311";
  for (const path of ["/", "/demo", "/app", "/widget/anytill.js", "/api/v1/assets"]) {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`warmup ${path} → ${res.status}`);
    await res.arrayBuffer();
  }
  const p = await (await fetch(`${base}/api/v1/payments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchant: "anytill-warmup.near", amount: "1.00", orderRef: `warmup-${Date.now()}` }),
  })).json();
  await fetch(`${base}/api/v1/payments/${p.id}`);
}
