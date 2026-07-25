import { gatewayOperatorPost } from "@/lib/gateway";

// Cap edit. Same pattern as revoke/restore: the browser POSTs here same-origin,
// and the operator key is attached server-side before forwarding to the gateway,
// so the secret never reaches client code.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const res = await gatewayOperatorPost(
    `/agents/${encodeURIComponent(id)}/cap`,
    body,
  );
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
