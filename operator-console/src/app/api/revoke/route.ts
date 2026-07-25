import { gatewayOperatorPost } from "@/lib/gateway";

// Forwards a revoke to the gateway with the operator key attached server-side.
// The gateway's status (401/503/200) is passed straight back to the caller.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await gatewayOperatorPost("/revoke", body);
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
