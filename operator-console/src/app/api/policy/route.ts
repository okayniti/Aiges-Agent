import { gatewayGet } from "@/lib/gateway";

// Read-only policy view proxied same-origin. The gateway sources permissions from
// OPA's live data, so this reflects what is actually enforced. No operator key —
// it is a read.
export async function GET() {
  const res = await gatewayGet("/policy");
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
