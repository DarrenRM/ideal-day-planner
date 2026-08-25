"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Dumbbell,
  Heart,
  MoreVertical,
  RefreshCw,
  Sparkles,
  Sun,
  Utensils,
  WandSparkles,
  Waves,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnboardingCapacity, OnboardingProposal, OnboardingStage } from "../onboarding-model";

type DayItem = {
  id: string;
  title: string;
  category: string;
  icon: string;
  color: string;
  durationMinutes: number;
  planRole: "essential" | "extra";
  activatedAt: string | null;
  completedAt: string | null;
};

type TestingState = {
  testing: true;
  date: string;
  session: {
    stage: OnboardingStage;
    goals: string;
    capacity: OnboardingCapacity | null;
    proposal: OnboardingProposal | null;
    confirmationDate: string | null;
    error: string | null;
  };
  job: { status: string; progressTitle: string | null; progressDetail: string | null; error: string | null; createdAt: string } | null;
  items: DayItem[];
};

const ICONS = {
  Light: Sun,
  Recharge: Waves,
  Training: Dumbbell,
  Fuel: Utensils,
  Care: Sparkles,
  Logistics: BriefcaseBusiness,
  Creativity: WandSparkles,
  Spirit: Heart,
};

const CAPACITY_COPY: Array<{ id: OnboardingCapacity; title: string; detail: string; count: string }> = [
  { id: "gentle", title: "Start gently", detail: "A light foundation with plenty of room around it.", count: "3–4 essentials" },
  { id: "balanced", title: "Build a balanced day", detail: "Enough structure to feel meaningful without overfilling it.", count: "4–5 essentials" },
  { id: "push", title: "Give me a push", detail: "A fuller starting set for a more ambitious season.", count: "5–6 essentials" },
];

function localDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function ActivityIcon({ category, color }: { category: string; color?: string }) {
  const Icon = ICONS[category as keyof typeof ICONS] || Sparkles;
  return <span className="onboarding-activity-icon" style={{ color: color || undefined }}><Icon size={18} /></span>;
}

function TestingHeader({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <header className="onboarding-header">
      <div>
        <span className="onboarding-kicker">ONBOARDING SANDBOX</span>
        <strong>Ideal Day</strong>
      </div>
      <div className="onboarding-menu-wrap">
        <button className="onboarding-icon-button" type="button" aria-label="More testing options" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreVertical size={20} /></button>
        {open ? <div className="onboarding-menu">
          <button type="button" onClick={() => { setOpen(false); setConfirming(true); }}><RefreshCw size={16} /> Reset onboarding</button>
        </div> : null}
      </div>
      {confirming ? <div className="onboarding-dialog-backdrop" role="presentation">
        <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <button className="onboarding-dialog-close" type="button" aria-label="Close" onClick={() => setConfirming(false)}><X size={19} /></button>
          <span className="onboarding-kicker">TESTING ONLY</span>
          <h2 id="reset-title">Start onboarding over?</h2>
          <p>This deletes only the isolated testing profile. Your real Ideal Day stays untouched.</p>
          <div className="onboarding-dialog-actions">
            <button className="onboarding-secondary" type="button" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="onboarding-primary" type="button" onClick={() => { setConfirming(false); onReset(); }}>Reset testing profile</button>
          </div>
        </section>
      </div> : null}
    </header>
  );
}

function DraftActivity({ activity, index, count, onEdit, onMove }: {
  activity: OnboardingProposal["activities"][number];
  index: number;
  count: number;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return <article className="onboarding-draft-activity">
    <button className="onboarding-activity-main" type="button" onClick={onEdit}>
      <ActivityIcon category={activity.category} />
      <span><strong>{activity.title}</strong><small>{activity.durationMinutes} min · {activity.category}</small></span>
      <ChevronRight size={17} />
    </button>
    <p>{activity.reason}</p>
    <div className="onboarding-order-actions" aria-label={`Reorder ${activity.title}`}>
      <button type="button" disabled={index === 0} aria-label={`Move ${activity.title} up`} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
      <button type="button" disabled={index === count - 1} aria-label={`Move ${activity.title} down`} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
    </div>
  </article>;
}

export default function TestingOnboardingPage() {
  const [state, setState] = useState<TestingState | null>(null);
  const [proposal, setProposal] = useState<OnboardingProposal | null>(null);
  const [goals, setGoals] = useState("");
  const [capacity, setCapacity] = useState<OnboardingCapacity>("balanced");
  const [editing, setEditing] = useState<number | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const date = useMemo(() => localDate(), []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/testing/onboarding?date=${date}`, { cache: "no-store" });
    const payload = await response.json() as TestingState & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Onboarding could not load.");
    setState(payload);
    setProposal(payload.session.proposal);
    setGoals(payload.session.goals);
    if (payload.session.capacity) setCapacity(payload.session.capacity);
    return payload;
  }, [date]);

  const act = useCallback(async (mode: string, input: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/testing/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, date, ...input }),
      });
      const payload = await response.json() as TestingState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "That change did not work.");
      setState(payload);
      setProposal(payload.session.proposal);
      setGoals(payload.session.goals);
      if (payload.session.capacity) setCapacity(payload.session.capacity);
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change did not work.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [date]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((caught) => setError(caught instanceof Error ? caught.message : "Onboarding could not load."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (state?.session.stage !== "preparing") return;
    const fallbackTimer = window.setTimeout(() => setShowFallback(true), 12000);
    const poll = window.setInterval(() => { load().catch(() => undefined); }, 1100);
    return () => { window.clearInterval(poll); window.clearTimeout(fallbackTimer); };
  }, [load, state?.session.stage]);

  const moveActivity = (index: number, direction: -1 | 1) => {
    if (!proposal) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= proposal.activities.length) return;
    const activities = [...proposal.activities];
    [activities[index], activities[nextIndex]] = [activities[nextIndex], activities[index]];
    setProposal({ ...proposal, activities });
  };

  const updateActivity = (index: number, changes: Partial<OnboardingProposal["activities"][number]>) => {
    if (!proposal) return;
    setProposal({ ...proposal, activities: proposal.activities.map((activity, activityIndex) => activityIndex === index ? { ...activity, ...changes } : activity) });
  };

  const stage = state?.session.stage;
  const currentEdit = editing === null ? null : proposal?.activities[editing] || null;
  const essentials = proposal?.activities.filter((activity) => activity.planRole === "essential") || [];
  const extras = proposal?.activities.filter((activity) => activity.planRole === "extra") || [];
  const completedEssentials = state?.items.filter((item) => item.planRole === "essential" && item.completedAt).length || 0;
  const activeEssentials = state?.items.filter((item) => item.planRole === "essential") || [];
  const activeExtras = state?.items.filter((item) => item.planRole === "extra" && item.activatedAt) || [];
  const availableExtras = state?.items.filter((item) => item.planRole === "extra" && !item.activatedAt) || [];

  return <main className="onboarding-shell">
    <TestingHeader onReset={() => act("reset")} />
    <div className="onboarding-content">
      {!state ? <section className="onboarding-center"><span className="onboarding-orbit"><Sparkles size={24} /></span><h1>Opening a fresh start…</h1></section> : null}

      {stage === "welcome" ? <section className="onboarding-hero">
        <span className="onboarding-orbit"><Sparkles size={26} /></span>
        <span className="onboarding-kicker">MEET LUNA</span>
        <h1>Let’s build a day that feels like yours.</h1>
        <p>We’ll start small, try it in real life, and shape it together as Luna learns what actually helps.</p>
        <button className="onboarding-primary onboarding-wide" type="button" disabled={busy} onClick={() => act("show_goals")}>Build my starting day <ChevronRight size={18} /></button>
        <small>About 2 minutes · Nothing is saved until you approve it</small>
      </section> : null}

      {stage === "goals" ? <section className="onboarding-step">
        <button className="onboarding-back" type="button" onClick={() => act("back", { stage: "welcome" })}><ArrowLeft size={17} /> Back</button>
        <span className="onboarding-kicker">YOUR DIRECTION</span>
        <h1>What do you want more of in your days?</h1>
        <p>Tell Luna what you’re working toward, what has felt off, or what a genuinely good day would include.</p>
        <textarea value={goals} onChange={(event) => setGoals(event.target.value)} placeholder="I want calmer mornings, consistent movement, focused work, and enough energy left for the evening…" />
        <div className="onboarding-prompt-chips"><span>Try mentioning</span><button type="button" onClick={() => setGoals((value) => `${value}${value ? " " : ""}I want more energy and consistency.`)}>Energy</button><button type="button" onClick={() => setGoals((value) => `${value}${value ? " " : ""}I want time for meaningful progress.`)}>Progress</button><button type="button" onClick={() => setGoals((value) => `${value}${value ? " " : ""}I want a calmer evening.`)}>Calm</button></div>
        <button className="onboarding-primary onboarding-wide" type="button" disabled={busy || goals.trim().length < 8} onClick={() => act("save_goals", { goals })}>Continue <ChevronRight size={18} /></button>
      </section> : null}

      {stage === "capacity" ? <section className="onboarding-step">
        <button className="onboarding-back" type="button" onClick={() => act("back", { stage: "goals" })}><ArrowLeft size={17} /> Back</button>
        <span className="onboarding-kicker">STARTING PACE</span>
        <h1>How much structure would feel helpful right now?</h1>
        <p>This only shapes the first draft. You can change every activity before anything becomes part of your plan.</p>
        <div className="onboarding-capacity-list">{CAPACITY_COPY.map((option) => <button key={option.id} className={capacity === option.id ? "is-selected" : ""} type="button" onClick={() => setCapacity(option.id)}><span><strong>{option.title}</strong><small>{option.detail}</small></span><em>{option.count}</em>{capacity === option.id ? <Check size={17} /> : null}</button>)}</div>
        <button className="onboarding-primary onboarding-wide" type="button" disabled={busy} onClick={() => act("generate", { capacity })}>See what Luna suggests <Sparkles size={18} /></button>
      </section> : null}

      {stage === "preparing" ? <section className="onboarding-center onboarding-preparing">
        <span className="onboarding-orbit is-working"><Sparkles size={25} /></span>
        <span className="onboarding-kicker">LUNA IS WORKING</span>
        <h1>{state.job?.progressTitle || "Building your starting day"}</h1>
        <p>{state.job?.progressDetail || "Connecting your goals to a small set you can actually try."}</p>
        <div className="onboarding-progress"><i /><i /><i /></div>
        {proposal ? <small>Your current draft stays here while Luna revises it.</small> : <small>No activities have been created yet.</small>}
        {showFallback || state.job?.status === "failed" ? <button className="onboarding-text-button" type="button" disabled={busy} onClick={() => act("fallback")}>Use a simple starter instead</button> : null}
      </section> : null}

      {(stage === "proposal" || stage === "error") && proposal ? <section className="onboarding-proposal">
        <button className="onboarding-back" type="button" onClick={() => act("back", { stage: "capacity" })}><ArrowLeft size={17} /> Pace</button>
        <div className="onboarding-proposal-heading"><div><span className="onboarding-kicker">YOUR FIRST DRAFT</span><h1>{prettyDate(date)}</h1></div><span className="onboarding-draft-badge">Not saved yet</span></div>
        <div className="onboarding-luna-note"><Sparkles size={18} /><p><strong>Here’s where I’d start.</strong>{proposal.summary}</p></div>
        <div className="onboarding-section-heading"><span><b>ESSENTIALS</b><small>A successful day starts with these.</small></span><em>{essentials.length}</em></div>
        <div className="onboarding-draft-list">{proposal.activities.map((activity, index) => activity.planRole === "essential" ? <DraftActivity key={activity.key} activity={activity} index={index} count={proposal.activities.length} onEdit={() => setEditing(index)} onMove={(direction) => moveActivity(index, direction)} /> : null)}</div>
        {extras.length ? <><div className="onboarding-section-heading is-more"><span><b>MORE FOR TODAY</b><small>Still going strong? Here are some stretch goals.</small></span><em>{extras.length}</em></div><div className="onboarding-draft-list">{proposal.activities.map((activity, index) => activity.planRole === "extra" ? <DraftActivity key={activity.key} activity={activity} index={index} count={proposal.activities.length} onEdit={() => setEditing(index)} onMove={(direction) => moveActivity(index, direction)} /> : null)}</div></> : null}
        {proposal.futureCandidates.length ? <section className="onboarding-future"><span className="onboarding-kicker">NOT YET — BUT I HEARD YOU</span>{proposal.futureCandidates.map((candidate) => <div key={candidate.title}><strong>{candidate.title}</strong><small>{candidate.reason}</small></div>)}</section> : null}
        <section className="onboarding-calibration"><Sparkles size={18} /><p><strong>Luna will check back in {proposal.calibration.afterDays} days.</strong>{proposal.calibration.note}</p></section>
        <div className="onboarding-proposal-actions"><button className="onboarding-secondary" type="button" onClick={() => setRevisionOpen(true)}>Adjust with Luna</button><button className="onboarding-secondary" type="button" onClick={() => setProposal({ ...proposal, activities: proposal.activities.map((activity) => ({ ...activity, durationMinutes: Math.max(5, activity.durationMinutes - 5) })) })}>Start lighter</button><button className="onboarding-primary" type="button" disabled={busy} onClick={() => act("confirm", { proposal })}><Check size={18} /> Start with this</button></div>
      </section> : null}

      {stage === "error" && !proposal ? <section className="onboarding-center"><span className="onboarding-orbit"><Sparkles size={24} /></span><h1>Luna hit a snag.</h1><p>{state.session.error || state.job?.error || "The proposal did not finish."}</p><button className="onboarding-primary" type="button" onClick={() => act("generate", { capacity })}>Try again</button><button className="onboarding-text-button" type="button" onClick={() => act("fallback")}>Use a simple starter</button></section> : null}

      {stage === "active" ? <section className="onboarding-active">
        <div className="onboarding-active-heading"><div><span className="onboarding-kicker">YOUR FIRST REAL DAY</span><h1>{prettyDate(state.session.confirmationDate || date)}</h1></div><span className="onboarding-live-badge"><Check size={14} /> Saved to testing</span></div>
        <section className="onboarding-highlights"><div className="onboarding-score">{completedEssentials}/{activeEssentials.length}</div><div><span className="onboarding-kicker">HIGHLIGHTS</span><strong>{completedEssentials === activeEssentials.length ? "Essentials complete" : `${activeEssentials.length - completedEssentials} essentials left`}</strong><small>This is the real completion model inside your testing profile.</small></div></section>
        {completedEssentials === activeEssentials.length && activeEssentials.length ? <section className="onboarding-achievement"><span className="onboarding-trophy">✦</span><p><span className="onboarding-kicker">TODAY’S ACHIEVEMENT</span><strong>Your first Ideal Day is underway.</strong><small>The rest of today is yours.</small></p><Sparkles size={20} /></section> : null}
        <div className="onboarding-section-heading"><span><b>ESSENTIALS</b><small>The starting set you approved.</small></span></div>
        <div className="onboarding-active-list">{activeEssentials.map((item) => <button key={item.id} className={item.completedAt ? "is-complete" : ""} type="button" disabled={busy} onClick={() => act("toggle", { itemId: item.id, completed: !item.completedAt })}><ActivityIcon category={item.category} color={item.color} /><span><strong>{item.title}</strong><small>{item.completedAt ? "Completed today" : `${item.durationMinutes} min · ${item.category}`}</small></span><i><Check size={17} /></i></button>)}</div>
        {activeExtras.length ? <><div className="onboarding-section-heading is-more"><span><b>MORE FOR TODAY</b><small>Stretch goals you chose for today.</small></span></div><div className="onboarding-active-list">{activeExtras.map((item) => <button key={item.id} className={item.completedAt ? "is-complete" : ""} type="button" disabled={busy} onClick={() => act("toggle", { itemId: item.id, completed: !item.completedAt })}><ActivityIcon category={item.category} color={item.color} /><span><strong>{item.title}</strong><small>{item.completedAt ? "Completed today" : `${item.durationMinutes} min · ${item.category}`}</small></span><i><Check size={17} /></i></button>)}</div></> : null}
        {availableExtras.length ? <section className="onboarding-stretch-pool"><span className="onboarding-kicker">AVAILABLE STRETCH GOALS</span>{availableExtras.map((item) => <button key={item.id} type="button" onClick={() => act("activate", { itemId: item.id })}><ActivityIcon category={item.category} color={item.color} /><span><strong>{item.title}</strong><small>{item.durationMinutes} min · Add for today</small></span><ChevronRight size={17} /></button>)}</section> : null}
        <section className="onboarding-calibration"><Sparkles size={18} /><p><strong>Luna is watching for fit, not perfection.</strong>{state.session.proposal?.calibration.note}</p></section>
      </section> : null}

      {error ? <div className="onboarding-error" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div> : null}
    </div>

    {currentEdit && editing !== null ? <div className="onboarding-dialog-backdrop" role="presentation"><section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title"><button className="onboarding-dialog-close" type="button" aria-label="Close" onClick={() => setEditing(null)}><X size={19} /></button><span className="onboarding-kicker">EDIT ACTIVITY</span><h2 id="edit-title">Make this feel right.</h2><label>Activity name<input value={currentEdit.title} onChange={(event) => updateActivity(editing, { title: event.target.value.slice(0, 60) })} /></label><label>Minutes<input type="number" min="5" max="180" step="5" value={currentEdit.durationMinutes} onChange={(event) => updateActivity(editing, { durationMinutes: Math.max(5, Math.min(180, Number(event.target.value) || 5)) })} /></label><label>Place in today<select value={currentEdit.planRole} onChange={(event) => updateActivity(editing, { planRole: event.target.value as "essential" | "extra" })}><option value="essential">Essential</option><option value="extra">More for today</option></select></label><div className="onboarding-dialog-actions"><button className="onboarding-danger" type="button" onClick={() => { setProposal({ ...proposal!, activities: proposal!.activities.filter((_, index) => index !== editing) }); setEditing(null); }}>Remove</button><button className="onboarding-primary" type="button" onClick={() => setEditing(null)}>Done</button></div></section></div> : null}

    {revisionOpen && proposal ? <div className="onboarding-dialog-backdrop" role="presentation"><section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="adjust-title"><button className="onboarding-dialog-close" type="button" aria-label="Close" onClick={() => setRevisionOpen(false)}><X size={19} /></button><span className="onboarding-kicker">ADJUST WITH LUNA</span><h2 id="adjust-title">What should feel different?</h2><p>Luna will revise this draft. Nothing becomes an activity yet.</p><textarea value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="Make mornings lighter and give me more time for creative work…" /><div className="onboarding-dialog-actions"><button className="onboarding-secondary" type="button" onClick={() => setRevisionOpen(false)}>Cancel</button><button className="onboarding-primary" type="button" disabled={busy || revision.trim().length < 3} onClick={() => { setRevisionOpen(false); act("revise", { instruction: revision, proposal }); }}>Ask Luna</button></div></section></div> : null}
  </main>;
}
