import assert from "node:assert/strict";
import test from "node:test";
import { constantTimeTextEqual, trustedGatewayPrincipal } from "../app/request-principal-model.ts";

test("accepts only a trusted, allowlisted Vercel principal", () => {
  const input = { authorization: "Bearer gateway-secret", principalId: "vercel-user-a", expectedToken: "gateway-secret", allowedUserIds: ["vercel-user-a", "vercel-user-b"] };
  assert.deepEqual(trustedGatewayPrincipal(input), { userId: "vercel-user-a", source: "vercel" });
  assert.equal(trustedGatewayPrincipal({ ...input, authorization: "Bearer wrong" }), null);
  assert.equal(trustedGatewayPrincipal({ ...input, principalId: "sites-owner" }), null);
});

test("constant-time text comparison handles unequal values and lengths", () => {
  assert.equal(constantTimeTextEqual("same", "same"), true);
  assert.equal(constantTimeTextEqual("same", "diff"), false);
  assert.equal(constantTimeTextEqual("short", "longer"), false);
});
