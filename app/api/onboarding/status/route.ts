import { ensureAgentSchema } from "../../agent-store";
import { readTestingSession } from "../../onboarding-testing-store";
import { requestPrincipal } from "../../request-identity";

export async function GET(request: Request) {
  const principal = requestPrincipal(request);
  if (!principal || principal.source !== "vercel") return Response.json({ error: "Not found." }, { status: 404 });
  try {
    await ensureAgentSchema();
    const session = await readTestingSession(principal.userId, { direct: true });
    return Response.json({ onboardingRequired: session.stage !== "active", stage: session.stage }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Onboarding status is unavailable." }, { status: 500 });
  }
}
