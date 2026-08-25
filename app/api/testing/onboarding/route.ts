import { localDateInTimeZone } from "../../../schedule-model";
import { parseOnboardingCapacity, parseOnboardingProposal } from "../../../onboarding-model";
import { ensureAgentSchema, requestIdentity } from "../../agent-store";
import {
  activateTestingItem,
  confirmTestingProposal,
  queueOnboardingProposal,
  readTestingDay,
  readTestingSession,
  resetTestingOnboarding,
  testingOnboardingUserId,
  toggleTestingItem,
  updateTestingStage,
  buildFallbackProposal,
} from "../../onboarding-testing-store";
import { getD1 } from "../../../../db";

function requestedDate(request: Request, payload?: Record<string, unknown>) {
  const supplied = typeof payload?.date === "string" ? payload.date : new URL(request.url).searchParams.get("date");
  return supplied && /^\d{4}-\d{2}-\d{2}$/.test(supplied)
    ? supplied
    : localDateInTimeZone(new Date(), "America/Phoenix");
}

async function responseState(ownerUserId: string, date: string) {
  const session = await readTestingSession(ownerUserId);
  const userId = testingOnboardingUserId(ownerUserId);
  const latestJob = session.stage === "preparing"
    ? await getD1().prepare(`
        SELECT status, progress_title AS progressTitle, progress_detail AS progressDetail,
               error, created_at AS createdAt
        FROM agent_jobs WHERE user_id = ? AND kind = 'onboarding_proposal'
        ORDER BY created_at DESC LIMIT 1
      `).bind(userId).first<{
        status: string;
        progressTitle: string | null;
        progressDetail: string | null;
        error: string | null;
        createdAt: string;
      }>()
    : null;
  return {
    testing: true,
    date,
    session,
    job: latestJob,
    items: session.stage === "active" ? await readTestingDay(ownerUserId, session.confirmationDate || date) : [],
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "The onboarding test could not be updated.";
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const ownerUserId = requestIdentity(request);
  if (!ownerUserId) return Response.json({ error: "Sign in to use the onboarding sandbox." }, { status: 401 });
  try {
    await ensureAgentSchema();
    return Response.json(await responseState(ownerUserId, requestedDate(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const ownerUserId = requestIdentity(request);
  if (!ownerUserId) return Response.json({ error: "Sign in to use the onboarding sandbox." }, { status: 401 });
  try {
    await ensureAgentSchema();
    const payload = await request.json() as Record<string, unknown>;
    const mode = typeof payload.mode === "string" ? payload.mode : "";
    const date = requestedDate(request, payload);

    if (mode === "reset") {
      await resetTestingOnboarding(ownerUserId);
      return Response.json(await responseState(ownerUserId, date));
    }

    const session = await readTestingSession(ownerUserId);
    if (mode === "show_goals") {
      await updateTestingStage(ownerUserId, { stage: "goals" });
    } else if (mode === "save_goals") {
      const goals = typeof payload.goals === "string" ? payload.goals.trim().slice(0, 1200) : "";
      if (goals.length < 8) return Response.json({ error: "Tell Luna a little more about what you want from your days." }, { status: 400 });
      await updateTestingStage(ownerUserId, { stage: "capacity", goals });
    } else if (mode === "back") {
      const stage = payload.stage === "goals" || payload.stage === "capacity" || payload.stage === "proposal" ? payload.stage : "welcome";
      await updateTestingStage(ownerUserId, { stage });
    } else if (mode === "generate") {
      const capacity = parseOnboardingCapacity(payload.capacity);
      if (!capacity || !session.goals.trim()) return Response.json({ error: "Goals and a starting pace are required." }, { status: 400 });
      await queueOnboardingProposal(ownerUserId, { goals: session.goals, capacity });
    } else if (mode === "revise") {
      if (!session.capacity || !session.proposal) return Response.json({ error: "There is not a proposal to revise yet." }, { status: 409 });
      const instruction = typeof payload.instruction === "string" ? payload.instruction.trim().slice(0, 800) : "";
      const currentProposal = parseOnboardingProposal(payload.proposal, session.capacity);
      if (instruction.length < 3 || !currentProposal) return Response.json({ error: "Describe the change you want Luna to make." }, { status: 400 });
      await queueOnboardingProposal(ownerUserId, {
        goals: session.goals,
        capacity: session.capacity,
        revisionRequest: instruction,
        currentProposal,
      });
    } else if (mode === "fallback") {
      await buildFallbackProposal(ownerUserId);
    } else if (mode === "confirm") {
      if (session.stage === "active") return Response.json(await responseState(ownerUserId, session.confirmationDate || date));
      await confirmTestingProposal(ownerUserId, date, payload.proposal);
    } else if (mode === "toggle") {
      const itemId = typeof payload.itemId === "string" ? payload.itemId.slice(0, 260) : "";
      if (!itemId) return Response.json({ error: "Choose an activity first." }, { status: 400 });
      await toggleTestingItem(ownerUserId, session.confirmationDate || date, itemId, payload.completed === true);
    } else if (mode === "activate") {
      const itemId = typeof payload.itemId === "string" ? payload.itemId.slice(0, 260) : "";
      if (!itemId) return Response.json({ error: "Choose a stretch goal first." }, { status: 400 });
      await activateTestingItem(ownerUserId, session.confirmationDate || date, itemId);
    } else {
      return Response.json({ error: "That onboarding test action is not supported." }, { status: 400 });
    }
    return Response.json(await responseState(ownerUserId, date));
  } catch (error) {
    return errorResponse(error);
  }
}
