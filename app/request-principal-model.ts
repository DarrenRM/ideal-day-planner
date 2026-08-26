export const VERCEL_GATEWAY_AUTH_HEADER = "x-ideal-day-gateway-authorization";
export const VERCEL_GATEWAY_PRINCIPAL_HEADER = "x-ideal-day-principal-id";

export type RequestPrincipal = {
  userId: string;
  source: "sites" | "vercel" | "local";
};

export function constantTimeTextEqual(expected: string, supplied: string) {
  let difference = expected.length ^ supplied.length;
  const length = Math.max(expected.length, supplied.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (supplied.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function trustedGatewayPrincipal(input: {
  authorization: string | null;
  principalId: string | null;
  expectedToken: string;
  allowedUserIds: string[];
}): RequestPrincipal | null {
  const suppliedToken = input.authorization?.startsWith("Bearer ")
    ? input.authorization.slice(7).trim()
    : "";
  const principalId = input.principalId?.trim() || "";
  if (!input.expectedToken || !suppliedToken || !constantTimeTextEqual(input.expectedToken, suppliedToken)) return null;
  if (!principalId || !input.allowedUserIds.includes(principalId)) return null;
  return { userId: principalId, source: "vercel" };
}
