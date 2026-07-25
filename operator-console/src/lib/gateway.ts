// Server-side gateway access. This module is imported only by route handlers,
// which always run on the server, so the operator key read here is never bundled
// into client JavaScript. That is the whole reason mutations are proxied rather
// than sent from the browser: a shared secret shipped to the client would be
// readable by anyone with devtools, undoing the auth the gateway enforces.

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8001";
const OPERATOR_KEY = process.env.AEGIS_OPERATOR_KEY ?? "aegis_dev_operator_key";
const OPERATOR_KEY_HEADER = "X-Aegis-Operator-Key";

export async function gatewayGet(path: string): Promise<Response> {
  return fetch(`${GATEWAY_URL}${path}`, { cache: "no-store" });
}

export async function gatewayOperatorPost(
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [OPERATOR_KEY_HEADER]: OPERATOR_KEY,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
