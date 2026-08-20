"use client";

import type { CSSProperties, DragEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock3, GripVertical, MoreHorizontal, MoreVertical, Pencil, RotateCcw, Send, Settings, SkipForward, Sparkles, Trash2, X } from "lucide-react";
import { ActivityWorkspace, captureActivityTimingSnapshot, hasVisibleActivityWorkspace, resetActivityTimingState } from "./activity-workspace";
import type { ActivityRecord } from "./activity-record-model";
import { dayModePolicy, DEFAULT_DAY_SETTINGS, normalizeDaySettings, type DaySettings } from "./day-settings";
import { useMobileConversationDrawer } from "./use-mobile-conversation-drawer";
import { EMPTY_WORKSPACE, type WorkspaceDocument } from "./workspace-model";

type Category = "Light" | "Recharge" | "Training" | "Fuel" | "Care" | "Logistics" | "Creativity" | "Spirit";

type RoutineItem = {
  id: string;
  title: string;
  detail: string;
  duration: number;
  category: Category;
  icon: string;
  color: string;
  completedAt?: string | null;
  skippedAt?: string | null;
};

type ScheduledItem = RoutineItem & { start: number; end: number };
type DropTarget = { id: string; position: "before" | "after" };
type ConversationMessage = { id: string; author: "user" | "luna"; body: string; createdAt: string; pending?: boolean };
type ConversationJob = { status: "queued" | "leased" | "running"; kind: "activity_opened" | "activity_setup" | "user_message" | "workspace_refresh" };
type ConversationState = {
  messages: ConversationMessage[];
  activeJob: ConversationJob | null;
  agentOnline: boolean;
  workspace: { revisionId: string | null; revisionNumber: number; document: WorkspaceDocument };
  records: ActivityRecord[];
};

const START_MINUTES = 8 * 60;
const DEFAULT_DEV_MINUTES = 7 * 60 + 30;
const DURATION_STEP = 5;
const STORAGE_KEY = "idealized-day-items-v1";
const DELETED_KEY = "idealized-day-deleted-v1";
const MIGRATION_KEY = "idealized-day-d1-imported-v1";
const DEV_TIME_KEY = "idealized-day-dev-time-v1";

const INITIAL_ITEMS: RoutineItem[] = [
  { id: "sun-walk", title: "Walk in sun", detail: "Easy pace · outdoor light", duration: 30, category: "Light", icon: "☼", color: "#e8b75f" },
  { id: "shower", title: "Shower", detail: "Recharge · get ready for the day", duration: 15, category: "Recharge", icon: "◌", color: "#67b7ce" },
  { id: "stretch", title: "Stretch / yoga", detail: "Mobility · breathe and open up", duration: 20, category: "Recharge", icon: "⌁", color: "#928ce0" },
  { id: "hair-serum", title: "Hair serum", detail: "Care · apply and let it settle", duration: 5, category: "Care", icon: "✦", color: "#d58db5" },
  { id: "red-light", title: "Red light", detail: "Care · device session", duration: 15, category: "Care", icon: "◉", color: "#dc766a" },
  { id: "shake", title: "Shake", detail: "Quick fuel before training", duration: 5, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "hang", title: "Hang from chin-up bar", detail: "Grip · decompression", duration: 5, category: "Training", icon: "↑", color: "#a8c96d" },
  { id: "kettlebells", title: "Kettlebells", detail: "Strength · short focused circuit", duration: 20, category: "Training", icon: "◆", color: "#c99a67" },
  { id: "cardio", title: "Cardio", detail: "Conditioning · steady effort", duration: 25, category: "Training", icon: "≈", color: "#64b89a" },
  { id: "lift", title: "Lift", detail: "Strength · main session", duration: 45, category: "Training", icon: "▰", color: "#8eb36d" },
  { id: "breakfast", title: "Breakfast", detail: "Sit down and eat", duration: 25, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "massage-gun", title: "Massage gun", detail: "Recovery · quick pass on worked areas", duration: 10, category: "Recharge", icon: "∿", color: "#73a6c8" },
  { id: "skin-routine", title: "Skin routine", detail: "Care · cleanse and moisturize", duration: 15, category: "Care", icon: "✧", color: "#ce8fb7" },
  { id: "lunch", title: "Lunch", detail: "Fuel · simple, intentional meal", duration: 30, category: "Fuel", icon: "◍", color: "#cf9e62" },
  { id: "sun-tan", title: "Sun tan", detail: "Outdoor time · finish the protocol", duration: 20, category: "Light", icon: "☀", color: "#edb65b" },
];

const CATEGORY_ORDER: Category[] = ["Training", "Fuel", "Light", "Recharge", "Care", "Logistics", "Creativity", "Spirit"];
const CATEGORY_OPTIONS: Category[] = ["Care", "Training", "Fuel", "Recharge", "Light", "Logistics", "Creativity", "Spirit"];
const CATEGORY_META: Record<Category, Pick<RoutineItem, "icon" | "color">> = {
  Care: { icon: "✦", color: "#d58db5" },
  Training: { icon: "◆", color: "#a8c96d" },
  Fuel: { icon: "◒", color: "#d59662" },
  Recharge: { icon: "◌", color: "#67b7ce" },
  Light: { icon: "☼", color: "#e8b75f" },
  Logistics: { icon: "↗", color: "#7ba6c9" },
  Creativity: { icon: "✺", color: "#b58ad6" },
  Spirit: { icon: "✧", color: "#9a8ed8" },
};
const INITIAL_IDS = new Set(INITIAL_ITEMS.map((item) => item.id));

function isCategory(value: unknown): value is Category {
  return CATEGORY_OPTIONS.includes(value as Category);
}

function normalizeCategory(value: unknown): Category | null {
  if (value === "Reset") return "Recharge";
  return isCategory(value) ? value : null;
}

type CategoryPickerProps = {
  id: string;
  ariaLabel: string;
  value: Category;
  onChange: (value: Category) => void;
};

function CategoryPicker({ id, ariaLabel, value, onChange }: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => CATEGORY_OPTIONS.indexOf(value));
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, CATEGORY_OPTIONS.indexOf(value));
  const optionsId = `${id}-options`;

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function focusOption(index: number) {
    const nextIndex = (index + CATEGORY_OPTIONS.length) % CATEGORY_OPTIONS.length;
    setActiveIndex(nextIndex);
    window.setTimeout(() => optionRefs.current[nextIndex]?.focus(), 0);
  }

  function openPicker(index = selectedIndex) {
    setActiveIndex(index);
    setIsOpen(true);
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0);
  }

  function choose(category: Category) {
    onChange(category);
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openPicker(event.key === "ArrowUp" ? CATEGORY_OPTIONS.length - 1 : selectedIndex);
      } else {
        focusOption(event.key === "ArrowUp" ? activeIndex - 1 : activeIndex + 1);
      }
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(CATEGORY_OPTIONS.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(CATEGORY_OPTIONS[index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div className="category-picker" ref={pickerRef}>
      <button
        aria-controls={optionsId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="category-picker-trigger"
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => isOpen ? setIsOpen(false) : openPicker()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{value}</span>
        <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
      {isOpen ? (
        <div className="category-picker-options" id={optionsId} role="listbox" aria-label={ariaLabel}>
          {CATEGORY_OPTIONS.map((category, index) => (
            <button
              aria-selected={category === value}
              className="category-picker-option"
              key={category}
              ref={(element) => { optionRefs.current[index] = element; }}
              role="option"
              style={{ "--category-color": CATEGORY_META[category].color } as CSSProperties}
              type="button"
              onClick={() => choose(category)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span className="category-option-dot" aria-hidden="true" />
              <span>{category}</span>
              {category === value ? <Check aria-hidden="true" size={14} strokeWidth={2} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ControlTooltip({ id, label, children, className = "" }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <span className={`control-tooltip ${className}`}>
      {children}
      <span className="control-tooltip-bubble" id={id} role="tooltip">{label}</span>
    </span>
  );
}

function timeParts(totalMinutes: number) {
  const normalized = totalMinutes % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return {
    time: `${hour % 12 || 12}:${String(minutes).padStart(2, "0")}`,
    suffix: hour >= 12 ? "PM" : "AM",
  };
}

function storedTimestampMillis(value: string | null | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function timestampTimeParts(value: string | null | undefined) {
  const timestamp = storedTimestampMillis(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return timeParts(date.getHours() * 60 + date.getMinutes());
}

function formatTime(totalMinutes: number) {
  const { time, suffix } = timeParts(totalMinutes);
  return `${time} ${suffix}`;
}

function formatDuration(duration: number) {
  if (duration < 60) return `${duration}m`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatCountdown(duration: number) {
  if (duration <= 0) return "Ready now";
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  if (!hours) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return minutes ? `${hours}h ${minutes}m` : `${hours} hour${hours === 1 ? "" : "s"}`;
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeInputValue(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function minutesFromTimeInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function formatDayOrdinal(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatTodayHeading(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  return `${weekday}, ${month} ${formatDayOrdinal(date.getDate())}`;
}

function conversationTime(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "Recently";
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return isToday ? `Today · ${time}` : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function conversationWorkspaceSignature(state: Pick<ConversationState, "workspace" | "records">) {
  const recordVersions = state.records.map((record) => `${record.key}:${record.version}`).sort().join("|");
  return `${state.workspace.revisionId ?? "none"}::${recordVersions}`;
}

type ActivityWorkbenchProps = {
  item: ScheduledItem;
  timelineEnabled: boolean;
  isComplete: boolean;
  isSkipped: boolean;
  openConversationOnMount: boolean;
  onComplete: (completedAt: string | null) => void;
  onSkip: (skippedAt: string | null) => void;
  onEdit: () => void;
  onRemove: () => void;
  onAdjustDuration: (delta: number) => void;
  onSetDuration: (value: number) => void;
};

function ActivityWorkbench({ item, timelineEnabled, isComplete, isSkipped, openConversationOnMount, onComplete, onSkip, onEdit, onRemove, onAdjustDuration, onSetDuration }: ActivityWorkbenchProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeJob, setActiveJob] = useState<ConversationJob | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceDocument>(EMPTY_WORKSPACE);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [workspaceReadyLabel, setWorkspaceReadyLabel] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"joining" | "ready" | "error">("joining");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isFooterMenuOpen, setIsFooterMenuOpen] = useState(false);
  const [resetActivityState, setResetActivityState] = useState<"idle" | "confirming" | "resetting" | "error">("idle");
  const sendingRef = useRef(false);
  const refreshConversationRef = useRef<() => void>(() => {});
  const conversationLogRef = useRef<HTMLDivElement>(null);
  const conversationSectionRef = useRef<HTMLElement>(null);
  const conversationShouldFollowRef = useRef(true);
  const conversationAnchorTopRef = useRef<number | null>(null);
  const hasAppliedConversationStateRef = useRef(false);
  const workspaceSignatureRef = useRef<string | null>(null);
  const footerMenuRef = useRef<HTMLDivElement>(null);
  const hasConversationJob = activeJob?.kind === "user_message" || activeJob?.kind === "activity_setup";
  const hasWorkspaceJob = activeJob?.kind === "workspace_refresh" || activeJob?.kind === "activity_setup";
  const activeJobHasWorker = Boolean(activeJob && (agentOnline || activeJob.status === "leased" || activeJob.status === "running"));
  const isLunaThinking = isSending || (activeJobHasWorker && hasConversationJob);
  const workspaceWorkState = hasWorkspaceJob
    ? activeJobHasWorker ? "building" : "waiting"
    : null;
  const workspaceActivity = { ...item, timelineEnabled };
  const hasWorkspaceContent = hasVisibleActivityWorkspace(workspaceActivity, workspace, records);
  const showWorkspace = hasWorkspaceContent || Boolean(workspaceWorkState) || Boolean(recordError);
  const conversationDrawer = useMobileConversationDrawer({ activityId: item.id, canCollapse: showWorkspace, messages, openOnMount: openConversationOnMount });
  const isOpeningActivity = connectionState === "joining" || !conversationDrawer.isPreferenceReady;

  useEffect(() => {
    if (!isFooterMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && footerMenuRef.current?.contains(event.target)) return;
      setIsFooterMenuOpen(false);
      setResetActivityState("idle");
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsFooterMenuOpen(false);
      setResetActivityState("idle");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFooterMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    const visitId = window.crypto.randomUUID();
    let refreshTimer: ReturnType<typeof window.setTimeout> | undefined;

    function scheduleRefresh(hasActiveJob: boolean) {
      if (cancelled) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshConversation(), hasActiveJob ? 700 : 8_000);
    }

    function applyConversationState(state: ConversationState) {
      if (cancelled) return;
      const nextWorkspaceSignature = conversationWorkspaceSignature(state);
      if (hasAppliedConversationStateRef.current && nextWorkspaceSignature !== workspaceSignatureRef.current) {
        const conversationSection = conversationSectionRef.current;
        const bounds = conversationSection?.getBoundingClientRect();
        if (bounds && bounds.bottom > 0 && bounds.top < window.innerHeight) conversationAnchorTopRef.current = bounds.top;
        const newestComponent = state.workspace.document.components.at(-1);
        setWorkspaceReadyLabel(newestComponent?.title ?? "Your activity space");
      }
      workspaceSignatureRef.current = nextWorkspaceSignature;
      hasAppliedConversationStateRef.current = true;
      setMessages((current) => current.length === state.messages.length && current.every((message, index) => {
        const next = state.messages[index];
        return message.id === next.id && message.body === next.body && message.createdAt === next.createdAt;
      }) ? current : state.messages);
      setActiveJob((current) => current?.status === state.activeJob?.status && current?.kind === state.activeJob?.kind ? current : state.activeJob);
      setAgentOnline(state.agentOnline);
      setWorkspace(state.workspace.document);
      setRecords(state.records ?? []);
      setConnectionState("ready");
    }

    async function openActivity() {
      try {
        const response = await fetch("/api/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "open", activityId: item.id, date: localDateKey(), visitId }),
        });
        if (!response.ok) throw new Error("Luna could not join this activity yet.");
        const state = await response.json() as ConversationState;
        applyConversationState(state);
        scheduleRefresh(Boolean(state.activeJob));
      } catch {
        if (!cancelled) {
          setAgentOnline(false);
          setConnectionState("error");
        }
        scheduleRefresh(false);
      }
    }

    async function refreshConversation() {
      if (sendingRef.current) return;
      try {
        const response = await fetch(`/api/activity?activityId=${encodeURIComponent(item.id)}&date=${localDateKey()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Conversation refresh failed.");
        const state = await response.json() as ConversationState;
        applyConversationState(state);
        scheduleRefresh(Boolean(state.activeJob));
      } catch {
        if (!cancelled) {
          setAgentOnline(false);
          setConnectionState("error");
        }
        scheduleRefresh(false);
      }
    }

    refreshConversationRef.current = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void refreshConversation();
    };
    void openActivity();
    return () => {
      cancelled = true;
      refreshConversationRef.current = () => {};
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [item.id]);

  useLayoutEffect(() => {
    const previousTop = conversationAnchorTopRef.current;
    if (previousTop === null) return;
    conversationAnchorTopRef.current = null;
    const nextTop = conversationSectionRef.current?.getBoundingClientRect().top;
    if (typeof nextTop === "number") window.scrollBy({ top: nextTop - previousTop, behavior: "auto" });
  }, [records, workspace]);

  useEffect(() => {
    if (!conversationShouldFollowRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const log = conversationLogRef.current;
      if (!log) return;
      log.scrollTo({
        top: log.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLunaThinking, workspaceReadyLabel]);

  function handleConversationScroll() {
    const log = conversationLogRef.current;
    if (!log) return;
    conversationShouldFollowRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 72;
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || isSending) return;
    const clientMessageId = window.crypto.randomUUID();
    const optimisticMessage: ConversationMessage = {
      id: `optimistic:${clientMessageId}`,
      author: "user",
      body,
      createdAt: new Date().toISOString().replace("T", " ").replace("Z", ""),
      pending: true,
    };
    conversationShouldFollowRef.current = true;
    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setIsSending(true);
    sendingRef.current = true;
    try {
      const response = await fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "message", activityId: item.id, body, messageId: clientMessageId, date: localDateKey() }),
      });
      if (!response.ok) throw new Error("Message could not be saved.");
      const state = await response.json() as ConversationState;
      setMessages(state.messages);
      setActiveJob(state.activeJob);
      setAgentOnline(state.agentOnline);
      setWorkspace(state.workspace.document);
      setRecords(state.records ?? []);
      workspaceSignatureRef.current = conversationWorkspaceSignature(state);
      hasAppliedConversationStateRef.current = true;
      setWorkspaceReadyLabel(null);
      setConnectionState("ready");
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setDraft(body);
      setAgentOnline(false);
      setConnectionState("error");
    } finally {
      setIsSending(false);
      sendingRef.current = false;
      refreshConversationRef.current();
    }
  }

  function viewWorkspaceUpdate() {
    setWorkspaceReadyLabel(null);
    if (window.matchMedia("(max-width: 680px)").matches) {
      conversationDrawer.setOpen(false);
      return;
    }
    document.getElementById(`activity-workspace-${item.id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function mutateRecord(recordKey: string, operation: string, payload: Record<string, unknown>) {
    setRecordError(null);
    try {
      const response = await fetch("/api/activity/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, recordKey, operation, payload, actionId: window.crypto.randomUUID(), date: localDateKey() }),
      });
      const result = await response.json() as { records?: ActivityRecord[]; error?: string };
      if (!response.ok || !result.records) throw new Error(result.error || "That change could not be saved.");
      setRecords(result.records);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "That change could not be saved.");
    }
  }

  async function toggleActivityComplete() {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const timing = isComplete ? null : captureActivityTimingSnapshot(workspaceActivity, workspace);
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: isComplete ? "reopen" : "complete",
          activityId: item.id,
          date: localDateKey(),
          timing,
        }),
      });
      if (!response.ok) throw new Error("Activity completion could not be saved.");
      const result = await response.json() as { completed: boolean; completedAt?: string };
      onComplete(result.completed ? result.completedAt ?? new Date().toISOString() : null);
      setConnectionState("ready");
    } catch {
      setConnectionState("error");
    } finally {
      setIsCompleting(false);
    }
  }

  async function toggleActivitySkip() {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: isSkipped ? "unskip" : "skip",
          activityId: item.id,
          date: localDateKey(),
        }),
      });
      if (!response.ok) throw new Error("Activity skip could not be saved.");
      const result = await response.json() as { skipped: boolean; skippedAt?: string | null };
      onSkip(result.skipped ? result.skippedAt ?? new Date().toISOString() : null);
      setConnectionState("ready");
    } catch {
      setConnectionState("error");
    } finally {
      setIsSkipping(false);
    }
  }

  async function resetActivityForTesting() {
    if (resetActivityState === "resetting") return;
    setResetActivityState("resetting");
    try {
      const response = await fetch("/api/activity/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, date: localDateKey() }),
      });
      const state = await response.json() as ConversationState & { error?: string };
      if (!response.ok) throw new Error(state.error || "This activity could not be reset.");
      resetActivityTimingState([item.id]);
      onComplete(null);
      onSkip(null);
      setMessages(state.messages ?? []);
      setActiveJob(state.activeJob ?? null);
      setAgentOnline(Boolean(state.agentOnline));
      setWorkspace(state.workspace?.document ?? EMPTY_WORKSPACE);
      setRecords(state.records ?? []);
      workspaceSignatureRef.current = conversationWorkspaceSignature(state);
      hasAppliedConversationStateRef.current = true;
      setWorkspaceReadyLabel(null);
      setRecordError(null);
      setDraft("");
      setConnectionState("ready");
      setIsFooterMenuOpen(false);
      setResetActivityState("idle");
    } catch {
      setResetActivityState("error");
    }
  }

  return (
    <div className="activity-expansion">
      <div className={`activity-workbench-grid ${isOpeningActivity ? "is-opening" : showWorkspace ? "" : "is-conversation-only"}`}>
        {isOpeningActivity ? (
          <div className="activity-opening-state" role="status" aria-live="polite">
            <span className="activity-opening-mark" aria-hidden="true"><Sparkles size={17} strokeWidth={1.8} /></span>
            <strong>Getting things ready…</strong>
            <p>Your notes and activity space will be here in a moment.</p>
            <span className="activity-opening-progress" aria-hidden="true" />
          </div>
        ) : <>
          <ActivityWorkspace activity={workspaceActivity} onRecordMutation={mutateRecord} onTalkWithLuna={() => conversationDrawer.setOpen(true)} recordError={recordError} records={records} workspace={workspace} workState={workspaceWorkState} />

          <section className={`activity-conversation ${conversationDrawer.isOpen ? "is-drawer-open" : "is-drawer-collapsed"} ${showWorkspace ? "has-workspace-peek" : ""}`} aria-label={`${item.title} conversation`} ref={conversationSectionRef}>
          <header>
            <button
              aria-expanded={conversationDrawer.isOpen}
              className="conversation-drawer-toggle"
              type="button"
              onClick={conversationDrawer.toggle}
              onPointerCancel={conversationDrawer.handlePointerCancel}
              onPointerDown={conversationDrawer.handlePointerDown}
              onPointerUp={conversationDrawer.handlePointerUp}
            >
              <strong>Notes & conversation</strong>
              <span className="conversation-drawer-state">
                <span className={`conversation-status ${connectionState === "ready" && (!activeJob || activeJobHasWorker) ? "is-prototype" : ""}`}><span /> {isSending ? "Luna is thinking…" : connectionState === "error" || (activeJob && !activeJobHasWorker) ? "Luna will catch up" : activeJob?.kind === "activity_setup" ? "Luna is setting this up…" : activeJob?.kind === "workspace_refresh" ? "Luna is organizing this…" : isLunaThinking ? "Luna is thinking…" : "Connected"}</span>
                {conversationDrawer.hasUnreadLuna ? <span className="conversation-unread-badge" aria-label="New message from Luna">1</span> : null}
                <ChevronDown className="conversation-drawer-chevron" aria-hidden="true" size={17} />
              </span>
            </button>
          </header>
          <div className="conversation-log" aria-live="polite" ref={conversationLogRef} onScroll={handleConversationScroll}>
            {messages.length ? <div className="date-separator"><span>Recent</span></div> : null}
            {messages.map((message) => (
              <div className={`message-group message-${message.author}`} key={message.id}>
                <div className="message-bubble">{message.body}</div>
                <div className="message-meta">{conversationTime(message.createdAt)}{message.author === "user" ? message.pending ? <span>Sending…</span> : <span aria-label="Saved message">✓</span> : null}</div>
              </div>
            ))}
            {workspaceReadyLabel ? (
              <button className="workspace-ready-notice" type="button" onClick={viewWorkspaceUpdate}>
                <Sparkles aria-hidden="true" size={14} />
                <span><strong>{workspaceReadyLabel}</strong> is ready</span>
                <b>View</b>
              </button>
            ) : null}
            {isLunaThinking ? <div className="message-group message-luna"><div className="message-bubble prototype-typing" aria-label="Luna is typing"><span /><span /><span /></div></div> : null}
          </div>
          <div className="conversation-composer">
            <textarea
              aria-label={`Message ${item.title}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Talk with Luna about ${item.title.toLowerCase()}…`}
              rows={2}
              value={draft}
            />
            <button aria-label="Send message" disabled={!draft.trim() || isSending} type="button" onClick={() => void sendMessage()}><Send aria-hidden="true" size={16} strokeWidth={1.9} /></button>
          </div>
          </section>
        </>}
      </div>

      <footer className="activity-footer">
        <div className="activity-footer-tools">
          <div className="activity-footer-menu" ref={footerMenuRef}>
            <button
              aria-expanded={isFooterMenuOpen}
              aria-haspopup="menu"
              aria-label={`More options for ${item.title}`}
              className="activity-footer-menu-trigger"
              type="button"
              onClick={() => {
                setIsFooterMenuOpen((current) => !current);
                setResetActivityState("idle");
              }}
            ><MoreVertical aria-hidden="true" size={17} strokeWidth={2} /></button>
            {isFooterMenuOpen ? (
              <div
                aria-label={resetActivityState === "confirming" || resetActivityState === "error" ? `Reset ${item.title}` : `Options for ${item.title}`}
                className={`activity-footer-menu-panel ${resetActivityState !== "idle" ? "is-confirming" : ""}`}
                role={resetActivityState === "confirming" || resetActivityState === "error" ? "dialog" : "menu"}
              >
                {resetActivityState === "confirming" || resetActivityState === "error" ? (
                  <div className="activity-reset-confirmation">
                    <strong>{resetActivityState === "error" ? "Reset didn’t work" : "Reset this activity?"}</strong>
                    <span>{resetActivityState === "error" ? "Nothing was changed. You can try again." : "This clears Luna’s thread, workspace, saved activity details, and run history. The activity stays in your schedule."}</span>
                    <div>
                      <button type="button" onClick={() => setResetActivityState("idle")}>Cancel</button>
                      <button className="activity-reset-confirm-button" type="button" onClick={() => void resetActivityForTesting()}>{resetActivityState === "error" ? "Try Again" : "Reset Activity"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onEdit(); }}><Pencil aria-hidden="true" size={15} /> Edit activity</button>
                    <button className="activity-reset-menu-action" role="menuitem" type="button" onClick={() => setResetActivityState("confirming")}><RotateCcw aria-hidden="true" size={15} /> Dev reset activity</button>
                    <button className="activity-remove-menu-action" role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onRemove(); }}><Trash2 aria-hidden="true" size={15} /> Remove activity</button>
                  </>
                )}
              </div>
            ) : null}
          </div>
          {timelineEnabled ? <div className="duration-control" aria-label={`Duration for ${item.title}`}>
            <button type="button" aria-label={`Reduce ${item.title} by ${DURATION_STEP} minutes`} onClick={() => onAdjustDuration(-DURATION_STEP)}>−</button>
            <div className="duration-value">
              <input
                aria-label={`Duration for ${item.title} in minutes`}
                inputMode="numeric"
                max="480"
                min="5"
                onBlur={() => onSetDuration(normalizeActivityDuration(item.duration))}
                onChange={(event) => onSetDuration(event.target.valueAsNumber)}
                step="5"
                type="number"
                value={item.duration}
              />
              <span className="duration-unit">min</span>
            </div>
            <button type="button" aria-label={`Add ${DURATION_STEP} minutes to ${item.title}`} onClick={() => onAdjustDuration(DURATION_STEP)}>+</button>
          </div> : null}
        </div>
        <div className="activity-footer-status">
          <button className={`skip-activity-button ${isSkipped ? "is-skipped" : ""}`} disabled={isSkipping} type="button" onClick={() => void toggleActivitySkip()}>
            <SkipForward aria-hidden="true" size={15} strokeWidth={2} /> {isSkipping ? "Saving…" : isSkipped ? "Skipped Today" : "Skip for Today"}
          </button>
          <button className={`complete-activity-button ${isComplete ? "is-complete" : ""}`} disabled={isCompleting} type="button" onClick={() => void toggleActivityComplete()}>
            <Check aria-hidden="true" size={16} strokeWidth={2.2} /> {isCompleting ? "Saving…" : isComplete ? "Completed" : "Mark Complete"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function normalizeActivityDuration(duration: number) {
  if (!Number.isFinite(duration)) return 15;
  return Math.min(480, Math.max(5, Math.round(duration / 5) * 5));
}

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function readLegacyRoutine() {
  let nextItems = INITIAL_ITEMS;
  try {
    const savedDeletedIds = window.localStorage.getItem(DELETED_KEY);
    const deletedIds = new Set<string>();
    if (savedDeletedIds) {
      const parsedDeletedIds = JSON.parse(savedDeletedIds) as unknown;
      if (Array.isArray(parsedDeletedIds)) {
        parsedDeletedIds.forEach((id) => {
          if (typeof id === "string" && INITIAL_IDS.has(id)) deletedIds.add(id);
        });
      }
    }

    const savedItems = window.localStorage.getItem(STORAGE_KEY);
    if (!savedItems) return INITIAL_ITEMS.filter((item) => !deletedIds.has(item.id));
    const saved = JSON.parse(savedItems) as unknown;
    if (!Array.isArray(saved)) return INITIAL_ITEMS.filter((item) => !deletedIds.has(item.id));

    const defaults = new Map(INITIAL_ITEMS.map((item) => [item.id, item]));
    const restored = (saved as RoutineItem[]).flatMap((savedItem) => {
      if (deletedIds.has(savedItem.id)) return [];
      const currentItem = defaults.get(savedItem.id);
      if (!currentItem) {
        if (
          typeof savedItem.id !== "string" ||
          !savedItem.id.startsWith("custom-") ||
          typeof savedItem.title !== "string" ||
          !savedItem.title.trim() ||
          !normalizeCategory(savedItem.category)
        ) return [];
        const category = normalizeCategory(savedItem.category);
        if (!category) return [];
        const meta = CATEGORY_META[category];
        return [{
          id: savedItem.id,
          title: savedItem.title.trim().slice(0, 60),
          detail: "Custom block",
          duration: normalizeActivityDuration(savedItem.duration),
          category,
          ...meta,
        }];
      }
      const savedDuration = normalizeActivityDuration(
        Number.isFinite(savedItem.duration) ? savedItem.duration : currentItem.duration,
      );
      const duration = savedItem.id === "breakfast" && savedItem.title?.includes("shake")
        ? normalizeActivityDuration(savedDuration - 5)
        : savedDuration;
      const title = typeof savedItem.title === "string" && savedItem.title.trim()
        ? savedItem.title.trim().slice(0, 60)
        : currentItem.title;
      const category = normalizeCategory(savedItem.category) ?? currentItem.category;
      return [{
        ...currentItem,
        title,
        category,
        color: category === currentItem.category ? currentItem.color : CATEGORY_META[category].color,
        duration,
      }];
    });
    const restoredIds = new Set(restored.map((item) => item.id));
    const merged = [...restored];
    INITIAL_ITEMS.forEach((item, index) => {
      if (deletedIds.has(item.id) || restoredIds.has(item.id)) return;
      const nextKnownItem = INITIAL_ITEMS.slice(index + 1).find((candidate) => !deletedIds.has(candidate.id) && restoredIds.has(candidate.id));
      const insertAt = nextKnownItem ? merged.findIndex((candidate) => candidate.id === nextKnownItem.id) : merged.length;
      merged.splice(insertAt, 0, item);
      restoredIds.add(item.id);
    });
    nextItems = merged;
  } catch {
    nextItems = INITIAL_ITEMS;
  }
  return nextItems;
}

function hydrateStoredItems(value: unknown): RoutineItem[] {
  if (!Array.isArray(value)) throw new Error("The saved day has an invalid item list.");
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("The saved day contains an invalid item.");
    const item = candidate as Partial<RoutineItem>;
    const category = normalizeCategory(item.category);
    if (
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.duration !== "number" ||
      !category ||
      typeof item.icon !== "string" ||
      typeof item.color !== "string"
    ) throw new Error("The saved day contains an invalid item.");
    return { ...item, category, detail: "Saved activity" } as RoutineItem;
  });
}

export default function Home() {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [startMinutes, setStartMinutes] = useState(START_MINUTES);
  const [preferredStartMinutes, setPreferredStartMinutes] = useState(START_MINUTES);
  const [dayStartedAt, setDayStartedAt] = useState<string | null>(null);
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "retrying">("loading");
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftCategory, setDraftCategory] = useState<Category>("Care");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("Care");
  const [mobileActivityMenuId, setMobileActivityMenuId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [daySettings, setDaySettings] = useState<DaySettings>(DEFAULT_DAY_SETTINGS);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [resetTodayState, setResetTodayState] = useState<"idle" | "confirming" | "resetting" | "error">("idle");
  const [mobileResetActivity, setMobileResetActivity] = useState<{ id: string; state: "confirming" | "resetting" | "error" } | null>(null);
  const [activityResetVersions, setActivityResetVersions] = useState<Record<string, number>>({});
  const [realMinutes, setRealMinutes] = useState(minutesNow);
  const [fakeMinutes, setFakeMinutes] = useState<number | null>(DEFAULT_DEV_MINUTES);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [startConversationActivityId, setStartConversationActivityId] = useState<string | null>(null);
  const [dismissedClockActivityId, setDismissedClockActivityId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [pendingActivityIds, setPendingActivityIds] = useState<Set<string>>(() => new Set());
  const [templateSaveState, setTemplateSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const menuRef = useRef<HTMLDivElement>(null);
  const devMenuRef = useRef<HTMLDivElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const templateSaveResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipNextSave = useRef(true);

  useEffect(() => {
    const timer = window.setInterval(() => setRealMinutes(minutesNow()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let storedMinutes: number | null | undefined;
    try {
      const savedDevTime = window.localStorage.getItem(DEV_TIME_KEY);
      if (savedDevTime === "actual") {
        storedMinutes = null;
      } else if (savedDevTime !== null) {
        const savedMinutes = Number(savedDevTime);
        if (Number.isInteger(savedMinutes) && savedMinutes >= 0 && savedMinutes <= 1439) {
          storedMinutes = savedMinutes;
        }
      }
    } catch {
      // Device-local developer preferences are optional; 7:30 AM remains the fallback.
    }

    if (storedMinutes === undefined) return;
    const restoreTimer = window.setTimeout(() => setFakeMinutes(storedMinutes), 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const date = localDateKey();
    const endpoint = `/api/day?date=${date}`;

    async function load() {
      try {
        setSaveState("loading");
        let response = await fetch(endpoint, { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (!response.ok) throw new Error(`Could not load the saved day (${response.status}).`);
        let day = await response.json() as { items: unknown; startMinutes: number; preferredStartMinutes?: number; startedAt?: string | null; settings?: unknown; needsImport: boolean };

        if (day.needsImport) {
          const legacyItems = readLegacyRoutine();
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: legacyItems, startMinutes: START_MINUTES }),
          });
          if (!response.ok) throw new Error(`Could not import the existing routine (${response.status}).`);
          day = await response.json() as typeof day;
          window.localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        }

        if (cancelled) return;
        skipNextSave.current = true;
        const loadedItems = hydrateStoredItems(day.items);
        setItems(loadedItems);
        setCompletedIds(new Set(loadedItems.filter((item) => item.completedAt).map((item) => item.id)));
        setStartMinutes(day.startMinutes);
        setPreferredStartMinutes(day.preferredStartMinutes ?? START_MINUTES);
        setDayStartedAt(day.startedAt ?? null);
        setDaySettings(normalizeDaySettings(day.settings));
        setDatabaseReady(true);
        setHasLoaded(true);
        setSaveState("saved");
      } catch {
        if (cancelled) return;
        setSaveState("retrying");
        retryTimer = setTimeout(load, 3000);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => settingsCloseRef.current?.focus(), 0);
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setIsSettingsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!databaseReady) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const endpoint = `/api/day?date=${localDateKey()}`;
    async function save() {
      try {
        setSaveState("saving");
        const response = await fetch(endpoint, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items, startMinutes }),
        });
        if (!response.ok) throw new Error(`Could not save the day (${response.status}).`);
        if (!cancelled) setSaveState("saved");
      } catch {
        if (cancelled) return;
        setSaveState("retrying");
        retryTimer = setTimeout(save, 3000);
      }
    }

    const saveTimer = setTimeout(() => void save(), 300);
    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [databaseReady, items, startMinutes]);

  useEffect(() => {
    if (!editingId) return;
    const item = items.find((candidate) => candidate.id === editingId);
    if (!item) return;
    const hasChanges = editTitle !== item.title || editCategory !== item.category;
    if (hasChanges) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".inline-edit-form")) return;
      setEditingId(null);
      setEditTitle("");
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [editCategory, editTitle, editingId, items]);

  useEffect(() => {
    if (!mobileActivityMenuId) return;

    function handleMobileActivityMenuPointerDown(event: PointerEvent) {
      const menu = event.target instanceof Element ? event.target.closest(".mobile-activity-menu") : null;
      if (menu?.getAttribute("data-activity-id") === mobileActivityMenuId) return;
      setMobileActivityMenuId(null);
      setMobileResetActivity(null);
    }

    function handleMobileActivityMenuKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileActivityMenuId(null);
        setMobileResetActivity(null);
      }
    }

    document.addEventListener("pointerdown", handleMobileActivityMenuPointerDown);
    document.addEventListener("keydown", handleMobileActivityMenuKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleMobileActivityMenuPointerDown);
      document.removeEventListener("keydown", handleMobileActivityMenuKeyDown);
    };
  }, [mobileActivityMenuId]);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleMenuPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setIsMenuOpen(false);
    }

    function handleMenuKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleMenuPointerDown);
    document.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleMenuPointerDown);
      document.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isDevMenuOpen) return;

    function handleDevMenuPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && devMenuRef.current?.contains(event.target)) return;
      setIsDevMenuOpen(false);
      setResetTodayState("idle");
    }

    function handleDevMenuKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDevMenuOpen(false);
        setResetTodayState("idle");
      }
    }

    document.addEventListener("pointerdown", handleDevMenuPointerDown);
    document.addEventListener("keydown", handleDevMenuKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDevMenuPointerDown);
      document.removeEventListener("keydown", handleDevMenuKeyDown);
    };
  }, [isDevMenuOpen]);

  useEffect(() => () => {
    if (templateSaveResetTimer.current) clearTimeout(templateSaveResetTimer.current);
  }, []);

  const completedBeforeLaunchIds = useMemo(() => {
    const launchTimestamp = storedTimestampMillis(dayStartedAt);
    if (launchTimestamp === null) return new Set<string>();
    return new Set(items.flatMap((item) => {
      const completedTimestamp = storedTimestampMillis(item.completedAt);
      return completedTimestamp !== null && completedTimestamp <= launchTimestamp ? [item.id] : [];
    }));
  }, [dayStartedAt, items]);

  const scheduledItems = useMemo(() => {
    let cursor = startMinutes;
    return items.map<ScheduledItem>((item) => {
      const consumesScheduleTime = !item.skippedAt && !completedBeforeLaunchIds.has(item.id);
      const scheduled = { ...item, start: cursor, end: cursor + (consumesScheduleTime ? item.duration : 0) };
      cursor = scheduled.end;
      return scheduled;
    });
  }, [completedBeforeLaunchIds, items, startMinutes]);

  const totalMinutes = useMemo(
    () => items.reduce((total, item) => total + (item.skippedAt ? 0 : item.duration), 0),
    [items],
  );
  const scheduledMinutes = useMemo(
    () => items.reduce((total, item) => total + (item.skippedAt || completedBeforeLaunchIds.has(item.id) ? 0 : item.duration), 0),
    [completedBeforeLaunchIds, items],
  );
  const finishMinutes = startMinutes + scheduledMinutes;

  const displayedMinutes = fakeMinutes ?? realMinutes;
  const dayMode = dayModePolicy(daySettings);
  const timelineEnabled = dayMode.timelineEnabled;
  const isDayStarted = timelineEnabled && Boolean(dayStartedAt);
  const clockCurrentItem = isDayStarted ? scheduledItems.find((item) => displayedMinutes >= item.start && displayedMinutes < item.end) ?? null : null;
  const selectedItemExists = selectedActivityId ? scheduledItems.some((item) => item.id === selectedActivityId) : false;
  const expandedActivityId = selectedItemExists
    ? selectedActivityId
    : timelineEnabled && clockCurrentItem && !completedIds.has(clockCurrentItem.id) && dismissedClockActivityId !== clockCurrentItem.id
      ? clockCurrentItem.id
      : null;
  const passedItemIds = useMemo(() => new Set(timelineEnabled && isDayStarted
    ? scheduledItems.filter((item) => item.completedAt || item.skippedAt || item.end <= displayedMinutes).map((item) => item.id)
    : []), [displayedMinutes, isDayStarted, scheduledItems, timelineEnabled]);
  const displayedScheduledItems = useMemo(() => timelineEnabled && isDayStarted
    ? [
        ...scheduledItems.filter((item) => passedItemIds.has(item.id)),
        ...scheduledItems.filter((item) => !passedItemIds.has(item.id)),
      ]
    : scheduledItems, [isDayStarted, passedItemIds, scheduledItems, timelineEnabled]);
  const nowLineIndex = timelineEnabled && isDayStarted ? passedItemIds.size : null;

  useEffect(() => {
    if (!expandedActivityId || !window.matchMedia("(max-width: 680px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [expandedActivityId]);

  const categoryTotals = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      minutes: items.filter((item) => item.category === category && !item.skippedAt).reduce((sum, item) => sum + item.duration, 0),
      count: items.filter((item) => item.category === category && !item.skippedAt).length,
      color: items.find((item) => item.category === category)?.color ?? "#8f9995",
    })).filter((entry) => entry.minutes > 0),
    [items],
  );

  const fakeTimePresets = [
    { label: "Before", value: Math.max(0, startMinutes - 15) },
    { label: "Start", value: startMinutes },
    { label: "Middle", value: startMinutes + Math.round(scheduledMinutes / 2 / 5) * 5 },
    { label: "Done", value: Math.min(1439, finishMinutes + 5) },
  ];
  const minutesUntilPreferredStart = Math.max(0, preferredStartMinutes - displayedMinutes);
  const nextStartBoundary = Math.min(1435, Math.ceil(displayedMinutes / 5) * 5);
  const activeItemCount = items.filter((item) => !item.skippedAt).length;
  const completedItemCount = items.filter((item) => item.completedAt).length;

  async function setTimelineEnabled(enabled: boolean) {
    if (settingsSaveState === "saving" || enabled === timelineEnabled) return;
    setSettingsSaveState("saving");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dayTimelineEnabled: enabled }),
      });
      const result = await response.json() as { settings?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error || "Settings could not be saved.");
      setDaySettings(normalizeDaySettings(result.settings));
      setSelectedActivityId(null);
      setDismissedClockActivityId(null);
      setStartConversationActivityId(null);
      setSettingsSaveState("idle");
    } catch {
      setSettingsSaveState("error");
    }
  }

  async function startDay() {
    if (isStartingDay || isDayStarted) return;
    setIsStartingDay(true);
    try {
      const response = await fetch(`/api/day?date=${localDateKey()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "start-day", currentMinutes: displayedMinutes }),
      });
      if (!response.ok) throw new Error("The day could not be started.");
      const day = await response.json() as { items: unknown; startMinutes: number; startedAt: string; preferredStartMinutes?: number };
      const launchedItems = hydrateStoredItems(day.items);
      skipNextSave.current = true;
      setItems(launchedItems);
      setCompletedIds(new Set(launchedItems.filter((item) => item.completedAt).map((item) => item.id)));
      setStartMinutes(day.startMinutes);
      setPreferredStartMinutes(day.preferredStartMinutes ?? preferredStartMinutes);
      setDayStartedAt(day.startedAt);
      setStartConversationActivityId(launchedItems.find((item) => !item.completedAt && !item.skippedAt)?.id ?? null);
      setSelectedActivityId(null);
      setDismissedClockActivityId(null);
      setSaveState("saved");
    } catch {
      setSaveState("retrying");
    } finally {
      setIsStartingDay(false);
    }
  }

  async function resetToday() {
    if (resetTodayState === "resetting") return;
    setResetTodayState("resetting");
    try {
      const response = await fetch(`/api/day?date=${localDateKey()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reset-today" }),
      });
      if (!response.ok) throw new Error("Today could not be reset.");
      const day = await response.json() as { items: unknown; startMinutes: number; preferredStartMinutes?: number; startedAt?: string | null };
      const resetItems = hydrateStoredItems(day.items);
      resetActivityTimingState(resetItems.map((item) => item.id));
      skipNextSave.current = true;
      setItems(resetItems);
      setCompletedIds(new Set());
      setStartMinutes(day.startMinutes);
      setPreferredStartMinutes(day.preferredStartMinutes ?? START_MINUTES);
      setDayStartedAt(day.startedAt ?? null);
      setStartConversationActivityId(null);
      setSelectedActivityId(null);
      setDismissedClockActivityId(null);
      setPendingActivityIds(new Set());
      setSaveState("saved");
      setIsDevMenuOpen(false);
      setResetTodayState("idle");
    } catch {
      setSaveState("retrying");
      setResetTodayState("error");
    }
  }

  function setDuration(id: string, value: number) {
    if (!Number.isFinite(value)) return;
    const duration = Math.min(480, Math.max(1, Math.round(value)));
    setItems((current) => current.map((item) => item.id === id ? { ...item, duration } : item));
  }

  function adjustDuration(id: string, delta: number) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    const duration = delta > 0
      ? Math.floor(item.duration / DURATION_STEP) * DURATION_STEP + DURATION_STEP
      : Math.ceil(item.duration / DURATION_STEP) * DURATION_STEP - DURATION_STEP;
    setDuration(id, Math.max(5, duration));
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    const meta = CATEGORY_META[draftCategory];
    const item: RoutineItem = {
      id: `custom-${window.crypto.randomUUID()}`,
      title: title.slice(0, 60),
      detail: "Custom block",
      duration: normalizeActivityDuration(draftDuration),
      category: draftCategory,
      ...meta,
    };
    setItems((current) => [...current, item]);
    setDraftTitle("");
    setDraftDuration(15);
    setIsAdding(false);
  }

  async function saveTodayAsTemplate() {
    if (templateSaveState === "saving") return;
    if (templateSaveResetTimer.current) clearTimeout(templateSaveResetTimer.current);
    setTemplateSaveState("saving");
    try {
      const response = await fetch(`/api/day?date=${localDateKey()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "save-template" }),
      });
      if (!response.ok) throw new Error(`Could not save the default template (${response.status}).`);
      setTemplateSaveState("saved");
      templateSaveResetTimer.current = setTimeout(() => {
        setIsMenuOpen(false);
        setTemplateSaveState("idle");
      }, 1400);
    } catch {
      setTemplateSaveState("error");
    }
  }

  function removeItem(id: string) {
    setMobileActivityMenuId(null);
    if (editingId === id) cancelEditing();
    if (selectedActivityId === id) setSelectedActivityId(null);
    setCompletedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function startEditing(item: RoutineItem) {
    setMobileActivityMenuId(null);
    setMobileResetActivity(null);
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = editTitle.trim();
    if (!editingId || !title) return;
    setItems((current) => current.map((item) => {
      if (item.id !== editingId) return item;
      const categoryChanged = item.category !== editCategory;
      return {
        ...item,
        title: title.slice(0, 60),
        category: editCategory,
        color: categoryChanged ? CATEGORY_META[editCategory].color : item.color,
        icon: categoryChanged && item.id.startsWith("custom-") ? CATEGORY_META[editCategory].icon : item.icon,
      };
    }));
    cancelEditing();
  }

  function moveItem(sourceId: string, targetId: string, position: "before" | "after") {
    if (sourceId === targetId) return;
    setItems((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex((item) => item.id === sourceId);
      if (sourceIndex < 0 || !next.some((item) => item.id === targetId)) return current;
      const [moved] = next.splice(sourceIndex, 1);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, moved);
      return next;
    });
  }

  function moveByKeyboard(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function handleDragKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveByKeyboard(id, event.key === "ArrowUp" ? -1 : 1);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      id: targetId,
      position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (draggingId && dropTarget?.id === targetId) {
      moveItem(draggingId, targetId, dropTarget.position);
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) setDropTarget(null);
  }

  function setTestTime(value: number | null) {
    setFakeMinutes(value);
    setDismissedClockActivityId(null);
    try {
      window.localStorage.setItem(DEV_TIME_KEY, value === null ? "actual" : String(value));
    } catch {
      // The selected time still applies for this session when device storage is unavailable.
    }
  }

  async function resetActivityForTesting(item: ScheduledItem) {
    if (mobileResetActivity?.id === item.id && mobileResetActivity.state === "resetting") return;
    setMobileResetActivity({ id: item.id, state: "resetting" });
    try {
      const response = await fetch("/api/activity/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, date: localDateKey() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "This activity could not be reset.");
      resetActivityTimingState([item.id]);
      setCompletedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setItems((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, completedAt: null, skippedAt: null }
        : candidate));
      setActivityResetVersions((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
      setMobileActivityMenuId(null);
      setMobileResetActivity(null);
    } catch {
      setMobileResetActivity({ id: item.id, state: "error" });
    }
  }

  function openActivity(id: string) {
    setMobileActivityMenuId(null);
    setStartConversationActivityId(null);
    setSelectedActivityId(id);
    setDismissedClockActivityId(null);
  }

  function collapseActivity() {
    setMobileActivityMenuId(null);
    setSelectedActivityId(null);
    if (clockCurrentItem) setDismissedClockActivityId(clockCurrentItem.id);
  }

  function toggleComplete(id: string, completedAt: string | null) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (completedAt) next.add(id);
      else next.delete(id);
      return next;
    });
    setItems((current) => current.map((item) => item.id === id ? { ...item, completedAt, skippedAt: completedAt ? null : item.skippedAt } : item));
    setSelectedActivityId(null);
    if (clockCurrentItem) setDismissedClockActivityId(clockCurrentItem.id);
  }

  function toggleSkip(id: string, skippedAt: string | null) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (skippedAt) next.delete(id);
      return next;
    });
    setItems((current) => current.map((item) => item.id === id ? { ...item, skippedAt, completedAt: skippedAt ? null : item.completedAt } : item));
    setSelectedActivityId(null);
    if (clockCurrentItem) setDismissedClockActivityId(clockCurrentItem.id);
  }

  async function updateClosedActivity(item: ScheduledItem, mode: "complete" | "reopen" | "skip" | "unskip") {
    if (pendingActivityIds.has(item.id)) return;
    setPendingActivityIds((current) => new Set(current).add(item.id));
    try {
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, activityId: item.id, date: localDateKey(), timing: null }),
      });
      if (!response.ok) throw new Error("Activity status could not be saved.");
      if (mode === "complete" || mode === "reopen") {
        const result = await response.json() as { completed: boolean; completedAt?: string };
        toggleComplete(item.id, result.completed ? result.completedAt ?? new Date().toISOString() : null);
      } else {
        const result = await response.json() as { skipped: boolean; skippedAt?: string | null };
        toggleSkip(item.id, result.skipped ? result.skippedAt ?? new Date().toISOString() : null);
      }
      setSaveState("saved");
    } catch {
      setSaveState("retrying");
    } finally {
      setPendingActivityIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <main className={`app-shell ${timelineEnabled ? "is-timeline-mode" : "is-checklist-mode"}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">id</span>
          <div><strong>Ideal Day</strong><span>Personal protocol</span></div>
        </div>
        <div className="header-actions">
          <div className={`save-state save-state-${saveState}`}><span /> {{ loading: "Loading your day", saving: "Saving", saved: "Saved to your day", retrying: "Offline · retrying" }[saveState]}</div>
          <button
            aria-expanded={isSettingsOpen}
            aria-haspopup="dialog"
            aria-label="Open settings"
            className="settings-trigger"
            type="button"
            onClick={() => {
              setIsDevMenuOpen(false);
              setIsSettingsOpen(true);
            }}
          ><Settings aria-hidden="true" size={17} strokeWidth={1.8} /></button>
          <div className="dev-clock" ref={devMenuRef}>
            <button
              aria-expanded={isDevMenuOpen}
              aria-haspopup="dialog"
              className={`dev-clock-trigger ${fakeMinutes !== null ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                setIsSettingsOpen(false);
                setIsDevMenuOpen((current) => !current);
              }}
            >
              <Clock3 aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>Dev</span>
              {fakeMinutes !== null ? <strong>{formatTime(fakeMinutes)}</strong> : null}
            </button>
            {isDevMenuOpen ? (
              <div className="dev-clock-popover" role="dialog" aria-label="Development tools">
                <div className="dev-clock-heading">
                  <div><span>Development tools</span><strong>{formatTime(displayedMinutes)}</strong></div>
                  <button aria-label="Use actual time" disabled={fakeMinutes === null} type="button" onClick={() => setTestTime(null)}><RotateCcw aria-hidden="true" size={14} /> Actual time</button>
                </div>
                <label className="dev-time-field" htmlFor="dev-fake-time">
                  <span>Fake time of day</span>
                  <input
                    id="dev-fake-time"
                    type="time"
                    step="300"
                    value={timeInputValue(displayedMinutes)}
                    onChange={(event) => setTestTime(minutesFromTimeInput(event.target.value))}
                  />
                </label>
                <input
                  aria-label="Fake time slider"
                  className="dev-time-slider"
                  max="1435"
                  min="0"
                  step="5"
                  type="range"
                  value={displayedMinutes}
                  onChange={(event) => setTestTime(event.target.valueAsNumber)}
                />
                <div className="dev-time-presets">
                  {fakeTimePresets.map((preset) => <button key={preset.label} type="button" onClick={() => setTestTime(preset.value)}>{preset.label}<span>{formatTime(preset.value)}</span></button>)}
                </div>
                <button className="follow-clock-button" type="button" onClick={() => { setSelectedActivityId(null); setDismissedClockActivityId(null); }}>
                  Follow clock-selected activity
                </button>
                <div className="dev-reset-section">
                  {resetTodayState === "confirming" || resetTodayState === "error" ? (
                    <div className="dev-reset-confirm" role="group" aria-label="Confirm reset today">
                      <div>
                        <strong>{resetTodayState === "error" ? "Reset didn’t work" : "Reset today?"}</strong>
                        <span>{resetTodayState === "error" ? "Nothing was changed. You can try again." : "This clears today’s start, completion, skip, and timing progress. Your routine and Luna history stay put."}</span>
                      </div>
                      <div className="dev-reset-actions">
                        <button type="button" onClick={() => setResetTodayState("idle")}>Cancel</button>
                        <button className="confirm-reset-today" type="button" onClick={() => void resetToday()}>{resetTodayState === "error" ? "Try Again" : "Reset Today"}</button>
                      </div>
                    </div>
                  ) : (
                    <button className="reset-today-button" disabled={!hasLoaded || resetTodayState === "resetting"} type="button" onClick={() => setResetTodayState("confirming")}>
                      <RotateCcw aria-hidden="true" size={14} /> {resetTodayState === "resetting" ? "Resetting…" : "Reset Today"}
                    </button>
                  )}
                </div>
                <p>Fake time is only a preview. Reset Today changes today’s saved progress.</p>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {isSettingsOpen ? (
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSettingsOpen(false); }}>
          <section aria-labelledby="settings-title" aria-modal="true" className="settings-modal" role="dialog">
            <header className="settings-modal-header">
              <div><span>Ideal Day</span><h2 id="settings-title">Settings</h2></div>
              <button aria-label="Close settings" ref={settingsCloseRef} type="button" onClick={() => setIsSettingsOpen(false)}><X aria-hidden="true" size={18} /></button>
            </header>
            <div className="settings-modal-body">
              <div className="settings-section-heading">
                <span>Day flow</span>
                <p>Choose whether today follows the clock or stays flexible.</p>
              </div>
              <div className={`settings-toggle-row ${timelineEnabled ? "is-on" : ""}`}>
                <span className="settings-toggle-copy">
                  <strong id="day-timeline-label">Day Timeline</strong>
                  <small id="day-timeline-description">Place activities on the clock with durations, a preferred start, a moving Now line, and day-length summaries.</small>
                </span>
                <button
                  aria-checked={timelineEnabled}
                  aria-describedby="day-timeline-description"
                  aria-labelledby="day-timeline-label"
                  className="settings-switch"
                  disabled={settingsSaveState === "saving"}
                  role="switch"
                  type="button"
                  onClick={() => void setTimelineEnabled(!timelineEnabled)}
                >
                  <i />
                </button>
              </div>
              <div className="settings-mode-note" role="status">
                <Sparkles aria-hidden="true" size={16} />
                <div>
                  <strong>{timelineEnabled ? "Your day follows a timeline" : "Your day is a flexible checklist"}</strong>
                  <span>{timelineEnabled ? `Activities begin from ${formatTime(preferredStartMinutes)} when you start the day.` : "Timers and countdowns inside activities still work whenever they’re useful."}</span>
                </div>
              </div>
              {settingsSaveState === "error" ? <p className="settings-save-error">That setting didn’t save. Try the switch again.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <div className="page-shell">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">Daily protocol</p>
            <h1 id="page-title">{formatTodayHeading()}</h1>
            <p>{timelineEnabled
              ? "One repeatable sequence from wake-up to done. Reorder the flow and tune the timing until it feels natural."
              : "A living checklist for the day, with Luna and the right tools inside every activity."}</p>
          </div>
          <div className={`day-overview ${timelineEnabled ? "" : "is-checklist-overview"}`} aria-label="Day overview">
            {timelineEnabled ? <>
              <div><span>{isDayStarted ? "Started" : "Preferred start"}</span><strong>{formatTime(isDayStarted ? startMinutes : preferredStartMinutes)}</strong></div>
              <div><span>Finish</span><strong>{hasLoaded && isDayStarted ? formatTime(finishMinutes) : "—"}</strong></div>
              <div><span>Length</span><strong>{hasLoaded ? formatDuration(totalMinutes) : "—"}</strong></div>
            </> : <>
              <div><span>Completed</span><strong>{hasLoaded ? `${completedItemCount} of ${activeItemCount}` : "—"}</strong></div>
              <div><span>Remaining</span><strong>{hasLoaded ? Math.max(0, activeItemCount - completedItemCount) : "—"}</strong></div>
            </>}
          </div>
        </section>

        <div className="main-grid">
          <section className="planner" aria-labelledby="schedule-title">
            <header className="planner-header">
              <div>
                <h2 id="schedule-title">
                  <span className="desktop-schedule-title">{timelineEnabled ? "Schedule" : "Today"}</span>
                  <span className="mobile-schedule-title">{formatTodayHeading()}</span>
                </h2>
                <p>
                  <span className="desktop-schedule-summary">{hasLoaded ? timelineEnabled ? isDayStarted ? `${items.length} activities · times move with your day` : `${items.length} activities · ready when you are` : `${items.length} activities · move through them in your own time` : "Loading your saved day…"}</span>
                  <span className="mobile-schedule-summary">{hasLoaded ? timelineEnabled ? <>{items.length} activities <i aria-hidden="true">·</i> {formatDuration(totalMinutes)} total</> : <>{items.length} activities <i aria-hidden="true">·</i> {completedItemCount} done</> : "Loading your saved day…"}</span>
                </p>
              </div>
              <div className="planner-actions">
                <div className="planner-menu" ref={menuRef}>
                  <button
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                    aria-label="More schedule options"
                    className="planner-menu-trigger"
                    disabled={!hasLoaded}
                    type="button"
                    onClick={() => setIsMenuOpen((current) => !current)}
                  ><MoreHorizontal aria-hidden="true" size={16} strokeWidth={1.8} /></button>
                  {isMenuOpen ? (
                    <div className="planner-menu-popover" role="menu">
                      <p className="planner-menu-label">Template</p>
                      <button
                        className="planner-menu-item"
                        disabled={templateSaveState === "saving" || templateSaveState === "saved"}
                        role="menuitem"
                        type="button"
                        onClick={() => void saveTodayAsTemplate()}
                      >
                        {templateSaveState === "saved" ? <Check aria-hidden="true" size={15} strokeWidth={2} /> : null}
                        <span>{templateSaveState === "saving" ? "Saving template…" : templateSaveState === "saved" ? "Default template saved" : templateSaveState === "error" ? "Try saving again" : "Save today as default template"}</span>
                      </button>
                      {templateSaveState === "error" ? <p className="planner-menu-error" role="status">Couldn’t save. Try again.</p> : null}
                    </div>
                  ) : null}
                </div>
                <button
                  aria-controls="add-block-form"
                  aria-expanded={isAdding}
                  className="add-block-button"
                  disabled={!hasLoaded}
                  type="button"
                  onClick={() => setIsAdding((current) => !current)}
                ><span aria-hidden="true">+</span> Add Activity</button>
              </div>
            </header>

            {isAdding ? (
              <form className="add-block-form" id="add-block-form" noValidate onSubmit={addItem}>
                <div className="add-field add-name-field">
                  <label htmlFor="block-name">Name</label>
                  <input
                    id="block-name"
                    maxLength={60}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="e.g. Sauna"
                    value={draftTitle}
                  />
                </div>
                {timelineEnabled ? <div className="add-field">
                  <label htmlFor="block-duration">Minutes</label>
                  <input
                    id="block-duration"
                    inputMode="numeric"
                    max="480"
                    min="5"
                    onBlur={() => setDraftDuration((current) => normalizeActivityDuration(current))}
                    onChange={(event) => setDraftDuration(event.target.valueAsNumber || 5)}
                    step="5"
                    type="number"
                    value={draftDuration}
                  />
                </div> : null}
                <div className="add-field">
                  <label htmlFor="block-category">Category</label>
                  <CategoryPicker
                    id="block-category"
                    ariaLabel="Category"
                    onChange={setDraftCategory}
                    value={draftCategory}
                  />
                </div>
                <div className="add-form-actions">
                  <button className="cancel-add-button" type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                  <button className="confirm-add-button" disabled={!draftTitle.trim()} type="submit">Add</button>
                </div>
              </form>
            ) : null}

            <div className="planner-help"><span className="help-grip"><GripVertical aria-hidden="true" size={14} strokeWidth={1.8} /></span> Drag a handle to reorder {timelineEnabled ? <><span className="help-divider" aria-hidden="true">·</span> Adjust minutes on any block</> : null}</div>

            {dayMode.showStartGate && hasLoaded && !isDayStarted ? (
              <section className="day-launch" aria-labelledby="day-launch-title">
                <div className="day-launch-copy">
                  <p className="eyebrow">{minutesUntilPreferredStart > 0 ? `Begins in ${formatCountdown(minutesUntilPreferredStart)}` : "Whenever you’re ready"}</p>
                  <h2 id="day-launch-title">Good morning. Your day is ready.</h2>
                  <p>{minutesUntilPreferredStart > 0
                    ? `Your preferred start is ${formatTime(preferredStartMinutes)}. Start early if today is already moving.`
                    : `We’ll begin at ${formatTime(nextStartBoundary)} and keep the whole sequence intact.`}</p>
                </div>
                <button className="start-day-button" disabled={isStartingDay} type="button" onClick={() => void startDay()}>
                  {isStartingDay ? "Starting…" : minutesUntilPreferredStart > 0 ? "Start Early" : "Start My Day"}
                </button>
              </section>
            ) : null}

            <div className="schedule" aria-label="Idealized day schedule">
              {hasLoaded ? <>{displayedScheduledItems.map((item, displayIndex) => {
                const start = completedBeforeLaunchIds.has(item.id) ? timestampTimeParts(item.completedAt) ?? timeParts(item.start) : timeParts(item.start);
                const isDragging = draggingId === item.id;
                const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
                const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";
                const isEditing = editingId === item.id;
                const isExpanded = expandedActivityId === item.id;
                const isComplete = completedIds.has(item.id);
                const isSkipped = Boolean(item.skippedAt);
                const isPending = pendingActivityIds.has(item.id);
                const activityState = isSkipped ? "skipped" : isComplete ? "complete" : !timelineEnabled || !isDayStarted ? "planned" : item.end <= displayedMinutes ? "past" : item.start > displayedMinutes ? "upcoming" : "current";
                const itemStyle = { "--item-color": item.color } as CSSProperties;

                return (
                  <Fragment key={item.id}>
                    {dayMode.showClockState && nowLineIndex === displayIndex ? (
                      <div className="now-line" aria-label={`Current time ${formatTime(displayedMinutes)}`}>
                        <span>{formatTime(displayedMinutes)}</span><i /><strong>{fakeMinutes !== null ? "Preview now" : "Now"}</strong>
                      </div>
                    ) : null}
                    <div
                      className={`routine-row is-${activityState} ${isDragging ? "is-dragging" : ""} ${isDropBefore ? "drop-before" : ""} ${isDropAfter ? "drop-after" : ""}`}
                      onDragOver={(event) => handleDragOver(event, item.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(event) => handleDrop(event, item.id)}
                      style={itemStyle}
                    >
                    {isDropBefore || isDropAfter ? <div className="drop-indicator" aria-hidden="true"><span>Move here</span></div> : null}

                    {dayMode.showClockState ? <div className="time-label">{isSkipped
                      ? <strong className="sequence-label">Skipped</strong>
                      : isDayStarted
                        ? <><strong>{start.time}</strong><span>{start.suffix}</span></>
                        : <strong className="sequence-label">Queued</strong>}</div> : null}

                    <article className={`routine-card ${isEditing ? "is-editing" : ""} ${isExpanded ? "is-expanded" : ""} ${mobileActivityMenuId === item.id ? "has-open-mobile-menu" : ""}`}>
                      <button
                        className="drag-button"
                        draggable
                        type="button"
                        aria-label={`Drag ${item.title} to reorder`}
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                        onKeyDown={(event) => handleDragKeyDown(event, item.id)}
                      ><GripVertical aria-hidden="true" size={15} strokeWidth={1.8} /></button>

                      <div className="item-icon" aria-hidden="true">{item.icon}</div>
                      {isEditing ? (
                        <>
                          {dayMode.showClockState ? <div className="mobile-time-label mobile-edit-time" aria-hidden="true">{isDayStarted ? <><strong>{start.time}</strong><span>{start.suffix}</span></> : <strong>Queued</strong>}</div> : null}
                          <form className="inline-edit-form" onSubmit={saveEdit}>
                            <input
                              aria-label={`Title for ${item.title}`}
                              maxLength={60}
                              onChange={(event) => setEditTitle(event.target.value)}
                              onKeyDown={(event) => { if (event.key === "Escape") cancelEditing(); }}
                              value={editTitle}
                            />
                            <CategoryPicker
                              id={`tag-${item.id}`}
                              ariaLabel={`Tag for ${item.title}`}
                              onChange={setEditCategory}
                              value={editCategory}
                            />
                            <div className="inline-edit-actions">
                              <button type="button" aria-label="Cancel editing" onClick={cancelEditing}>×</button>
                              <button className="save-edit-button" disabled={!editTitle.trim()} type="submit" aria-label="Save changes">✓</button>
                            </div>
                          </form>
                        </>
                      ) : (
                        <button className="item-copy" type="button" aria-expanded={isExpanded} onClick={() => isExpanded ? collapseActivity() : openActivity(item.id)}>
                          <div className="item-title">
                            <h3>{item.title}</h3>
                          </div>
                          <div className="item-state">
                            {activityState === "current" ? <span className="now-chip">Now</span> : null}
                            {activityState === "complete" ? <span className="complete-chip"><Check aria-hidden="true" size={10} /> Done</span> : null}
                            {activityState === "skipped" ? <span className="skipped-chip"><SkipForward aria-hidden="true" size={10} /> Skipped</span> : null}
                          </div>
                          <div className="item-meta">
                            {dayMode.showClockState ? <div className="mobile-time-label" aria-hidden="true">{isSkipped
                              ? <strong>Skipped</strong>
                              : isDayStarted
                                ? <><strong>{start.time}</strong><span>{start.suffix}</span></>
                                : <strong>Queued</strong>}</div> : null}
                            <span className="category-chip">{item.category}</span>
                          </div>
                        </button>
                      )}

                      {isExpanded ? <button className="collapse-activity-button" type="button" aria-label={`Collapse ${item.title}`} onClick={collapseActivity}><ChevronUp className="desktop-collapse-icon" aria-hidden="true" size={16} /></button> : null}
                      <div className="item-controls">
                          <button
                            className="edit-item-button desktop-row-action"
                            type="button"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => startEditing(item)}
                          ><Pencil aria-hidden="true" size={14} strokeWidth={1.8} /></button>

                          <button
                            className="delete-item-button desktop-row-action"
                            type="button"
                            aria-label={`Remove ${item.title}`}
                            onClick={() => removeItem(item.id)}
                          ><Trash2 aria-hidden="true" size={14} strokeWidth={1.8} /></button>

                          <ControlTooltip className="desktop-skip-control" id={`skip-tooltip-${item.id}`} label={isSkipped ? `Put ${item.title} back into today` : `Skip ${item.title} for today`}>
                            <button
                              aria-describedby={`skip-tooltip-${item.id}`}
                              aria-label={isSkipped ? `Put ${item.title} back into today` : `Skip ${item.title} for today`}
                              className={`closed-status-button skip-status-button ${isSkipped ? "is-active" : ""}`}
                              disabled={isPending}
                              type="button"
                              onClick={() => void updateClosedActivity(item, isSkipped ? "unskip" : "skip")}
                            ><SkipForward aria-hidden="true" size={14} strokeWidth={2} /></button>
                          </ControlTooltip>

                          <div className={`mobile-activity-menu ${mobileActivityMenuId === item.id ? "is-open" : ""}`} data-activity-id={item.id}>
                            <button
                              aria-expanded={mobileActivityMenuId === item.id}
                              aria-haspopup={mobileResetActivity?.id === item.id ? "dialog" : "menu"}
                              aria-label={`More options for ${item.title}`}
                              className="mobile-activity-menu-trigger"
                              type="button"
                              onClick={() => {
                                setMobileResetActivity(null);
                                setMobileActivityMenuId((current) => current === item.id ? null : item.id);
                              }}
                            ><MoreVertical aria-hidden="true" size={18} strokeWidth={2} /></button>
                            {mobileActivityMenuId === item.id ? (
                              <div className={`mobile-activity-menu-panel ${mobileResetActivity?.id === item.id ? "is-confirming" : ""}`} role={mobileResetActivity?.id === item.id ? "dialog" : "menu"}>
                                {mobileResetActivity?.id === item.id ? (
                                  <div className="activity-reset-confirmation">
                                    <strong>{mobileResetActivity.state === "error" ? "Reset didn’t work" : "Reset this activity?"}</strong>
                                    <span>{mobileResetActivity.state === "error" ? "Nothing was changed. You can try again." : "This clears Luna’s thread, workspace, saved activity details, and run history. The activity stays in your day."}</span>
                                    <div>
                                      <button type="button" onClick={() => setMobileResetActivity(null)}>Cancel</button>
                                      <button className="activity-reset-confirm-button" disabled={mobileResetActivity.state === "resetting"} type="button" onClick={() => void resetActivityForTesting(item)}>{mobileResetActivity.state === "resetting" ? "Resetting…" : mobileResetActivity.state === "error" ? "Try Again" : "Reset Activity"}</button>
                                    </div>
                                  </div>
                                ) : <>
                                  <button role="menuitem" type="button" onClick={() => startEditing(item)}><Pencil aria-hidden="true" size={15} /> Edit activity</button>
                                  <button disabled={isPending} role="menuitem" type="button" onClick={() => { setMobileActivityMenuId(null); void updateClosedActivity(item, isSkipped ? "unskip" : "skip"); }}><SkipForward aria-hidden="true" size={15} /> {isSkipped ? "Restore to today" : "Skip for today"}</button>
                                  <button className="activity-reset-menu-action" role="menuitem" type="button" onClick={() => setMobileResetActivity({ id: item.id, state: "confirming" })}><RotateCcw aria-hidden="true" size={15} /> Dev reset activity</button>
                                  <button className="mobile-remove-action" role="menuitem" type="button" onClick={() => removeItem(item.id)}><Trash2 aria-hidden="true" size={15} /> Remove activity</button>
                                </>}
                              </div>
                            ) : null}
                          </div>

                          <ControlTooltip id={`complete-tooltip-${item.id}`} label={isComplete ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`}>
                            <button
                              aria-describedby={`complete-tooltip-${item.id}`}
                              aria-label={isComplete ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`}
                              className={`closed-status-button complete-status-button ${isComplete ? "is-active" : ""}`}
                              disabled={isPending}
                              type="button"
                              onClick={() => void updateClosedActivity(item, isComplete ? "reopen" : "complete")}
                            ><Check aria-hidden="true" size={14} strokeWidth={2.2} /></button>
                          </ControlTooltip>

                          <div className="duration-control" aria-label={`Length for ${item.title}`}>
                            <button type="button" aria-label={`Reduce ${item.title} by ${DURATION_STEP} minutes`} onClick={() => adjustDuration(item.id, -DURATION_STEP)}>−</button>
                            <div className="duration-value">
                              <input
                                aria-label={`Length for ${item.title} in minutes`}
                                inputMode="numeric"
                                max="480"
                                min="5"
                                onBlur={() => setDuration(item.id, normalizeActivityDuration(item.duration))}
                                onChange={(event) => setDuration(item.id, event.target.valueAsNumber)}
                                step="5"
                                type="number"
                                value={item.duration}
                              />
                              <span className="duration-unit">min</span>
                            </div>
                            <button type="button" aria-label={`Add ${DURATION_STEP} minutes to ${item.title}`} onClick={() => adjustDuration(item.id, DURATION_STEP)}>+</button>
                          </div>
                        </div>

                      {isExpanded ? (
                        <ActivityWorkbench
                          key={`${item.id}:${activityResetVersions[item.id] ?? 0}`}
                          isComplete={isComplete}
                          isSkipped={isSkipped}
                          item={item}
                          timelineEnabled={timelineEnabled}
                          openConversationOnMount={startConversationActivityId === item.id}
                          onAdjustDuration={(delta) => adjustDuration(item.id, delta)}
                          onComplete={(completedAt) => toggleComplete(item.id, completedAt)}
                          onSkip={(skippedAt) => toggleSkip(item.id, skippedAt)}
                          onEdit={() => startEditing(item)}
                          onRemove={() => removeItem(item.id)}
                          onSetDuration={(value) => setDuration(item.id, value)}
                        />
                      ) : null}

                    </article>
                    </div>
                  </Fragment>
                );
              })}

              {dayMode.showClockState && nowLineIndex === displayedScheduledItems.length ? (
                <div className="now-line now-line-finished" aria-label={`Current time ${formatTime(displayedMinutes)}`}>
                  <span>{formatTime(displayedMinutes)}</span><i /><strong>{fakeMinutes !== null ? "Preview now" : "Now"}</strong>
                </div>
              ) : null}

              {dayMode.showClockState ? <div className="finish-row">
                <div className="time-label">{isDayStarted ? <><strong>{timeParts(finishMinutes).time}</strong><span>{timeParts(finishMinutes).suffix}</span></> : null}</div>
                <p>{isDayStarted ? "Protocol complete" : "Your sequence will find its time when you start"}</p>
              </div> : null}</> : (
                <div className="schedule-loading" role="status" aria-label="Loading your saved day">
                  {[0, 1, 2, 3].map((row) => <div className="schedule-loading-row" aria-hidden="true" key={row} />)}
                </div>
              )}
            </div>
          </section>

          <aside className="summary-rail" aria-label="Plan summary">
            <section className="summary-card shape-card">
              <div className="summary-title"><div><p className="eyebrow">{timelineEnabled ? "Day shape" : "Today’s mix"}</p><h2>{hasLoaded ? timelineEnabled ? `${formatDuration(totalMinutes)} total` : `${activeItemCount} activities` : "Loading…"}</h2></div><span>{hasLoaded ? timelineEnabled ? isDayStarted ? `${formatTime(startMinutes)}–${formatTime(finishMinutes)}` : `Ready for ${formatTime(preferredStartMinutes)}` : `${completedItemCount} done` : "—"}</span></div>
              <div className="shape-list">
                {hasLoaded ? categoryTotals.map((entry) => (
                  <div className="shape-row" key={entry.category}>
                    <div><span className="shape-dot" style={{ background: entry.color }} /><strong>{entry.category}</strong><span>{timelineEnabled ? `${entry.minutes} min` : entry.count}</span></div>
                    <div className="shape-track"><span style={{ background: entry.color, width: timelineEnabled ? totalMinutes ? `${(entry.minutes / totalMinutes) * 100}%` : "0%" : activeItemCount ? `${(entry.count / activeItemCount) * 100}%` : "0%" }} /></div>
                  </div>
                )) : [0, 1, 2, 3, 4].map((row) => <div className="shape-loading-row" aria-hidden="true" key={row} />)}
              </div>
            </section>

            <p className="local-note"><span>●</span> {hasLoaded ? "Today is saved to your account." : "Loading your saved day…"}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
