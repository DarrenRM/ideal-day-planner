import { localDateInTimeZone } from "../../../schedule-model";
import { parseOnboardingAnswers, parseOnboardingProposal, type OnboardingStage } from "../../../onboarding-model";
import { ensureAgentSchema } from "../../agent-store";
import { requestPrincipal } from "../../request-identity";
import { buildFallbackProposal, confirmTestingProposal, queueOnboardingProposal, readTestingDay, readTestingSession, resetTestingOnboarding, testingOnboardingUserId, toggleTestingItem, updateTestingStage } from "../../onboarding-testing-store";
import { getD1 } from "../../../../db";

function requestedDate(request: Request, payload?: Record<string, unknown>) { const supplied = typeof payload?.date === "string" ? payload.date : new URL(request.url).searchParams.get("date"); return supplied && /^\d{4}-\d{2}-\d{2}$/.test(supplied) ? supplied : localDateInTimeZone(new Date(), "America/Phoenix"); }

async function responseState(ownerUserId: string, date: string, direct: boolean) {
  const target = { direct }; const session = await readTestingSession(ownerUserId, target); const userId = testingOnboardingUserId(ownerUserId, target);
  const latestJob = session.stage === "preparing" ? await getD1().prepare("SELECT status, progress_title AS progressTitle, progress_detail AS progressDetail, error, created_at AS createdAt FROM agent_jobs WHERE user_id = ? AND kind = 'onboarding_proposal' ORDER BY created_at DESC LIMIT 1").bind(userId).first<{ status: string; progressTitle: string | null; progressDetail: string | null; error: string | null; createdAt: string }>() : null;
  return { testing: !direct, date, session, job: latestJob, items: session.stage === "active" ? await readTestingDay(ownerUserId, session.confirmationDate || date, target) : [] };
}

function errorResponse(error: unknown) { const message = error instanceof Error ? error.message : "The onboarding test could not be updated."; return Response.json({ error: message }, { status: 400 }); }
function validNextStage(value: unknown): OnboardingStage | null { return ["welcome", "priorities", "friction", "rhythm", "coaching", "proposal"].includes(value as string) ? value as OnboardingStage : null; }

export async function GET(request: Request) {
  const principal = requestPrincipal(request); if (!principal) return Response.json({ error: "Sign in to begin onboarding." }, { status: 401 });
  const direct = principal.source === "vercel";
  try { await ensureAgentSchema(); return Response.json(await responseState(principal.userId, requestedDate(request), direct)); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const principal = requestPrincipal(request); if (!principal) return Response.json({ error: "Sign in to begin onboarding." }, { status: 401 });
  const ownerUserId = principal.userId; const direct = principal.source === "vercel"; const target = { direct };
  try {
    await ensureAgentSchema(); const payload = await request.json() as Record<string, unknown>; const mode = typeof payload.mode === "string" ? payload.mode : ""; const date = requestedDate(request, payload);
    if (mode === "reset") { await resetTestingOnboarding(ownerUserId, target); return Response.json(await responseState(ownerUserId, date, direct)); }
    const session = await readTestingSession(ownerUserId, target);
    if (mode === "begin") await updateTestingStage(ownerUserId, { stage: "priorities" }, target);
    else if (mode === "save_answers") {
      const answers = parseOnboardingAnswers(payload.answers); const stage = validNextStage(payload.stage);
      if (!answers || !stage) return Response.json({ error: "Those onboarding choices are not valid." }, { status: 400 });
      if (["friction", "rhythm", "coaching", "proposal"].includes(stage) && !answers.priorities.length) return Response.json({ error: "Choose at least one priority." }, { status: 400 });
      if (["rhythm", "coaching", "proposal"].includes(stage) && !answers.frictions.length) return Response.json({ error: "Choose what usually gets in the way, or choose nothing obvious." }, { status: 400 });
      if (["coaching", "proposal"].includes(stage) && !answers.rhythms.length) return Response.json({ error: "Choose at least one helpful rhythm." }, { status: 400 });
      await updateTestingStage(ownerUserId, { stage, answers }, target);
    } else if (mode === "back") {
      const stage = validNextStage(payload.stage) || "welcome"; await updateTestingStage(ownerUserId, { stage }, target);
    } else if (mode === "generate") {
      const answers = parseOnboardingAnswers(payload.answers);
      if (!answers?.capacity || !answers.priorities.length || !answers.frictions.length || !answers.rhythms.length) return Response.json({ error: "Finish the four onboarding questions first." }, { status: 400 });
      await queueOnboardingProposal(ownerUserId, { answers }, target);
    } else if (mode === "revise") {
      if (!session.capacity || !session.proposal) return Response.json({ error: "There is not a proposal to revise yet." }, { status: 409 });
      const instruction = typeof payload.instruction === "string" ? payload.instruction.trim().slice(0, 800) : ""; const currentProposal = parseOnboardingProposal(payload.proposal, session.capacity);
      if (instruction.length < 3 || !currentProposal) return Response.json({ error: "Describe the change you want Luna to make." }, { status: 400 });
      await queueOnboardingProposal(ownerUserId, { answers: session.answers, revisionRequest: instruction, currentProposal }, target);
    } else if (mode === "fallback") await buildFallbackProposal(ownerUserId, target);
    else if (mode === "confirm") {
      if (session.stage === "active") return Response.json(await responseState(ownerUserId, session.confirmationDate || date, direct));
      await confirmTestingProposal(ownerUserId, date, payload.proposal, target);
    } else if (mode === "toggle") {
      const itemId = typeof payload.itemId === "string" ? payload.itemId.slice(0, 260) : ""; if (!itemId) return Response.json({ error: "Choose an activity first." }, { status: 400 });
      await toggleTestingItem(ownerUserId, session.confirmationDate || date, itemId, payload.completed === true, target);
    } else return Response.json({ error: "That onboarding test action is not supported." }, { status: 400 });
    return Response.json(await responseState(ownerUserId, date, direct));
  } catch (error) { return errorResponse(error); }
}
