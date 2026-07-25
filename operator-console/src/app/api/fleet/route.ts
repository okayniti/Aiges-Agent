import { gatewayGet } from "@/lib/gateway";

// Snapshot of fleet state, proxied so the browser stays same-origin. This is
// fetched once on page load; live updates after that come over the WebSocket, not
// by re-polling this route.
export async function GET() {
  const res = await gatewayGet("/fleet");
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
