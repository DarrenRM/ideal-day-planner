"use client";

import { CalendarDays, Check, ChevronDown, Inbox, Send, Sparkles, X } from "./icons";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PendingCapture } from "./capture-model";
import { ConversationWorkReceipt, type ConversationWorkReceiptData } from "./conversation-work-receipt";
import { ConversationClarificationCard } from "./conversation-clarification-card";
import type { ConversationClarification, ConversationClarificationOption } from "./conversation-clarification-model";

type LunaMessage = { id: string; author: "user" | "luna"; source?: string; body: string; createdAt: string };
type LunaArtifact = ConversationWorkReceiptData & {
  activityId: string | null;
  activityClientKey: string | null;
  detail: string;
  meta?: { targetActivityId?: string; targetActivityClientKey?: string };
};
type LunaProposal = {
  id: string;
  status: string;
  createdAt: string;
  document: {
    summary: string;
    effectiveDate: string;
    impact: { todayChanges: number; futurePatternChanges: number };
    actions: Array<{ type: string; pattern?: { name?: string; cadence?: { kind?: string }; steps?: unknown[] } }>;
  };
};
type LunaState = {
  messages: LunaMessage[];
  artifacts: LunaArtifact[];
  clarifications: ConversationClarification[];
  activeJob: { status: string; progressTitle?: string | null; progressDetail?: string | null } | null;
  agentOnline: boolean;
  proposals: LunaProposal[];
  captures: PendingCapture[];
};

const EMPTY_STATE: LunaState = { messages: [], artifacts: [], clarifications: [], activeJob: null, agentOnline: false, proposals: [], captures: [] };

function formatMessageTime(value: string) {
  const date = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function proposalDetail(proposal: LunaProposal) {
  const pattern = proposal.document.actions.find((action) => action.pattern)?.pattern;
  const pieces = [pattern?.name, pattern?.cadence?.kind?.replaceAll("_", " "), pattern?.steps?.length ? `${pattern.steps.length} step${pattern.steps.length === 1 ? "" : "s"}` : null];
  return pieces.filter(Boolean).join(" · ");
}

function formatProposalDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function GlobalLuna({ open, initialDraft, onDraftConsumed, onClose, onOpenActivity, onRead, onScheduleChanged }: {
  open: boolean;
  initialDraft: string;
  onDraftConsumed: () => void;
  onClose: () => void;
  onOpenActivity: (target: { activityId: string; activityClientKey: string | null }, origin?: DOMRect) => boolean | Promise<boolean>;
  onRead: () => void;
  onScheduleChanged: () => void;
}) {
  const [state, setState] = useState<LunaState>(EMPTY_STATE);
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState<string | null>(null);
  const [clarificationBusy, setClarificationBusy] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [openingArtifactId, setOpeningArtifactId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  async function load() {
    const response = await fetch("/api/luna", { cache: "no-store" });
    const result = await response.json() as LunaState & { error?: string };
    if (!response.ok) throw new Error(result.error || "Luna could not connect.");
    setState(result);
    return result;
  }

  const hasActiveJob = Boolean(state.activeJob);
  const conversationFeed = useMemo(() => [
    ...state.messages.filter((message) => message.source !== "clarification").map((message) => ({ type: "message" as const, createdAt: message.createdAt, value: message })),
    ...state.artifacts.map((artifact) => ({ type: "artifact" as const, createdAt: artifact.createdAt, value: artifact })),
    ...state.clarifications.map((clarification) => ({ type: "clarification" as const, createdAt: clarification.createdAt, value: clarification })),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)), [state.artifacts, state.clarifications, state.messages]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/luna", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "mark-read" }),
    }).then((response) => response.ok ? response.json() : null).then((result) => {
      if (result) setState(result as LunaState);
      onReadRef.current();
    }).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const response = await fetch("/api/luna", { cache: "no-store" });
      const result = await response.json() as LunaState & { error?: string };
      if (!cancelled && response.ok) setState(result);
    }
    const initialTimer = window.setTimeout(() => void refresh().catch(() => undefined), 0);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), open ? (hasActiveJob ? 900 : 3000) : 4000);
    return () => { cancelled = true; window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, [hasActiveJob, open]);

  useEffect(() => {
    if (!open || !initialDraft) return;
    onDraftConsumed();
    const timer = window.setTimeout(() => composerRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [initialDraft, onDraftConsumed, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", escape); };
  }, [open, state.messages.length, state.artifacts.length, state.clarifications.length, state.activeJob, state.proposals.length, state.captures.length, onClose]);

  async function viewArtifact(artifact: LunaArtifact, origin?: DOMRect) {
    if ((!artifact.activityId && !artifact.meta?.targetActivityId) || openingArtifactId) return;
    setOpeningArtifactId(artifact.id);
    try {
      const response = await fetch("/api/luna", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "view-artifact", artifactId: artifact.id }),
      });
      if (!response.ok) {
        setOpeningArtifactId(null);
        return;
      }
      const result = await response.json() as LunaState;
      setState(result);
      const sourceTarget = { activityId: artifact.activityId || "", activityClientKey: artifact.activityClientKey };
      const target = artifact.meta?.targetActivityId ? {
        activityId: artifact.meta.targetActivityId,
        activityClientKey: artifact.meta.targetActivityClientKey || null,
      } : sourceTarget;
      const opened = await onOpenActivity(target, origin);
      if (opened) onClose();
      setOpeningArtifactId(null);
    } catch {
      setOpeningArtifactId(null);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const optimistic: LunaMessage = { id: `pending-${crypto.randomUUID()}`, author: "user", body, createdAt: new Date().toISOString() };
    setState((current) => ({ ...current, messages: [...current.messages, optimistic] }));
    setDraft("");
    setSending(true);
    try {
      const response = await fetch("/api/luna", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, messageId: crypto.randomUUID() }),
      });
      const result = await response.json() as LunaState & { error?: string };
      if (!response.ok) throw new Error(result.error || "That message did not send.");
      setState(result);
    } catch {
      setDraft(body);
      await load().catch(() => undefined);
    } finally {
      setSending(false);
    }
  }

  async function proposalAction(proposalId: string, mode: "confirm" | "dismiss" | "revise") {
    if (proposalBusy) return;
    setProposalBusy(proposalId);
    try {
      const response = await fetch("/api/schedule/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, mode, ...(mode === "revise" ? { body: revisionText } : {}) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "That proposal could not be updated.");
      setRevisionId(null);
      setRevisionText("");
      await load();
      if (mode === "confirm") onScheduleChanged();
    } finally {
      setProposalBusy(null);
    }
  }

  async function chooseCaptureTiming(captureId: string, timing: "today" | "tomorrow" | "later") {
    if (captureBusy) return;
    setCaptureBusy(captureId);
    try {
      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureId, timing }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "That item could not be updated.");
      await load();
      if (timing !== "later") onScheduleChanged();
    } finally {
      setCaptureBusy(null);
    }
  }

  async function answerClarification(clarification: ConversationClarification, option: ConversationClarificationOption) {
    if (clarificationBusy || clarification.status === "answered") return;
    setClarificationBusy(clarification.id);
    setState((current) => ({ ...current, clarifications: current.clarifications.map((entry) => entry.id === clarification.id
      ? { ...entry, status: "answered", selectedOptionId: option.id, answeredAt: new Date().toISOString() }
      : entry) }));
    try {
      const response = await fetch("/api/clarifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clarificationId: clarification.id, optionId: option.id }),
      });
      if (!response.ok) throw new Error("That answer could not be saved.");
      await load();
    } catch {
      await load().catch(() => undefined);
    } finally {
      setClarificationBusy(null);
    }
  }

  return (
    <div aria-hidden={!open} className={`global-luna-backdrop ${open ? "is-visible" : ""}`} inert={!open} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label="Talk with Luna" aria-modal={open ? "true" : undefined} className="global-luna-sheet" role="dialog">
        <header className="global-luna-header">
          <div className="global-luna-heading"><span><Sparkles aria-hidden="true" size={18} /></span><div><strong>Luna</strong><small><i className={state.agentOnline ? "is-online" : ""} />{state.agentOnline ? "Connected" : "Will catch up"}</small></div></div>
          <button aria-label="Close notes and conversation" className="global-luna-close" type="button" onClick={onClose}><X aria-hidden="true" size={20} /></button>
          <button aria-label="Close Notes & Assistant" className="global-luna-mobile-handle" type="button" onClick={onClose}><strong>Notes &amp; Assistant</strong><ChevronDown aria-hidden="true" size={18} /></button>
        </header>
        <div className="global-luna-scroll" ref={scrollRef}>
          {!conversationFeed.length ? (
            <div className="global-luna-welcome"><Sparkles aria-hidden="true" size={22} /><h2>Shape your day with Luna</h2><p>Ask about your routine, create a rotation, or move something to another day.</p></div>
          ) : null}
          {conversationFeed.map((entry) => entry.type === "message" ? (
            <article className={`global-luna-message is-${entry.value.author}`} key={entry.value.id}>
              <p>{entry.value.body}</p><time>{formatMessageTime(entry.value.createdAt)}</time>
            </article>
          ) : entry.type === "clarification" ? (
            <ConversationClarificationCard
              busy={clarificationBusy === entry.value.id}
              clarification={entry.value}
              key={entry.value.id}
              onChoose={(option) => void answerClarification(entry.value, option)}
              onOther={() => composerRef.current?.focus()}
            />
          ) : (
            <ConversationWorkReceipt
              artifact={entry.value}
              color="#b7db78"
              icon={<Sparkles aria-hidden="true" size={16} />}
              key={entry.value.id}
              onView={entry.value.activityId || entry.value.meta?.targetActivityId ? (origin) => void viewArtifact(entry.value, origin) : undefined}
              timestamp={formatMessageTime(entry.value.createdAt)}
              viewDisabled={Boolean(openingArtifactId)}
              viewLabel={openingArtifactId === entry.value.id ? "Opening…" : "View"}
            />
          ))}
          {state.activeJob ? <div className="global-luna-message is-luna global-luna-typing" role="status" aria-label="Luna is typing"><div className="message-bubble prototype-typing"><span /><span /><span /></div></div> : null}
          {state.proposals.map((proposal) => (
            <article className="schedule-proposal-card" key={proposal.id}>
              <div className="schedule-proposal-kicker"><Sparkles aria-hidden="true" size={14} /> Schedule proposal</div>
              <h3>{proposal.document.summary}</h3>
              {proposalDetail(proposal) ? <p>{proposalDetail(proposal)}</p> : null}
              <dl><div><dt>Begins</dt><dd>{formatProposalDate(proposal.document.effectiveDate)}</dd></div><div><dt>Today</dt><dd>{proposal.document.impact.todayChanges ? `${proposal.document.impact.todayChanges} change${proposal.document.impact.todayChanges === 1 ? "" : "s"}` : "No changes"}</dd></div><div><dt>Future</dt><dd>{proposal.document.impact.futurePatternChanges ? `${proposal.document.impact.futurePatternChanges} change${proposal.document.impact.futurePatternChanges === 1 ? "" : "s"}` : "No changes"}</dd></div></dl>
              {revisionId === proposal.id ? (
                <form className="schedule-proposal-revise" onSubmit={(event) => { event.preventDefault(); void proposalAction(proposal.id, "revise"); }}>
                  <label htmlFor={`revise-${proposal.id}`}>What should Luna change?</label>
                  <textarea id={`revise-${proposal.id}`} value={revisionText} onChange={(event) => setRevisionText(event.target.value)} />
                  <div><button type="button" onClick={() => setRevisionId(null)}>Cancel</button><button disabled={!revisionText.trim() || proposalBusy === proposal.id} type="submit">Send revision</button></div>
                </form>
              ) : (
                <div className="schedule-proposal-actions">
                  <button type="button" onClick={() => void proposalAction(proposal.id, "dismiss")}>Dismiss</button>
                  <button type="button" onClick={() => setRevisionId(proposal.id)}>Revise</button>
                  <button className="is-primary" disabled={proposalBusy === proposal.id} type="button" onClick={() => void proposalAction(proposal.id, "confirm")}><Check aria-hidden="true" size={15} /> Confirm</button>
                </div>
              )}
            </article>
          ))}
          {state.captures.map((capture) => (
            <article className="luna-capture-card" key={capture.id}>
              <div className="luna-capture-heading"><span><Inbox aria-hidden="true" size={16} /></span><div><small>{capture.status === "filed" ? `Saved to ${capture.activityTitle}` : "Needs a home"}</small><strong>{capture.label}</strong></div></div>
              {capture.detail ? <p>{capture.detail}</p> : null}
              {capture.status === "filed" && capture.timing === "unspecified" ? <div className="luna-capture-actions" aria-label={`Choose when to handle ${capture.label}`}>
                <button disabled={captureBusy === capture.id} type="button" onClick={() => void chooseCaptureTiming(capture.id, "today")}><CalendarDays aria-hidden="true" size={14} /> Today</button>
                <button disabled={captureBusy === capture.id} type="button" onClick={() => void chooseCaptureTiming(capture.id, "tomorrow")}>Tomorrow</button>
                <button disabled={captureBusy === capture.id} type="button" onClick={() => void chooseCaptureTiming(capture.id, "later")}>Later</button>
              </div> : null}
              {capture.status === "pending_destination" ? <small className="luna-capture-hint">Luna needs to know where you want to keep this{capture.destinationHint ? ` — ${capture.destinationHint}` : ""}.</small> : null}
            </article>
          ))}
        </div>
        <form className="global-luna-composer" onSubmit={send}>
          <textarea aria-label="Message Luna" placeholder="Ask Luna about your day…" ref={composerRef} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <button aria-label="Send message" disabled={!draft.trim() || sending} type="submit"><Send aria-hidden="true" size={18} /></button>
        </form>
      </section>
    </div>
  );
}
