import type { NextRequest } from "next/server";

import { gatewayGet } from "@/lib/gateway";

// Proxies the audit snapshot + chain-integrity check. This is a read (no operator
// key), fetched on page load and on manual re-verify — never per event, since the
// live feed comes over the WebSocket. Verifying the whole chain is O(rows) by
// design, so keeping it off the per-event path is deliberate.
export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") ?? "100";
  const res = await gatewayGet(`/audit?limit=${encodeURIComponent(limit)}`);
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
