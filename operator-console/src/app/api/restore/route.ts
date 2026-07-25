import { gatewayOperatorPost } from "@/lib/gateway";

// Forwards a restore to the gateway with the operator key attached server-side.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await gatewayOperatorPost("/restore", body);
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
