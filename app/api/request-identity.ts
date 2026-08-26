import { env } from "cloudflare:workers";
import {
  VERCEL_GATEWAY_AUTH_HEADER,
  VERCEL_GATEWAY_PRINCIPAL_HEADER,
  trustedGatewayPrincipal,
  type RequestPrincipal,
} from "../request-principal-model";

type IdentityEnv = typeof env & {
  IDEAL_DAY_VERCEL_GATEWAY_TOKEN?: string;
  IDEAL_DAY_VERCEL_USER_IDS?: string;
};

function gatewayPrincipal(request: Request) {
  const gatewayAuthorization = request.headers.get(VERCEL_GATEWAY_AUTH_HEADER);
  const gatewayPrincipalId = request.headers.get(VERCEL_GATEWAY_PRINCIPAL_HEADER);
  if (!gatewayAuthorization && !gatewayPrincipalId) return { supplied: false, principal: null };

  const runtime = env as IdentityEnv;
  const allowedUserIds = (runtime.IDEAL_DAY_VERCEL_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    supplied: true,
    principal: trustedGatewayPrincipal({
      authorization: gatewayAuthorization,
      principalId: gatewayPrincipalId,
      expectedToken: (runtime.IDEAL_DAY_VERCEL_GATEWAY_TOKEN || "").trim(),
      allowedUserIds,
    }),
  };
}

export function requestPrincipal(request: Request): RequestPrincipal | null {
  const gateway = gatewayPrincipal(request);
  if (gateway.supplied) return gateway.principal;

  const sitesUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (sitesUserId) return { userId: sitesUserId, source: "sites" };

  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1"
    ? { userId: "local-development-user", source: "local" }
    : null;
}

export function requestIdentity(request: Request) {
  return requestPrincipal(request)?.userId ?? null;
}
