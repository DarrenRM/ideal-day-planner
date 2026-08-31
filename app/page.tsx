"use client";

import type { CSSProperties, DragEvent, FormEvent, KeyboardEvent, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, MoreVertical, Pencil, Plus, RotateCcw, Send, Settings, SkipForward, Sparkles, Trash2, Trophy, X } from "./icons";
import { ActivityWorkspace, captureActivityTimingSnapshot, hasVisibleActivityWorkspace, resetActivityTimingState, type ActivityScheduleSummary } from "./activity-workspace";
import type { ActivityRecord } from "./activity-record-model";
import type { ActivityFollowUp } from "./follow-up-model";
import { agentSurfaceState, type AgentJobKind } from "./agent-surface-state";
import { dayModePolicy, DEFAULT_DAY_SETTINGS, normalizeDaySettings, type DaySettings } from "./day-settings";
import { useMobileConversationDrawer } from "./use-mobile-conversation-drawer";
import { EMPTY_WORKSPACE, type WorkspaceDocument } from "./workspace-model";
import { ScheduleManager } from "./schedule-manager";
import { GlobalLuna } from "./global-luna";
import { OccurrenceEditor } from "./occurrence-editor";
import { dayProgressCounts, GO_FURTHER_PREVIEW_LIMIT, normalizePlanRole, partitionDayItems, type PlanRole } from "./day-role";
import { fallbackDayHighlight } from "./day-highlight";
import type { CaptureAttention } from "./capture-model";
import { ActivityDurationControl as DurationControl, DURATION_STEP, normalizeActivityDuration } from "./activity-duration-control";
import { activityIconFor, CATEGORY_META, CATEGORY_OPTIONS, CATEGORY_ORDER, normalizeCategory, type ActivityCategory } from "./activity-presentation";
import { ConversationWorkReceipt, type ConversationWorkReceiptData } from "./conversation-work-receipt";
import { millisecondsUntilNextLocalDay, reconcileLocalDay } from "./day-rollover";
import { activityRecordTargetId } from "./activity-workspace-target";
import { derivedDisplayTitle } from "./activity-title";

type Category = ActivityCategory;

type RoutineItem = {
  id: string;
  occurrenceId?: string;
  activityId?: string;
  activityVariantId?: string | null;
  variantName?: string | null;
  displayLabel?: string | null;
  displayTitle?: string;
  title: string;
  detail: string;
  duration: number;
  category: Category;
  icon: string;
  color: string;
  completedAt?: string | null;
  skippedAt?: string | null;
  planRole?: PlanRole;
  activatedAt?: string | null;
  previousEligibleDate?: string | null;
  previousCompletedAt?: string | null;
  previousActivatedAt?: string | null;
  previousPlanRole?: PlanRole | null;
  agenda?: { status: "today" | "overdue"; labels: string[] } | null;
};

type ScheduledItem = RoutineItem & { start: number; end: number };
type DropTarget = { id: string; position: "before" | "after" };
type TouchDrag = {
  active: boolean;
  pointerId: number;
  sourceId: string;
  startX: number;
  startY: number;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};
type TouchDragVisual = { sourceId: string; clientX: number; clientY: number; offsetX: number; offsetY: number; width: number; height: number };
type MobileActivityTransition = {
  id: string;
  phase: "opening" | "closing";
  top: number;
  left: number;
  right: number;
  height: number;
};
type ConversationMessage = { id: string; author: "user" | "luna"; body: string; agentJobId?: string | null; createdAt: string; pending?: boolean };
type ConversationArtifact = ConversationWorkReceiptData & {
  detail: string;
  meta: { secondary?: string; target?: "workspace"; targetActivityId?: string; targetActivityClientKey?: string; targetRecordKey?: string };
  sourceAgentJobId: string;
};
type ConversationJob = {
  status: "queued" | "leased" | "running" | "retryable_failure";
  kind: AgentJobKind;
  progressTitle?: string | null;
  progressDetail?: string | null;
};
type ActivityRunSummary = { planDate: string; status: string; completedAt?: string | null; completedSubjectKeys?: string[] };
type DayHighlight = {
  status: "idle" | "queued" | "running" | "ready" | "quiet";
  body: string | null;
  kind: string | null;
  revision: number;
};
type ConversationState = {
  messages: ConversationMessage[];
  artifacts?: ConversationArtifact[];
  activeJob: ConversationJob | null;
  agentOnline: boolean;
  workspace: { revisionId: string | null; revisionNumber: number; document: WorkspaceDocument };
  records: ActivityRecord[];
  recentRuns: ActivityRunSummary[];
  proposals?: ActivityScheduleProposal[];
  followUps?: ActivityFollowUp[];
  scheduleSummary?: ActivityScheduleSummary | null;
  failedJob?: { id: string; kind: string; message: string } | null;
};
type ActivityScheduleProposal = { id: string; status: string; createdAt: string; document: { summary: string; effectiveDate: string; impact: { todayChanges: number; futurePatternChanges: number } } };
type LunaSummary = { unreadCount: number; pendingDecisionCount: number; captureRevision: string | null; agentOnline: boolean };

const START_MINUTES = 8 * 60;
const DEFAULT_DEV_MINUTES = 7 * 60 + 30;
const STORAGE_KEY = "idealized-day-items-v1";
const DELETED_KEY = "idealized-day-deleted-v1";
const MIGRATION_KEY = "idealized-day-d1-imported-v1";
const DEV_TIME_KEY = "idealized-day-dev-time-v1";
const EMPTY_DAY_HIGHLIGHT: DayHighlight = { status: "idle", body: null, kind: null, revision: 0 };

const INITIAL_ITEMS: RoutineItem[] = [
  { id: "sun-walk", title: "Walk in sun", detail: "Easy pace · outdoor light", duration: 30, category: "Light", icon: "☼", color: "#e8b75f" },
  { id: "shower", title: "Shower", detail: "Recharge · get ready for the day", duration: 15, category: "Recharge", icon: "◌", color: "#67b7ce" },
  { id: "stretch", title: "Stretch / yoga", detail: "Mobility · breathe and open up", duration: 20, category: "Recharge", icon: "⌁", color: "#67b7ce" },
  { id: "hair-serum", title: "Hair serum", detail: "Care · apply and let it settle", duration: 5, category: "Care", icon: "✦", color: "#d58db5" },
  { id: "red-light", title: "Red light", detail: "Care · device session", duration: 15, category: "Care", icon: "◉", color: "#d58db5" },
  { id: "shake", title: "Shake", detail: "Quick fuel before training", duration: 5, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "hang", title: "Hang from chin-up bar", detail: "Grip · decompression", duration: 5, category: "Training", icon: "↑", color: "#a8c96d" },
  { id: "kettlebells", title: "Kettlebells", detail: "Strength · short focused circuit", duration: 20, category: "Training", icon: "◆", color: "#a8c96d" },
  { id: "cardio", title: "Cardio", detail: "Conditioning · steady effort", duration: 25, category: "Training", icon: "≈", color: "#a8c96d" },
  { id: "lift", title: "Lift", detail: "Strength · main session", duration: 45, category: "Training", icon: "▰", color: "#a8c96d" },
  { id: "breakfast", title: "Breakfast", detail: "Sit down and eat", duration: 25, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "massage-gun", title: "Massage gun", detail: "Recovery · quick pass on worked areas", duration: 10, category: "Recharge", icon: "∿", color: "#67b7ce" },
  { id: "skin-routine", title: "Skin routine", detail: "Care · cleanse and moisturize", duration: 15, category: "Care", icon: "✧", color: "#d58db5" },
  { id: "lunch", title: "Lunch", detail: "Fuel · simple, intentional meal", duration: 30, category: "Fuel", icon: "◍", color: "#d59662" },
  { id: "sun-tan", title: "Sun tan", detail: "Outdoor time · finish the protocol", duration: 20, category: "Light", icon: "☀", color: "#e8b75f" },
];

const INITIAL_IDS = new Set(INITIAL_ITEMS.map((item) => item.id));

function activityDisplayTitle(item: Pick<RoutineItem, "title" | "variantName" | "displayLabel" | "displayTitle">) {
  return derivedDisplayTitle(item.title, item.variantName, item.displayLabel);
}

function ActivityAgenda({ item }: { item: Pick<RoutineItem, "agenda" | "category"> }) {
  const labels = item.agenda?.labels.filter(Boolean) ?? [];
  if (!item.agenda || !labels.length) return <span className="category-chip">{item.category}</span>;
  const visible = labels.slice(0, 2);
  const remaining = labels.length - visible.length;
  const actionLabel = `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining} more` : ""}`;
  const statusLabel = item.agenda.status === "overdue" ? "Overdue" : "Today";
  return (
    <span aria-label={`${statusLabel}: ${actionLabel}`} className={`activity-agenda is-${item.agenda.status}`}>
      <span aria-hidden="true" className="activity-agenda-dot" />
      <span className="activity-agenda-actions">{actionLabel}</span>
    </span>
  );
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
        <ChevronDown aria-hidden="true" size={16} />
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
              {category === value ? <Check aria-hidden="true" size={14} /> : null}
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

function MobileDateHeading({ date }: { date: Date }) {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const day = date.getDate();
  const ordinal = formatDayOrdinal(day).slice(String(day).length);

  return (
    <span aria-label={formatTodayHeading(date)} className="mobile-schedule-title mobile-date-lockup">
      <span aria-hidden="true" className="mobile-date-copy">
        <span className="mobile-date-month">{month}</span>
        <span className="mobile-date-primary">
          <strong className="mobile-date-weekday">{weekday}</strong>
          <span className="mobile-date-divider" />
          <span className="mobile-date-number">
            {day}<sup>{ordinal}</sup>
          </span>
        </span>
      </span>
    </span>
  );
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDateKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function reviewDayLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today";
  if (dateKey === shiftDateKey(todayKey, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dateFromKey(dateKey));
}

function conversationTime(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "Recently";
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return isToday ? `Today · ${time}` : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

type ActivityWorkbenchProps = {
  completionActionRef: MutableRefObject<(() => void) | null>;
  item: ScheduledItem;
  timelineEnabled: boolean;
  isComplete: boolean;
  isSkipped: boolean;
  openConversationOnMount: boolean;
  onComplete: (completedAt: string | null) => void;
  onSkip: (skippedAt: string | null) => void;
  onSkipStart: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAdjustDuration: (delta: number) => void;
  onSetDuration: (value: number) => void;
  onChangeToday: () => void;
  onManageSchedule: () => void;
  onSetRole: (role: PlanRole) => void;
  onOpenActivityTarget: (target: { activityId: string; activityClientKey: string | null }, origin?: DOMRect) => void;
};

function ActivityWorkbench({ completionActionRef, item, timelineEnabled, isComplete, isSkipped, openConversationOnMount, onComplete, onSkip, onSkipStart, onEdit, onRemove, onAdjustDuration, onSetDuration, onChangeToday, onManageSchedule, onSetRole, onOpenActivityTarget }: ActivityWorkbenchProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [artifacts, setArtifacts] = useState<ConversationArtifact[]>([]);
  const [activeJob, setActiveJob] = useState<ConversationJob | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceDocument>(EMPTY_WORKSPACE);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"joining" | "ready" | "error">("joining");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPreviewingCompletion, setIsPreviewingCompletion] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isViewingWorkspace, setIsViewingWorkspace] = useState(false);
  const [isFooterMenuOpen, setIsFooterMenuOpen] = useState(false);
  const [isSoftwareKeyboardOpen, setIsSoftwareKeyboardOpen] = useState(false);
  const [resetActivityState, setResetActivityState] = useState<"idle" | "confirming" | "resetting" | "error">("idle");
  const [recentRuns, setRecentRuns] = useState<ActivityRunSummary[]>([]);
  const [scheduleProposals, setScheduleProposals] = useState<ActivityScheduleProposal[]>([]);
  const [followUps, setFollowUps] = useState<ActivityFollowUp[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<ActivityScheduleSummary | null>(null);
  const [failedJob, setFailedJob] = useState<ConversationState["failedJob"]>(null);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const canReturnToMore = normalizePlanRole(item.planRole) === "extra" && Boolean(item.activatedAt) && !isComplete && !isSkipped;
  const sendingRef = useRef(false);
  const refreshConversationRef = useRef<() => void>(() => {});
  const conversationLogRef = useRef<HTMLDivElement>(null);
  const conversationSectionRef = useRef<HTMLElement>(null);
  const latestUnreadLunaMessageRef = useRef<HTMLDivElement>(null);
  const conversationShouldFollowRef = useRef(true);
  const conversationProgrammaticScrollRef = useRef(false);
  const conversationScrollTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const conversationAnchorTopRef = useRef<number | null>(null);
  const durableSurfaceSignatureRef = useRef("");
  const footerMenuRef = useRef<HTMLDivElement>(null);
  const { hasConversationJob, hasWorkspaceJob } = agentSurfaceState(activeJob?.kind);
  const activeJobHasWorker = Boolean(activeJob
    && activeJob.status !== "retryable_failure"
    && (agentOnline || activeJob.status === "leased" || activeJob.status === "running"));
  const isLunaThinking = isSending || (activeJobHasWorker && hasConversationJob);
  const workspaceWorkState = hasWorkspaceJob
    ? activeJobHasWorker ? "building" : "waiting"
    : null;
  const workspaceWorkTitle = workspaceWorkState === "waiting"
    ? `${item.title} is queued`
    : activeJob?.progressTitle || `Updating ${item.title}`;
  const workspaceWorkDetail = workspaceWorkState === "waiting"
    ? "Your message is saved, and Luna will pick it up shortly."
    : activeJob?.progressDetail || "Turning your latest details into something useful here.";
  const workspaceActivity = useMemo(() => ({ ...item, timelineEnabled, completedToday: isComplete || isPreviewingCompletion, recentRuns }), [isComplete, isPreviewingCompletion, item, recentRuns, timelineEnabled]);
  const ReceiptIcon = activityIconFor(item);
  const hasUnreadWorkReceipt = artifacts.some((artifact) => !artifact.viewedAt);
  const conversationFeed = useMemo(() => [
    ...messages.map((message) => ({ type: "message" as const, createdAt: message.createdAt, sourceAgentJobId: message.agentJobId ?? "", value: message })),
    ...artifacts.map((artifact) => ({ type: "artifact" as const, createdAt: artifact.createdAt, sourceAgentJobId: artifact.sourceAgentJobId, value: artifact })),
  ].sort((left, right) => {
    const timestampDifference = (storedTimestampMillis(left.createdAt) ?? 0) - (storedTimestampMillis(right.createdAt) ?? 0);
    if (timestampDifference) return timestampDifference;
    if (left.sourceAgentJobId && left.sourceAgentJobId === right.sourceAgentJobId && left.type !== right.type) return left.type === "message" ? -1 : 1;
    return left.value.id.localeCompare(right.value.id);
  }), [artifacts, messages]);
  const hasWorkspaceContent = hasVisibleActivityWorkspace(workspaceActivity, workspace, records) || followUps.length > 0 || Boolean(scheduleSummary);
  const hasActiveWorkspaceSurface = hasWorkspaceContent || Boolean(workspaceWorkState) || Boolean(recordError);
  const showEmptyWorkspace = !hasActiveWorkspaceSurface;
  const conversationDrawer = useMobileConversationDrawer({
    activityId: item.activityId ?? item.id,
    canCollapse: true,
    contentReady: connectionState !== "joining",
    hasConversationJob,
    messages,
    openOnMount: openConversationOnMount,
    preferConversation: showEmptyWorkspace,
  });
  const {
    isOpen: isConversationDrawerOpen,
    markLatestLunaRead,
    markUnreadLunaBoundary,
    unreadLunaMessageId: activeUnreadLunaMessageId,
  } = conversationDrawer;
  const isOpeningActivity = connectionState === "joining" || !conversationDrawer.isPreferenceReady;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let largestHeight = viewport.height;
    function updateKeyboardState() {
      largestHeight = Math.max(largestHeight, viewport!.height);
      const composerFocused = document.activeElement instanceof HTMLTextAreaElement
        && document.activeElement.closest(".conversation-composer");
      setIsSoftwareKeyboardOpen(Boolean(composerFocused && largestHeight - viewport!.height > 120));
    }
    viewport.addEventListener("resize", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
    };
  }, []);

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
      const nextSurfaceSignature = `${state.workspace.revisionId || "none"}:${state.records.map((record) => `${record.key}:${record.version}`).join("|")}:${(state.followUps ?? []).map((followUp) => `${followUp.id}:${followUp.status}:${followUp.dueDate}`).join("|")}:${state.scheduleSummary?.cadenceLabel || "daily"}`;
      if (durableSurfaceSignatureRef.current && durableSurfaceSignatureRef.current !== nextSurfaceSignature) {
        const conversationSection = conversationSectionRef.current;
        const bounds = conversationSection?.getBoundingClientRect();
        if (bounds && bounds.bottom > 0 && bounds.top < window.innerHeight) conversationAnchorTopRef.current = bounds.top;
      }
      durableSurfaceSignatureRef.current = nextSurfaceSignature;
      setMessages((current) => current.length === state.messages.length && current.every((message, index) => {
        const next = state.messages[index];
        return message.id === next.id && message.body === next.body && message.createdAt === next.createdAt;
      }) ? current : state.messages);
      setArtifacts(state.artifacts ?? []);
      setActiveJob((current) => current?.status === state.activeJob?.status
        && current?.kind === state.activeJob?.kind
        && current?.progressTitle === state.activeJob?.progressTitle
        && current?.progressDetail === state.activeJob?.progressDetail
        ? current
        : state.activeJob);
      setAgentOnline(state.agentOnline);
      setWorkspace(state.workspace.document);
      setRecords(state.records ?? []);
      setRecentRuns(state.recentRuns ?? []);
      setScheduleProposals(state.proposals ?? []);
      setFollowUps(state.followUps ?? []);
      setScheduleSummary(state.scheduleSummary ?? null);
      setFailedJob(state.failedJob ?? null);
      setConnectionState("ready");
    }

    async function openActivity() {
      try {
        const response = await fetch("/api/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "open", activityId: item.activityId ?? item.id, occurrenceId: item.occurrenceId ?? item.id, activityVariantId: item.activityVariantId, date: localDateKey(), visitId }),
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
        const response = await fetch(`/api/activity?activityId=${encodeURIComponent(item.activityId ?? item.id)}&occurrenceId=${encodeURIComponent(item.occurrenceId ?? item.id)}&date=${localDateKey()}`, { cache: "no-store" });
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
  }, [item.activityId, item.activityVariantId, item.id, item.occurrenceId, item.title]);

  useLayoutEffect(() => {
    const previousTop = conversationAnchorTopRef.current;
    if (previousTop === null) return;
    conversationAnchorTopRef.current = null;
    const nextTop = conversationSectionRef.current?.getBoundingClientRect().top;
    if (typeof nextTop === "number") window.scrollBy({ top: nextTop - previousTop, behavior: "auto" });
  }, [records, workspace]);

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!conversationShouldFollowRef.current) return;
    const log = conversationLogRef.current;
    if (!log) return;
    conversationProgrammaticScrollRef.current = true;
    log.scrollTo({ top: log.scrollHeight, behavior });
    if (conversationScrollTimerRef.current) window.clearTimeout(conversationScrollTimerRef.current);
    conversationScrollTimerRef.current = window.setTimeout(() => {
      conversationProgrammaticScrollRef.current = false;
      conversationScrollTimerRef.current = null;
    }, behavior === "smooth" ? 360 : 50);
  }, []);

  useEffect(() => {
    if (!conversationShouldFollowRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollConversationToBottom(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    ));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, artifacts, isLunaThinking, scrollConversationToBottom]);

  useEffect(() => {
    if (!isConversationDrawerOpen) return;
    conversationShouldFollowRef.current = true;
    const frame = window.requestAnimationFrame(() => scrollConversationToBottom("auto"));
    const settleTimer = window.setTimeout(() => scrollConversationToBottom("auto"), 300);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [isConversationDrawerOpen, scrollConversationToBottom]);

  useEffect(() => {
    const log = conversationLogRef.current;
    if (!log || !isConversationDrawerOpen) return;
    const followAfterResize = () => scrollConversationToBottom("auto");
    const observer = new ResizeObserver(followAfterResize);
    observer.observe(log);
    window.visualViewport?.addEventListener("resize", followAfterResize);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", followAfterResize);
      if (conversationScrollTimerRef.current) window.clearTimeout(conversationScrollTimerRef.current);
    };
  }, [isConversationDrawerOpen, scrollConversationToBottom]);

  useEffect(() => {
    const unreadMessageId = activeUnreadLunaMessageId;
    const messageElement = latestUnreadLunaMessageRef.current;
    const logElement = conversationLogRef.current;
    if (!isConversationDrawerOpen || !unreadMessageId || !messageElement || !logElement) return;

    let readTimer: ReturnType<typeof window.setTimeout> | null = null;
    let isVisible = false;

    function clearReadTimer() {
      if (readTimer === null) return;
      window.clearTimeout(readTimer);
      readTimer = null;
    }

    function scheduleRead() {
      clearReadTimer();
      if (document.visibilityState !== "visible") {
        markUnreadLunaBoundary(unreadMessageId);
        return;
      }
      if (!isVisible) {
        if (!conversationShouldFollowRef.current) markUnreadLunaBoundary(unreadMessageId);
        return;
      }
      readTimer = window.setTimeout(markLatestLunaRead, 900);
    }

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      scheduleRead();
    }, { root: logElement, threshold: [0.5] });

    observer.observe(messageElement);
    document.addEventListener("visibilitychange", scheduleRead);
    return () => {
      clearReadTimer();
      observer.disconnect();
      document.removeEventListener("visibilitychange", scheduleRead);
    };
  }, [activeUnreadLunaMessageId, isConversationDrawerOpen, markLatestLunaRead, markUnreadLunaBoundary]);

  function handleConversationScroll() {
    const log = conversationLogRef.current;
    if (!log || conversationProgrammaticScrollRef.current) return;
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
          body: JSON.stringify({ mode: "message", activityId: item.activityId ?? item.id, occurrenceId: item.occurrenceId ?? item.id, activityVariantId: item.activityVariantId, body, messageId: clientMessageId, date: localDateKey() }),
      });
      if (!response.ok) throw new Error("Message could not be saved.");
      const state = await response.json() as ConversationState;
      setMessages(state.messages);
      setArtifacts(state.artifacts ?? []);
      setActiveJob(state.activeJob);
      setAgentOnline(state.agentOnline);
      setWorkspace(state.workspace.document);
      setRecords(state.records ?? []);
      setRecentRuns(state.recentRuns ?? []);
      setScheduleProposals(state.proposals ?? []);
      setFollowUps(state.followUps ?? []);
      setScheduleSummary(state.scheduleSummary ?? null);
      setFailedJob(state.failedJob ?? null);
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

  function viewWorkspaceUpdate(artifact: ConversationArtifact, origin?: DOMRect) {
    if (isViewingWorkspace) return;
    setIsViewingWorkspace(true);
    setArtifacts((current) => current.map((entry) => entry.id === artifact.id ? { ...entry, viewedAt: entry.viewedAt || new Date().toISOString() } : entry));
    void fetch("/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "view_artifact", activityId: item.activityId ?? item.id, artifactId: artifact.id }),
    });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetActivityId = artifact.meta.targetActivityId?.trim();
    const targetActivityClientKey = artifact.meta.targetActivityClientKey?.trim() || null;
    if (artifact.kind === "subject_move" && targetActivityId) {
      conversationDrawer.setOpen(false);
      window.setTimeout(() => {
        onOpenActivityTarget({ activityId: targetActivityId, activityClientKey: targetActivityClientKey }, origin);
        setIsViewingWorkspace(false);
      }, reducedMotion ? 20 : 280);
      return;
    }
    const revealWorkspace = () => {
      const workspaceTarget = document.getElementById(`activity-workspace-${item.id}`);
      const recordKey = artifact.meta.targetRecordKey?.trim();
      const recordTarget = recordKey
        ? document.getElementById(activityRecordTargetId(item.id, recordKey))
        : null;
      const target = recordTarget ?? workspaceTarget;
      if (recordTarget) {
        recordTarget.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      } else {
        workspaceTarget?.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        workspaceTarget?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
      target?.classList.remove("is-receipt-target");
      if (target) void target.offsetWidth;
      target?.classList.add("is-receipt-target");
      window.setTimeout(() => target?.classList.remove("is-receipt-target"), reducedMotion ? 180 : 900);
      setIsViewingWorkspace(false);
    };
    if (window.matchMedia("(max-width: 680px)").matches) {
      conversationDrawer.setOpen(false);
      window.setTimeout(revealWorkspace, reducedMotion ? 20 : 280);
      return;
    }
    revealWorkspace();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function updateScheduleProposal(proposalId: string, mode: "confirm" | "dismiss") {
    if (proposalBusy) return;
    setProposalBusy(proposalId);
    try {
      const response = await fetch("/api/schedule/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, mode }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "That schedule change could not be saved.");
      setScheduleProposals((current) => current.filter((proposal) => proposal.id !== proposalId));
    } catch {
      setConnectionState("error");
    } finally {
      setProposalBusy(null);
    }
  }

  async function mutateRecord(recordKey: string, operation: string, payload: Record<string, unknown>) {
    setRecordError(null);
    try {
      const response = await fetch("/api/activity/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.activityId ?? item.id, activityVariantId: item.activityVariantId, recordKey, operation, payload, actionId: window.crypto.randomUUID(), date: localDateKey() }),
      });
      const result = await response.json() as { records?: ActivityRecord[]; error?: string };
      if (!response.ok || !result.records) throw new Error(result.error || "That change could not be saved.");
      setRecords(result.records);
      return true;
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "That change could not be saved.");
      return false;
    }
  }

  async function mutateFollowUp(followUpId: string, operation: "reschedule" | "dismiss", dueDate?: string) {
    try {
      const response = await fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "follow_up", activityId: item.activityId ?? item.id, occurrenceId: item.occurrenceId ?? item.id, date: localDateKey(), followUpId, operation, dueDate }),
      });
      const state = await response.json() as ConversationState & { error?: string };
      if (!response.ok) throw new Error(state.error || "That check-in could not be changed.");
      setFollowUps(state.followUps ?? []);
      setFailedJob(state.failedJob ?? null);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : "That check-in could not be changed.");
    }
  }

  async function retryFailedJob() {
    if (!failedJob) return;
    const response = await fetch("/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "retry_job", activityId: item.activityId ?? item.id, occurrenceId: item.occurrenceId ?? item.id, date: localDateKey(), jobId: failedJob.id }),
    });
    if (!response.ok) {
      setRecordError("That update could not be retried. Please send Luna a new message.");
      return;
    }
    const state = await response.json() as ConversationState;
    setFailedJob(state.failedJob ?? null);
    setActiveJob(state.activeJob);
    refreshConversationRef.current();
  }

  async function toggleActivityComplete() {
    if (isCompleting) return;
    if (!isComplete) {
      setIsPreviewingCompletion(true);
    }
    setIsCompleting(true);
    try {
      const timing = isComplete ? null : captureActivityTimingSnapshot(workspaceActivity, workspace);
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: isComplete ? "reopen" : "complete",
          activityId: item.activityId ?? item.id,
          occurrenceId: item.occurrenceId ?? item.id,
          date: localDateKey(),
          timing,
        }),
      });
      if (!response.ok) throw new Error("Activity completion could not be saved.");
      const result = await response.json() as { completed: boolean; completedAt?: string; completedSubjectKeys?: string[] };
      const today = localDateKey();
      setRecentRuns((current) => result.completed
        ? [{ planDate: today, status: "completed", completedAt: result.completedAt ?? new Date().toISOString(), completedSubjectKeys: result.completedSubjectKeys ?? [] }, ...current.filter((run) => run.planDate !== today)]
        : current.filter((run) => run.planDate !== today));
      onComplete(result.completed ? result.completedAt ?? new Date().toISOString() : null);
      setConnectionState("ready");
    } catch {
      setIsPreviewingCompletion(false);
      setConnectionState("error");
    } finally {
      setIsPreviewingCompletion(false);
      setIsCompleting(false);
    }
  }

  useEffect(() => {
    const action = () => void toggleActivityComplete();
    completionActionRef.current = action;
    return () => {
      if (completionActionRef.current === action) completionActionRef.current = null;
    };
  });

  async function toggleActivitySkip() {
    if (isSkipping) return;
    setIsSkipping(true);
    if (!isSkipped) onSkipStart();
    try {
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: isSkipped ? "unskip" : "skip",
          activityId: item.activityId ?? item.id,
          occurrenceId: item.occurrenceId ?? item.id,
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
        body: JSON.stringify({ activityId: item.activityId ?? item.id, date: localDateKey() }),
      });
      const state = await response.json() as ConversationState & { error?: string };
      if (!response.ok) throw new Error(state.error || "This activity could not be reset.");
      resetActivityTimingState([item.occurrenceId ?? item.id]);
      onComplete(null);
      onSkip(null);
      setMessages(state.messages ?? []);
      setArtifacts(state.artifacts ?? []);
      setActiveJob(state.activeJob ?? null);
      setAgentOnline(Boolean(state.agentOnline));
      setWorkspace(state.workspace?.document ?? EMPTY_WORKSPACE);
      setRecords(state.records ?? []);
      setRecentRuns(state.recentRuns ?? []);
      setScheduleProposals(state.proposals ?? []);
      setFollowUps(state.followUps ?? []);
      setScheduleSummary(state.scheduleSummary ?? null);
      setFailedJob(state.failedJob ?? null);
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
    <div className={`activity-expansion ${isOpeningActivity ? "is-opening-activity" : ""} ${isSoftwareKeyboardOpen ? "is-software-keyboard-open" : ""}`}>
      <div className={`activity-workbench-grid ${isOpeningActivity ? "is-opening" : ""}`}>
        {isOpeningActivity ? (
          <div className="activity-opening-state" role="status" aria-live="polite">
            <span className="activity-opening-mark" aria-hidden="true"><Sparkles size={17} /></span>
            <strong>Getting things ready…</strong>
            <p>Your notes and activity space will be here in a moment.</p>
            <span className="activity-opening-progress" aria-hidden="true" />
          </div>
        ) : <>
          <ActivityWorkspace activity={workspaceActivity} followUps={followUps} onFollowUpMutation={mutateFollowUp} onManageSchedule={onManageSchedule} onRecordMutation={mutateRecord} onTalkWithLuna={() => conversationDrawer.setOpen(true)} recordError={recordError} records={records} scheduleSummary={scheduleSummary} showEmptyState={showEmptyWorkspace} workspace={workspace} workDetail={workspaceWorkDetail} workState={workspaceWorkState} workTitle={workspaceWorkTitle} />

          <section className={`activity-conversation ${conversationDrawer.isOpen ? "is-drawer-open" : "is-drawer-collapsed"} ${workspaceWorkState ? "has-workspace-work-peek" : hasActiveWorkspaceSurface ? "has-workspace-peek" : ""}`} aria-label={`${item.title} conversation`} ref={conversationSectionRef}>
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
              <strong>Notes &amp; Assistant</strong>
              <span className="conversation-drawer-state">
                {conversationDrawer.hasUnreadLuna || hasUnreadWorkReceipt ? <span className="conversation-unread-badge" aria-label="New from Luna">New</span> : null}
                <ChevronDown className="conversation-drawer-chevron" aria-hidden="true" size={17} />
              </span>
            </button>
          </header>
          <div className="conversation-log" aria-live="polite" ref={conversationLogRef} onScroll={handleConversationScroll}>
            {conversationFeed.length ? <div className="date-separator"><span>Recent</span></div> : null}
            {conversationFeed.map((feedItem) => {
              if (feedItem.type === "message") {
                const message = feedItem.value;
                return (
                  <Fragment key={message.id}>
                    {message.id === conversationDrawer.unreadBoundaryLunaMessageId ? (
                      <div className="unread-message-separator" role="status"><span>New from Luna</span></div>
                    ) : null}
                    <div
                      className={`message-group message-${message.author} ${message.id === conversationDrawer.unreadBoundaryLunaMessageId ? "is-unread-boundary" : ""}`}
                      ref={message.id === conversationDrawer.unreadLunaMessageId ? latestUnreadLunaMessageRef : undefined}
                    >
                      <div className="message-bubble">{message.body}</div>
                      <div className="message-meta">{conversationTime(message.createdAt)}{message.author === "user" ? message.pending ? <span>Sending…</span> : <span aria-label="Saved message">✓</span> : null}</div>
                    </div>
                  </Fragment>
                );
              }
              const artifact = feedItem.value;
              return (
                <ConversationWorkReceipt
                  artifact={artifact}
                  icon={<ReceiptIcon size={17} />}
                  key={artifact.id}
                  onView={(origin) => viewWorkspaceUpdate(artifact, origin)}
                  timestamp={conversationTime(artifact.createdAt)}
                  viewDisabled={isViewingWorkspace}
                />
              );
            })}
            {scheduleProposals.map((proposal) => (
              <article className="activity-schedule-proposal" key={proposal.id}>
                <span><CalendarDays aria-hidden="true" size={14} /> Schedule proposal</span>
                <strong>{proposal.document.summary}</strong>
                <small>Begins {proposal.document.effectiveDate}</small>
                <div><button type="button" onClick={() => void updateScheduleProposal(proposal.id, "dismiss")}>Dismiss</button><button type="button" onClick={() => setDraft(`Please revise proposal ${proposal.id}: `)}>Revise</button><button disabled={proposalBusy === proposal.id} type="button" onClick={() => void updateScheduleProposal(proposal.id, "confirm")}>Confirm</button></div>
              </article>
            ))}
            {failedJob ? (
              <div className="workspace-failed-notice" role="alert">
                <span><strong>{failedJob.message}</strong><small>Your last message is safe.</small></span>
                <button type="button" onClick={() => void retryFailedJob()}>Retry</button>
              </div>
            ) : null}
            {isLunaThinking ? <div className="message-group message-luna"><div className="message-bubble prototype-typing" aria-label="Luna is typing"><span /><span /><span /></div></div> : null}
          </div>
          <div className="conversation-composer">
            <textarea
              aria-label={`Message ${item.title}`}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                const log = conversationLogRef.current;
                if (log && log.scrollHeight - log.scrollTop - log.clientHeight < 120) conversationShouldFollowRef.current = true;
                window.setTimeout(() => scrollConversationToBottom("auto"), 80);
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Talk with Luna about ${item.title.toLowerCase()}…`}
              rows={2}
              value={draft}
            />
            <button aria-label="Send message" disabled={!draft.trim() || isSending} type="button" onClick={() => void sendMessage()}><Send aria-hidden="true" size={16} /></button>
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
            ><MoreVertical aria-hidden="true" size={17} /></button>
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
                    <button role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onChangeToday(); }}><CalendarDays aria-hidden="true" size={15} /> Change today</button>
                    <button role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onSetRole(normalizePlanRole(item.planRole) === "essential" ? "extra" : "essential"); }}><Sparkles aria-hidden="true" size={15} /> {normalizePlanRole(item.planRole) === "essential" ? "Move to Go Further" : "Make essential"}</button>
                    {isComplete ? <button role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); void toggleActivityComplete(); }}><RotateCcw aria-hidden="true" size={15} /> Mark incomplete</button> : null}
                    <button role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onEdit(); }}><Pencil aria-hidden="true" size={15} /> Edit activity</button>
                    <button className="activity-reset-menu-action" role="menuitem" type="button" onClick={() => setResetActivityState("confirming")}><RotateCcw aria-hidden="true" size={15} /> Dev reset activity</button>
                    <button className="activity-remove-menu-action" role="menuitem" type="button" onClick={() => { setIsFooterMenuOpen(false); onRemove(); }}>{canReturnToMore ? <RotateCcw aria-hidden="true" size={15} /> : <Trash2 aria-hidden="true" size={15} />} {canReturnToMore ? "Return to More for today" : "Remove from today"}</button>
                  </>
                )}
              </div>
            ) : null}
          </div>
          {timelineEnabled ? <DurationControl item={item} onAdjust={onAdjustDuration} onSet={onSetDuration} /> : null}
        </div>
        <div className="activity-footer-status">
          {!isComplete ? <button className={`skip-activity-button ${isSkipped ? "is-skipped" : ""}`} disabled={isSkipping} type="button" onClick={() => void toggleActivitySkip()}>
            <SkipForward aria-hidden="true" size={15} /> {isSkipping ? "Saving…" : isSkipped ? "Skipped Today" : "Skip for Today"}
          </button> : null}
          <button aria-label={isComplete ? `${item.title} completed` : `Mark ${item.title} complete`} className={`complete-activity-button ${isComplete ? "is-complete" : ""}`} disabled={isCompleting || isComplete} type="button" onClick={() => void toggleActivityComplete()}>
            <Check aria-hidden="true" size={16} weight="bold" /> {isCompleting ? "Saving…" : isComplete ? "Completed" : "Mark Complete"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeDayHighlight(value: unknown): DayHighlight {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_DAY_HIGHLIGHT;
  const candidate = value as Record<string, unknown>;
  const status = ["idle", "queued", "running", "ready", "quiet"].includes(String(candidate.status))
    ? candidate.status as DayHighlight["status"]
    : "idle";
  return {
    status,
    body: typeof candidate.body === "string" && candidate.body.trim() ? candidate.body.trim().slice(0, 180) : null,
    kind: typeof candidate.kind === "string" && candidate.kind.trim() ? candidate.kind.trim().slice(0, 40) : null,
    revision: typeof candidate.revision === "number" && Number.isFinite(candidate.revision) ? candidate.revision : 0,
  };
}

function completionTimeLabel(value: string | null | undefined) {
  if (!value) return "Completed today";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "Completed today";
  return `Completed at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function DayHighlights({
  completedItems,
  totalSelectedActivities,
  highlight,
  celebratingActivityId,
  onOpenActivity,
}: {
  completedItems: ScheduledItem[];
  totalSelectedActivities: number;
  highlight: DayHighlight;
  celebratingActivityId: string | null;
  onOpenActivity: (item: ScheduledItem, bounds: DOMRect) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const completedActivities = completedItems.length;
  const progress = totalSelectedActivities ? Math.min(100, (completedActivities / totalSelectedActivities) * 100) : 0;
  const planComplete = totalSelectedActivities > 0 && completedActivities >= totalSelectedActivities;
  const isDayBloom = planComplete && Boolean(celebratingActivityId);
  const density = completedItems.length === 1 ? "is-single" : completedItems.length <= 3 ? "is-sparse" : "";
  const visibleCopy = highlight.body || fallbackDayHighlight(completedItems.map((item) => ({
    title: item.title,
    displayTitle: activityDisplayTitle(item),
    duration: item.duration,
    completedAt: item.completedAt,
  })));
  const history = [...completedItems].sort((left, right) => (storedTimestampMillis(right.completedAt) ?? 0) - (storedTimestampMillis(left.completedAt) ?? 0));

  return (
    <section className={`day-highlights ${density} ${planComplete ? "is-plan-complete" : ""} ${isDayBloom ? "is-day-bloom" : ""} ${isOpen ? "is-open" : ""}`} aria-labelledby="day-highlights-title">
      {isDayBloom ? <span aria-atomic="true" className="visually-hidden" role="status">Today complete.</span> : null}
      <button className="day-highlights-overview" type="button" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}>
        <span aria-label={`${completedActivities} of ${totalSelectedActivities} activities selected for today complete`} className={`day-highlights-count ${planComplete ? "is-complete" : ""} ${celebratingActivityId ? "is-updating" : ""}`} style={{ "--highlight-progress": `${progress}%` } as CSSProperties}>
          <strong>{completedActivities}/{totalSelectedActivities}</strong>
        </span>
        <span className="day-highlights-copy">
          <strong id="day-highlights-title">{isDayBloom ? "Today complete" : "Completed"}</strong>
          {visibleCopy ? <span>{visibleCopy}</span> : null}
        </span>
        <span className="day-highlights-icon-grid" aria-label={`${completedItems.length} completed activities`} style={{ "--highlight-columns": Math.min(completedItems.length, 6), "--highlight-mobile-columns": Math.min(completedItems.length, 4) } as CSSProperties}>
          {completedItems.map((item, index) => {
            const ActivityIcon = activityIconFor(item);
            return <span className={`day-highlight-icon ${celebratingActivityId === item.id ? "is-new" : ""}`} key={item.id} style={{ "--highlight-color": CATEGORY_META[item.category].color, "--highlight-index": index } as CSSProperties} title={activityDisplayTitle(item)}><ActivityIcon aria-hidden="true" size={17} /></span>;
          })}
        </span>
        <ChevronDown className="day-highlights-chevron" aria-hidden="true" size={18} />
      </button>
      {isOpen ? <div className="day-highlights-history" aria-label="Completed activities">
        {history.map((item) => {
          const ActivityIcon = activityIconFor(item);
          return <button key={item.id} type="button" onClick={(event) => onOpenActivity(item, event.currentTarget.getBoundingClientRect())}>
            <span className="day-highlight-history-icon" style={{ "--highlight-color": CATEGORY_META[item.category].color } as CSSProperties}><ActivityIcon aria-hidden="true" size={17} /></span>
            <span><strong>{activityDisplayTitle(item)}</strong><small>{completionTimeLabel(item.completedAt)} · {item.duration} minutes</small></span>
            <Check aria-hidden="true" size={17} />
          </button>;
        })}
      </div> : null}
    </section>
  );
}

function PastDayReview({
  items,
  state,
  pendingIds,
  onToggle,
}: {
  items: RoutineItem[];
  state: "loading" | "ready" | "error";
  pendingIds: Set<string>;
  onToggle: (item: RoutineItem) => void;
}) {
  if (state === "loading") {
    return <div className="past-day-review-loading" role="status">Loading this day…</div>;
  }
  if (state === "error") {
    return <div className="past-day-review-empty" role="alert"><strong>This day couldn’t load.</strong><span>Choose another day, then try again.</span></div>;
  }

  const selectedItems = partitionDayItems(items).active;
  const completedCount = selectedItems.filter((item) => item.completedAt).length;

  return <section className="past-day-review" aria-labelledby="past-day-review-title">
    <header>
      <div><strong id="past-day-review-title">Review this day</strong><span>Tap an activity to correct its completion.</span></div>
      <small>{completedCount}/{selectedItems.length}</small>
    </header>
    {selectedItems.length ? <div className="past-day-review-list">
      {selectedItems.map((item) => {
        const ActivityIcon = activityIconFor(item);
        const isComplete = Boolean(item.completedAt);
        const isPending = pendingIds.has(item.id);
        const status = isComplete ? "Completed" : item.skippedAt ? "Skipped" : "Not completed";
        return <button
          aria-label={`Mark ${activityDisplayTitle(item)} ${isComplete ? "incomplete" : "complete"}`}
          aria-pressed={isComplete}
          disabled={isPending}
          key={item.id}
          style={{ "--review-color": CATEGORY_META[item.category].color } as CSSProperties}
          type="button"
          onClick={() => onToggle(item)}
        >
          <span className="past-day-review-icon" aria-hidden="true"><ActivityIcon size={17} /></span>
          <span className="past-day-review-copy"><strong>{activityDisplayTitle(item)}</strong><small>{isPending ? "Saving…" : status} · {item.duration} minutes</small></span>
          <span className={`past-day-review-check ${isComplete ? "is-complete" : ""}`} aria-hidden="true">{isComplete ? <Check size={16} weight="bold" /> : null}</span>
        </button>;
      })}
    </div> : <div className="past-day-review-empty"><strong>Nothing was scheduled.</strong><span>There’s nothing to correct for this day.</span></div>}
  </section>;
}

function DayVictory({ isArriving, skippedEssentials }: { isArriving: boolean; skippedEssentials: number }) {
  const fullyCompleted = skippedEssentials === 0;
  return (
    <section className={`day-victory ${isArriving ? "is-arriving" : ""}`} aria-labelledby="day-victory-title">
      <span className="day-victory-medal" aria-hidden="true"><Trophy size={24} /></span>
      <div className="day-victory-copy">
        <span>Today’s achievement</span>
        <h3 id="day-victory-title">{fullyCompleted ? "Essentials complete" : "Today settled"}</h3>
        <p>{fullyCompleted ? "The rest of today is yours." : `${skippedEssentials} ${skippedEssentials === 1 ? "activity" : "activities"} skipped without changing your progress.`}</p>
      </div>
      <Sparkles className="day-victory-spark" aria-hidden="true" size={21} weight="light" />
    </section>
  );
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
        color: CATEGORY_META[category].color,
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
    return { ...item, planRole: normalizePlanRole(item.planRole), category, color: CATEGORY_META[category].color, detail: "Saved activity" } as RoutineItem;
  });
}

export default function Home() {
  const initialDateKeyRef = useRef(localDateKey());
  const [dayNavigation, setDayNavigation] = useState(() => ({
    todayDateKey: initialDateKeyRef.current,
    viewDate: initialDateKeyRef.current,
  }));
  const { todayDateKey, viewDate } = dayNavigation;
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [pastDayItems, setPastDayItems] = useState<RoutineItem[]>([]);
  const [pastDayState, setPastDayState] = useState<"loading" | "ready" | "error">("ready");
  const [pastDayPendingIds, setPastDayPendingIds] = useState<Set<string>>(() => new Set());
  const [startMinutes, setStartMinutes] = useState(START_MINUTES);
  const [preferredStartMinutes, setPreferredStartMinutes] = useState(START_MINUTES);
  const [dayStartedAt, setDayStartedAt] = useState<string | null>(null);
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [touchDragVisual, setTouchDragVisual] = useState<TouchDragVisual | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "retrying" | "error">("loading");
  const [isAdding, setIsAdding] = useState(false);
  const [isScheduleManagerOpen, setIsScheduleManagerOpen] = useState(false);
  const [scheduleManagerActivityId, setScheduleManagerActivityId] = useState<string | null>(null);
  const [isGlobalLunaOpen, setIsGlobalLunaOpen] = useState(false);
  const [globalLunaDraft, setGlobalLunaDraft] = useState("");
  const [occurrenceEditorItem, setOccurrenceEditorItem] = useState<RoutineItem | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftCategory, setDraftCategory] = useState<Category>("Care");
  const [draftScheduleKind, setDraftScheduleKind] = useState<"none" | "daily" | "weekdays" | "interval_days" | "sequence" | "luna">("daily");
  const [draftWeekdays, setDraftWeekdays] = useState([1, 2, 3, 4, 5]);
  const [draftIntervalDays, setDraftIntervalDays] = useState(2);
  const [draftIncludeToday, setDraftIncludeToday] = useState(true);
  const [draftLunaRequest, setDraftLunaRequest] = useState("");
  const [draftSetupRequest, setDraftSetupRequest] = useState("");
  const [draftPlanRole, setDraftPlanRole] = useState<PlanRole>("essential");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const savingEditRef = useRef(false);
  const [editCategory, setEditCategory] = useState<Category>("Care");
  const [mobileActivityMenuId, setMobileActivityMenuId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [daySettings, setDaySettings] = useState<DaySettings>(DEFAULT_DAY_SETTINGS);
  const [dayHighlight, setDayHighlight] = useState<DayHighlight>(EMPTY_DAY_HIGHLIGHT);
  const [captureAttention, setCaptureAttention] = useState<CaptureAttention[]>([]);
  const [lunaSummary, setLunaSummary] = useState<LunaSummary>({ unreadCount: 0, pendingDecisionCount: 0, captureRevision: null, agentOnline: false });
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [resetTodayState, setResetTodayState] = useState<"idle" | "confirming" | "resetting" | "error">("idle");
  const [mobileResetActivity, setMobileResetActivity] = useState<{ id: string; state: "confirming" | "resetting" | "error" } | null>(null);
  const [activityResetVersions, setActivityResetVersions] = useState<Record<string, number>>({});
  const [realMinutes, setRealMinutes] = useState(minutesNow);
  const [fakeMinutes, setFakeMinutes] = useState<number | null>(DEFAULT_DEV_MINUTES);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [receiptPreviewActivityId, setReceiptPreviewActivityId] = useState<string | null>(null);
  const [mobileActivityTransition, setMobileActivityTransition] = useState<MobileActivityTransition | null>(null);
  const [startConversationActivityId, setStartConversationActivityId] = useState<string | null>(null);
  const [dismissedClockActivityId, setDismissedClockActivityId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [pendingActivityIds, setPendingActivityIds] = useState<Set<string>>(() => new Set());
  const [celebratingActivityId, setCelebratingActivityId] = useState<string | null>(null);
  const [skippingActivityId, setSkippingActivityId] = useState<string | null>(null);
  const [showAllExtras, setShowAllExtras] = useState(false);
  const [promotingExtraId, setPromotingExtraId] = useState<string | null>(null);
  const [extraTransitionLocked, setExtraTransitionLocked] = useState(false);
  const [recentlyActivatedExtra, setRecentlyActivatedExtra] = useState<{ id: string; title: string } | null>(null);
  const [removeTodayItem, setRemoveTodayItem] = useState<RoutineItem | null>(null);
  const [isRemovingToday, setIsRemovingToday] = useState(false);
  const [removeTodayError, setRemoveTodayError] = useState<string | null>(null);
  const [extraPromotionError, setExtraPromotionError] = useState<string | null>(null);
  const [settlingCompletedIds, setSettlingCompletedIds] = useState<Set<string>>(() => new Set());
  const [nextActivityCueId, setNextActivityCueId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const devMenuRef = useRef<HTMLDivElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const completionCelebrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completionHandoffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipMotionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipHandoffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipMotionStartedActivityRef = useRef<string | null>(null);
  const skipMotionVisibleActivityRef = useRef<string | null>(null);
  const completionPlacementTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nextActivityCueTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activityListPositionSnapshot = useRef<Map<string, { left: number; top: number }> | null>(null);
  const extraPromotionOrigins = useRef<Map<string, DOMRect>>(new Map());
  const activityReorderAnimations = useRef<Animation[]>([]);
  const expandedCompletionActionRef = useRef<(() => void) | null>(null);
  const mobileActivityTransitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mobileActivityOriginRef = useRef<MobileActivityTransition | null>(null);
  const mobileActivitySlotRectsRef = useRef<MobileActivityTransition[]>([]);
  const touchDragRef = useRef<TouchDrag | null>(null);
  const suppressActivityClickRef = useRef(false);
  const suppressActivityClickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const extraTransitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dayLoadDateRef = useRef(todayDateKey);

  useEffect(() => {
    const timer = window.setInterval(() => setRealMinutes(minutesNow()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let rolloverTimer: number | undefined;

    function syncLocalDay() {
      const observedDateKey = localDateKey();
      setDayNavigation((current) => reconcileLocalDay(current, observedDateKey));
    }

    function scheduleRollover() {
      if (rolloverTimer) window.clearTimeout(rolloverTimer);
      rolloverTimer = window.setTimeout(() => {
        syncLocalDay();
        scheduleRollover();
      }, millisecondsUntilNextLocalDay(new Date()));
    }

    function syncAfterWake() {
      syncLocalDay();
      scheduleRollover();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") syncAfterWake();
    }

    syncLocalDay();
    scheduleRollover();
    window.addEventListener("focus", syncAfterWake);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (rolloverTimer) window.clearTimeout(rolloverTimer);
      window.removeEventListener("focus", syncAfterWake);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!recentlyActivatedExtra) return;
    const timer = window.setTimeout(() => setRecentlyActivatedExtra(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [recentlyActivatedExtra]);

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
    const date = todayDateKey;
    const endpoint = `/api/day?date=${date}`;
    const isRollover = dayLoadDateRef.current !== date;
    dayLoadDateRef.current = date;

    if (isRollover) {
      if (completionCelebrationTimer.current) clearTimeout(completionCelebrationTimer.current);
      if (completionHandoffTimer.current) clearTimeout(completionHandoffTimer.current);
      if (skipMotionTimer.current) clearTimeout(skipMotionTimer.current);
      if (skipHandoffTimer.current) clearTimeout(skipHandoffTimer.current);
      if (nextActivityCueTimer.current) clearTimeout(nextActivityCueTimer.current);
      if (mobileActivityTransitionTimer.current) clearTimeout(mobileActivityTransitionTimer.current);
      if (extraTransitionTimer.current) clearTimeout(extraTransitionTimer.current);
      completionPlacementTimers.current.forEach((timer) => clearTimeout(timer));
      completionPlacementTimers.current.clear();
      setItems([]);
      setCaptureAttention([]);
      setCompletedIds(new Set());
      setPendingActivityIds(new Set());
      setSettlingCompletedIds(new Set());
      setHasLoaded(false);
      setDayStartedAt(null);
      setDayHighlight(EMPTY_DAY_HIGHLIGHT);
      setSelectedActivityId(null);
      setReceiptPreviewActivityId(null);
      setMobileActivityTransition(null);
      setStartConversationActivityId(null);
      setDismissedClockActivityId(null);
      setCelebratingActivityId(null);
      setSkippingActivityId(null);
      setPromotingExtraId(null);
      setExtraTransitionLocked(false);
      setRecentlyActivatedExtra(null);
      setRemoveTodayItem(null);
      setIsRemovingToday(false);
      setRemoveTodayError(null);
      setExtraPromotionError(null);
      setNextActivityCueId(null);
      setShowAllExtras(false);
      setMobileActivityMenuId(null);
      setOccurrenceEditorItem(null);
    }

    async function load() {
      try {
        setSaveState("loading");
        let response = await fetch(endpoint, { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (!response.ok) throw new Error(`Could not load the saved day (${response.status}).`);
        let day = await response.json() as { items: unknown; attention?: CaptureAttention[]; startMinutes: number; preferredStartMinutes?: number; startedAt?: string | null; settings?: unknown; highlight?: unknown; needsImport: boolean };

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
        const loadedItems = hydrateStoredItems(day.items);
        setItems(loadedItems);
        setCaptureAttention(Array.isArray(day.attention) ? day.attention : []);
        setCompletedIds(new Set(loadedItems.filter((item) => item.completedAt).map((item) => item.id)));
        setStartMinutes(day.startMinutes);
        setPreferredStartMinutes(day.preferredStartMinutes ?? START_MINUTES);
        setDayStartedAt(day.startedAt ?? null);
        setDaySettings(normalizeDaySettings(day.settings));
        setDayHighlight(normalizeDayHighlight(day.highlight));
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
  }, [todayDateKey]);

  useEffect(() => {
    if (viewDate === todayDateKey) return;

    let cancelled = false;
    void fetch(`/api/day?date=${viewDate}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("That day could not be loaded.");
        const day = await response.json() as { items: unknown };
        if (cancelled) return;
        setPastDayItems(hydrateStoredItems(day.items));
        setPastDayState("ready");
      })
      .catch(() => {
        if (!cancelled) setPastDayState("error");
      });
    return () => { cancelled = true; };
  }, [todayDateKey, viewDate]);

  useEffect(() => {
    if (!hasLoaded) return;
    let cancelled = false;
    let previousRevision: string | null = null;
    const refresh = async () => {
      try {
        const response = await fetch("/api/luna?summary=1", { cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json() as LunaSummary;
        if (cancelled) return;
        setLunaSummary(next);
        if (previousRevision && next.captureRevision && previousRevision !== next.captureRevision) void reloadToday();
        previousRevision = next.captureRevision;
      } catch { /* The saved day remains usable while Luna catches up. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [hasLoaded]);

  useEffect(() => {
    if (!hasLoaded || dayHighlight.status !== "queued" && dayHighlight.status !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/day/highlight?date=${todayDateKey}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Highlight refresh failed.");
        const result = await response.json() as { highlight?: unknown };
        if (cancelled) return;
        const next = normalizeDayHighlight(result.highlight);
        setDayHighlight(next);
        if (next.status === "queued" || next.status === "running") timer = setTimeout(poll, 1_800);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 5_000);
      }
    };
    timer = setTimeout(poll, 900);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dayHighlight.revision, dayHighlight.status, hasLoaded, todayDateKey]);

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
    if (completionCelebrationTimer.current) clearTimeout(completionCelebrationTimer.current);
    if (completionHandoffTimer.current) clearTimeout(completionHandoffTimer.current);
    if (skipMotionTimer.current) clearTimeout(skipMotionTimer.current);
    if (skipHandoffTimer.current) clearTimeout(skipHandoffTimer.current);
    completionPlacementTimers.current.forEach((timer) => clearTimeout(timer));
    activityReorderAnimations.current.forEach((animation) => animation.cancel());
    if (nextActivityCueTimer.current) clearTimeout(nextActivityCueTimer.current);
    if (mobileActivityTransitionTimer.current) clearTimeout(mobileActivityTransitionTimer.current);
    if (touchDragRef.current) {
      clearTimeout(touchDragRef.current.timer);
      touchDragRef.current.cleanup();
    }
    if (suppressActivityClickTimer.current) clearTimeout(suppressActivityClickTimer.current);
    if (extraTransitionTimer.current) clearTimeout(extraTransitionTimer.current);
  }, []);

  useEffect(() => {
    function preventActiveTouchDragScroll(event: TouchEvent) {
      if (touchDragRef.current?.active) event.preventDefault();
    }
    document.addEventListener("touchmove", preventActiveTouchDragScroll, { passive: false });
    return () => document.removeEventListener("touchmove", preventActiveTouchDragScroll);
  }, []);

  const completedBeforeLaunchIds = useMemo(() => {
    const launchTimestamp = storedTimestampMillis(dayStartedAt);
    if (launchTimestamp === null) return new Set<string>();
    return new Set(items.flatMap((item) => {
      const completedTimestamp = storedTimestampMillis(item.completedAt);
      return completedTimestamp !== null && completedTimestamp <= launchTimestamp ? [item.id] : [];
    }));
  }, [dayStartedAt, items]);

  const { essentials: essentialDayItems, chosenExtras: chosenExtraItems, active: activeDayItems, keepGoing: keepGoingItems, availableExtras } = useMemo(() => partitionDayItems(items), [items]);
  const renderedDayItems = useMemo(() => {
    const preview = receiptPreviewActivityId
      ? availableExtras.find((item) => item.id === receiptPreviewActivityId)
      : null;
    return preview ? [...activeDayItems, preview] : activeDayItems;
  }, [activeDayItems, availableExtras, receiptPreviewActivityId]);
  const keepGoingItemIds = useMemo(() => new Set(keepGoingItems.map((item) => item.id)), [keepGoingItems]);
  const essentialItemIds = useMemo(() => new Set(essentialDayItems.map((item) => item.id)), [essentialDayItems]);
  const chosenExtraItemIds = useMemo(() => new Set(chosenExtraItems.map((item) => item.id)), [chosenExtraItems]);
  const attentionByActivity = useMemo(() => captureAttention.reduce<Map<string, CaptureAttention[]>>((map, capture) => {
    const entries = map.get(capture.activityId) ?? [];
    entries.push(capture);
    map.set(capture.activityId, entries);
    return map;
  }, new Map()), [captureAttention]);
  const attentionExtras = useMemo(() => availableExtras.filter((item) => item.activityId && attentionByActivity.has(item.activityId)), [attentionByActivity, availableExtras]);
  const ordinaryExtras = useMemo(() => availableExtras.filter((item) => !item.activityId || !attentionByActivity.has(item.activityId)), [attentionByActivity, availableExtras]);
  const dayProgress = useMemo(() => dayProgressCounts(items), [items]);
  const goFurtherExtras = useMemo(() => [...attentionExtras, ...ordinaryExtras], [attentionExtras, ordinaryExtras]);
  const visibleGoFurtherExtras = showAllExtras ? goFurtherExtras : goFurtherExtras.slice(0, GO_FURTHER_PREVIEW_LIMIT);
  const visibleGoFurtherIds = useMemo(() => new Set(visibleGoFurtherExtras.map((item) => item.id)), [visibleGoFurtherExtras]);
  const visibleOtherExtras = ordinaryExtras.filter((item) => visibleGoFurtherIds.has(item.id));
  const visibleAttentionExtras = attentionExtras.filter((item) => visibleGoFurtherIds.has(item.id));

  const scheduledItems = useMemo(() => {
    return renderedDayItems.reduce<{ cursor: number; scheduled: ScheduledItem[] }>((state, item) => {
      const consumesScheduleTime = !item.skippedAt && !completedBeforeLaunchIds.has(item.id);
      const scheduled = { ...item, start: state.cursor, end: state.cursor + (consumesScheduleTime ? item.duration : 0) };
      return { cursor: scheduled.end, scheduled: [...state.scheduled, scheduled] };
    }, { cursor: startMinutes, scheduled: [] }).scheduled;
  }, [renderedDayItems, completedBeforeLaunchIds, startMinutes]);

  const totalMinutes = useMemo(
    () => activeDayItems.reduce((total, item) => total + (item.skippedAt ? 0 : item.duration), 0),
    [activeDayItems],
  );
  const scheduledMinutes = useMemo(
    () => activeDayItems.reduce((total, item) => total + (item.skippedAt || completedBeforeLaunchIds.has(item.id) ? 0 : item.duration), 0),
    [activeDayItems, completedBeforeLaunchIds],
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
  const displayedScheduledItems = useMemo(() => {
    const visibleItems = scheduledItems.filter((item) => !completedIds.has(item.id) || settlingCompletedIds.has(item.id) || selectedActivityId === item.id);
    if (timelineEnabled && isDayStarted) {
      return [
        ...visibleItems.filter((item) => passedItemIds.has(item.id)),
        ...visibleItems.filter((item) => !passedItemIds.has(item.id)),
      ];
    }
    return [
      ...visibleItems.filter((item) => essentialItemIds.has(item.id)),
      ...visibleItems.filter((item) => chosenExtraItemIds.has(item.id)),
      ...visibleItems.filter((item) => keepGoingItemIds.has(item.id)),
      ...visibleItems.filter((item) => !essentialItemIds.has(item.id) && !chosenExtraItemIds.has(item.id) && !keepGoingItemIds.has(item.id)),
    ];
  }, [chosenExtraItemIds, completedIds, essentialItemIds, isDayStarted, keepGoingItemIds, passedItemIds, scheduledItems, selectedActivityId, settlingCompletedIds, timelineEnabled]);
  const firstVisibleEssentialId = displayedScheduledItems.find((item) => essentialItemIds.has(item.id))?.id ?? null;
  const firstVisibleChosenExtraId = displayedScheduledItems.find((item) => chosenExtraItemIds.has(item.id))?.id ?? null;
  const firstVisibleKeepGoingId = displayedScheduledItems.find((item) => keepGoingItemIds.has(item.id))?.id ?? null;
  const settledCompletedItems = useMemo(() => scheduledItems
    .filter((item) => completedIds.has(item.id) && !settlingCompletedIds.has(item.id))
    .sort((left, right) => (storedTimestampMillis(left.completedAt) ?? 0) - (storedTimestampMillis(right.completedAt) ?? 0)),
  [completedIds, scheduledItems, settlingCompletedIds]);
  const nowLineIndex = timelineEnabled && isDayStarted
    ? displayedScheduledItems.filter((item) => passedItemIds.has(item.id)).length
    : null;

  useLayoutEffect(() => {
    const before = activityListPositionSnapshot.current;
    if (!before) return;
    activityListPositionSnapshot.current = null;

    const animations: Animation[] = [];
    document.querySelectorAll<HTMLElement>(".routine-row[data-activity-id]").forEach((row) => {
      const id = row.dataset.activityId;
      const promotionOrigin = id ? extraPromotionOrigins.current.get(id) : null;
      if (promotionOrigin) {
        extraPromotionOrigins.current.delete(id!);
        const current = row.getBoundingClientRect();
        animations.push(row.animate([
          {
            transform: `translate(${promotionOrigin.left - current.left}px, ${promotionOrigin.top - current.top}px) scaleY(${Math.max(.55, promotionOrigin.height / Math.max(current.height, 1))})`,
            opacity: .72,
          },
          { transform: "translate(0, 0) scaleY(1)", opacity: 1 },
        ], { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 520, easing: "cubic-bezier(.2, .8, .24, 1)" }));
        return;
      }
      const previous = id ? before.get(id) : null;
      if (!previous) return;
      const current = row.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      animations.push(row.animate([
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ], {
        duration: 440,
        easing: "cubic-bezier(.2, .78, .24, 1)",
      }));
    });
    activityReorderAnimations.current = animations;
  }, [displayedScheduledItems]);

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
      minutes: activeDayItems.filter((item) => item.category === category && !item.skippedAt).reduce((sum, item) => sum + item.duration, 0),
      count: activeDayItems.filter((item) => item.category === category && !item.skippedAt).length,
      color: CATEGORY_META[category].color,
    })).filter((entry) => entry.minutes > 0),
    [activeDayItems],
  );

  const fakeTimePresets = [
    { label: "Before", value: Math.max(0, startMinutes - 15) },
    { label: "Start", value: startMinutes },
    { label: "Middle", value: startMinutes + Math.round(scheduledMinutes / 2 / 5) * 5 },
    { label: "Done", value: Math.min(1439, finishMinutes + 5) },
  ];
  const minutesUntilPreferredStart = Math.max(0, preferredStartMinutes - displayedMinutes);
  const nextStartBoundary = Math.min(1435, Math.ceil(displayedMinutes / 5) * 5);
  const activeItemCount = dayProgress.essentialTotal;
  const completedItemCount = dayProgress.essentialCompleted;
  const skippedEssentialCount = dayProgress.essentialSkipped;
  const selectedItemCount = dayProgress.selectedTotal;
  const selectedCompletedItemCount = dayProgress.selectedCompleted;
  const essentialsComplete = activeItemCount > 0 && completedItemCount >= activeItemCount;
  const settledEssentialsComplete = activeItemCount > 0 && dayProgress.essentialResolved >= activeItemCount;
  const unfinishedChosenExtras = activeDayItems.filter((item) => normalizePlanRole(item.planRole) === "extra"
    && !item.skippedAt
    && (!completedIds.has(item.id) || settlingCompletedIds.has(item.id)));
  const dayAchievementReady = settledEssentialsComplete && unfinishedChosenExtras.length === 0;
  const isDayBloom = dayAchievementReady && Boolean(celebratingActivityId);
  const isReviewingPastDay = viewDate !== todayDateKey;

  function showDay(date: string) {
    if (date > todayDateKey) return;
    if (date === todayDateKey) {
      setPastDayState("ready");
      setPastDayItems([]);
    } else {
      setPastDayState("loading");
      setPastDayPendingIds(new Set());
    }
    setDayNavigation((current) => ({ ...current, viewDate: date }));
    setIsAdding(false);
    setIsMenuOpen(false);
    setSelectedActivityId(null);
    setReceiptPreviewActivityId(null);
    setMobileActivityMenuId(null);
    setIsGlobalLunaOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  async function togglePastDayCompletion(item: RoutineItem) {
    if (pastDayPendingIds.has(item.id)) return;
    setPastDayPendingIds((current) => new Set(current).add(item.id));
    setSaveState("saving");
    try {
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: item.completedAt ? "reopen" : "complete",
          activityId: item.activityId ?? item.id,
          occurrenceId: item.occurrenceId ?? item.id,
          date: viewDate,
          timing: null,
          refreshHighlight: false,
        }),
      });
      if (!response.ok) throw new Error("That correction could not be saved.");
      const result = await response.json() as { completed: boolean; completedAt?: string };
      setPastDayItems((current) => current.map((candidate) => candidate.id === item.id ? {
        ...candidate,
        completedAt: result.completed ? result.completedAt ?? new Date().toISOString() : null,
        skippedAt: result.completed ? null : candidate.skippedAt,
      } : candidate));
      setSaveState("saved");
    } catch {
      setSaveState("retrying");
    } finally {
      setPastDayPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

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

  async function reloadToday(): Promise<RoutineItem[] | null> {
    try {
      const response = await fetch(`/api/day?date=${todayDateKey}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Today could not be refreshed.");
      const day = await response.json() as { items: unknown; attention?: CaptureAttention[]; highlight?: unknown };
      const refreshedItems = hydrateStoredItems(day.items);
      setItems(refreshedItems);
      setCaptureAttention(Array.isArray(day.attention) ? day.attention : []);
      setCompletedIds(new Set(refreshedItems.filter((item) => item.completedAt).map((item) => item.id)));
      setDayHighlight(normalizeDayHighlight(day.highlight));
      setSaveState("saved");
      return refreshedItems;
    } catch {
      setSaveState("retrying");
      return null;
    }
  }

  async function startDay() {
    if (isStartingDay || isDayStarted) return;
    setIsStartingDay(true);
    try {
      const response = await fetch(`/api/day?date=${todayDateKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "start-day", currentMinutes: displayedMinutes }),
      });
      if (!response.ok) throw new Error("The day could not be started.");
      const day = await response.json() as { items: unknown; startMinutes: number; startedAt: string; preferredStartMinutes?: number; highlight?: unknown };
      const launchedItems = hydrateStoredItems(day.items);
      setItems(launchedItems);
      setCompletedIds(new Set(launchedItems.filter((item) => item.completedAt).map((item) => item.id)));
      setStartMinutes(day.startMinutes);
      setPreferredStartMinutes(day.preferredStartMinutes ?? preferredStartMinutes);
      setDayStartedAt(day.startedAt);
      setDayHighlight(normalizeDayHighlight(day.highlight));
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
      const response = await fetch(`/api/day?date=${todayDateKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reset-today" }),
      });
      if (!response.ok) throw new Error("Today could not be reset.");
      const day = await response.json() as { items: unknown; startMinutes: number; preferredStartMinutes?: number; startedAt?: string | null };
      const resetItems = hydrateStoredItems(day.items);
      resetActivityTimingState(resetItems.map((item) => item.id));
      setItems(resetItems);
      setCompletedIds(new Set());
      setDayHighlight(EMPTY_DAY_HIGHLIGHT);
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

  async function persistOccurrenceAction(action: Record<string, unknown>) {
    setSaveState("saving");
    try {
      const response = await fetch("/api/occurrences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: { ...action, idempotencyKey: window.crypto.randomUUID() } }),
      });
      if (!response.ok) throw new Error("The day change could not be saved.");
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("retrying");
      return false;
    }
  }

  async function persistOccurrenceActions(actions: Array<Record<string, unknown>>) {
    setSaveState("saving");
    try {
      const response = await fetch("/api/occurrences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: actions.map((action) => ({ ...action, idempotencyKey: window.crypto.randomUUID() })) }),
      });
      if (!response.ok) throw new Error("The day order could not be saved.");
      setSaveState("saved");
    } catch {
      setSaveState("retrying");
    }
  }

  function lockExtraTransitions() {
    setExtraTransitionLocked(true);
    if (extraTransitionTimer.current) clearTimeout(extraTransitionTimer.current);
    extraTransitionTimer.current = setTimeout(() => {
      setExtraTransitionLocked(false);
      extraTransitionTimer.current = undefined;
    }, 650);
  }

  async function promoteExtra(item: RoutineItem, origin: DOMRect) {
    if (extraTransitionLocked || promotingExtraId || normalizePlanRole(item.planRole) !== "extra" || item.activatedAt) return;
    lockExtraTransitions();
    activityListPositionSnapshot.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>(".routine-row[data-activity-id]")).flatMap((row) => {
        const id = row.dataset.activityId;
        const bounds = row.getBoundingClientRect();
        return id ? [[id, { left: bounds.left, top: bounds.top }] as const] : [];
      }),
    );
    extraPromotionOrigins.current.set(item.id, origin);
    const activatedAt = new Date().toISOString();
    setExtraPromotionError(null);
    setShowAllExtras(false);
    setPromotingExtraId(item.id);
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, activatedAt } : candidate));
    setSaveState("saving");
    window.setTimeout(() => cueNextActivity(item.id), 80);
    try {
      const response = await fetch("/api/occurrences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: [{ type: "activate_extra", occurrenceId: item.id, idempotencyKey: window.crypto.randomUUID() }] }),
      });
      if (!response.ok) throw new Error("That extra could not be added today.");
      setRecentlyActivatedExtra({ id: item.id, title: item.title });
      setSaveState("saved");
    } catch {
      extraPromotionOrigins.current.delete(item.id);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, activatedAt: null } : candidate));
      setShowAllExtras(true);
      setExtraPromotionError(`${item.title} wasn’t added. Try it again.`);
      setSaveState("saved");
    } finally {
      setPromotingExtraId(null);
    }
  }

  async function deactivateExtra(item: RoutineItem) {
    if (extraTransitionLocked || promotingExtraId || normalizePlanRole(item.planRole) !== "extra" || !item.activatedAt || item.completedAt || item.skippedAt) return;
    lockExtraTransitions();
    captureActivityListPositions();
    setMobileActivityMenuId(null);
    if (selectedActivityId === item.id) collapseActivity();
    setRecentlyActivatedExtra(null);
    setPromotingExtraId(item.id);
    setExtraPromotionError(null);
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, activatedAt: null } : candidate));
    const saved = await persistOccurrenceAction({ type: "deactivate_extra", occurrenceId: item.id });
    if (!saved) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, activatedAt: item.activatedAt } : candidate));
      setExtraPromotionError(`${item.title} couldn’t return to More for today. Try again.`);
    }
    setPromotingExtraId(null);
  }

  async function setActivityRole(item: RoutineItem, planRole: PlanRole) {
    if (normalizePlanRole(item.planRole) === planRole) return;
    setMobileActivityMenuId(null);
    if (planRole === "extra" && selectedActivityId === item.id) collapseActivity();
    captureActivityListPositions();
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, planRole, activatedAt: null } : candidate));
    setSaveState("saving");
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "set-role", occurrenceId: item.id, planRole }),
      });
      if (!response.ok) throw new Error("The daily role could not be saved.");
      setSaveState("saved");
    } catch {
      await reloadToday();
      setSaveState("retrying");
    }
  }

  function setDuration(id: string, value: number) {
    if (!Number.isFinite(value)) return;
    const duration = Math.min(480, Math.max(1, Math.round(value)));
    setItems((current) => current.map((item) => item.id === id ? { ...item, duration } : item));
    void persistOccurrenceAction({ type: "set_duration", occurrenceId: id, durationMinutes: Math.max(5, duration) });
  }

  function adjustDuration(id: string, delta: number) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    const duration = delta > 0
      ? Math.floor(item.duration / DURATION_STEP) * DURATION_STEP + DURATION_STEP
      : Math.ceil(item.duration / DURATION_STEP) * DURATION_STEP - DURATION_STEP;
    setDuration(id, Math.max(5, duration));
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    const meta = CATEGORY_META[draftCategory];
    const clientKey = `custom-${window.crypto.randomUUID()}`;
    const item: RoutineItem = {
      id: clientKey,
      activityId: clientKey,
      occurrenceId: clientKey,
      title: title.slice(0, 60),
      detail: "Custom block",
      duration: normalizeActivityDuration(draftDuration),
      category: draftCategory,
      planRole: draftPlanRole,
      ...meta,
    };
    setSaveState("saving");
    try {
      const setupRequest = [draftSetupRequest.trim(), draftScheduleKind === "luna" ? `Schedule request: ${draftLunaRequest.trim() || `Help me decide how ${item.title} should fit into my routine. Ask me one useful question if you need to.`}` : ""].filter(Boolean).join("\n\n");
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientKey,
          title: item.title,
          category: item.category,
          duration: item.duration,
          icon: item.icon,
          color: item.color,
          date: todayDateKey,
          schedule: draftScheduleKind === "weekdays"
            ? { kind: "weekdays", weekdays: draftWeekdays, intervalWeeks: 1 }
            : draftScheduleKind === "interval_days"
              ? { kind: "interval_days", every: draftIntervalDays, anchorDate: todayDateKey }
              : draftScheduleKind === "daily"
                ? { kind: "daily" }
                : { kind: "none" },
          includeToday: draftIncludeToday,
          planRole: draftPlanRole,
          origin: "user",
          setupRequest,
        }),
      });
      const created = await response.json() as { activity?: { id: string; title: string }; error?: string };
      if (!response.ok) throw new Error(created.error || "The activity could not be created.");
      const dayResponse = await fetch(`/api/day?date=${todayDateKey}`, { cache: "no-store" });
      if (!dayResponse.ok) throw new Error("The new activity could not be loaded.");
      const day = await dayResponse.json() as { items: unknown };
      const nextItems = hydrateStoredItems(day.items);
      setItems(nextItems);
      setSaveState("saved");
      if (draftScheduleKind === "sequence") {
        setScheduleManagerActivityId(created.activity?.id || clientKey);
        setIsScheduleManagerOpen(true);
      }
      const createdItem = nextItems.find((candidate) => candidate.activityId === created.activity?.id || candidate.activityId === clientKey);
      if (createdItem && setupRequest) setSelectedActivityId(createdItem.id);
    } catch {
      setSaveState("retrying");
      return;
    }
    setDraftTitle("");
    setDraftDuration(15);
    setDraftScheduleKind("daily");
    setDraftWeekdays([1, 2, 3, 4, 5]);
    setDraftIntervalDays(2);
    setDraftIncludeToday(true);
    setDraftLunaRequest("");
    setDraftSetupRequest("");
    setDraftPlanRole("essential");
    setIsAdding(false);
  }

  function requestRemoveItem(item: RoutineItem) {
    const canReturnToMore = normalizePlanRole(item.planRole) === "extra" && Boolean(item.activatedAt) && !item.completedAt && !item.skippedAt;
    if (canReturnToMore) {
      void deactivateExtra(item);
      return;
    }
    setMobileActivityMenuId(null);
    setRemoveTodayError(null);
    setRemoveTodayItem(item);
  }

  async function confirmRemoveItem() {
    const item = removeTodayItem;
    if (!item || isRemovingToday) return;
    setIsRemovingToday(true);
    setRemoveTodayError(null);
    const saved = await persistOccurrenceAction({ type: "set_status", occurrenceId: item.id, status: "removed" });
    if (!saved) {
      setRemoveTodayError("That change couldn’t be saved. Nothing was removed.");
      setIsRemovingToday(false);
      return;
    }
    const id = item.id;
    setMobileActivityMenuId(null);
    if (editingId === id) cancelEditing();
    if (selectedActivityId === id) setSelectedActivityId(null);
    setCompletedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setItems((current) => current.filter((item) => item.id !== id));
    setRemoveTodayItem(null);
    setIsRemovingToday(false);
  }

  function startEditing(item: RoutineItem) {
    if (savingEditRef.current) return;
    setEditError(null);
    setMobileActivityMenuId(null);
    setMobileResetActivity(null);
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
    window.setTimeout(() => document.getElementById(`activity-title-edit-${item.id}`)?.focus(), 240);
  }

  function cancelEditing() {
    if (savingEditRef.current) return;
    setEditError(null);
    setEditingId(null);
    setEditTitle("");
    setMobileActivityMenuId(null);
    setMobileResetActivity(null);
  }

  async function commitEdit() {
    const title = editTitle.trim().slice(0, 60);
    if (!editingId || !title || savingEditRef.current) return false;
    const editingItem = items.find((item) => item.id === editingId);
    if (!editingItem) return false;
    if (editingItem.title === title && editingItem.category === editCategory) {
      cancelEditing();
      return true;
    }
    const activityId = editingItem.activityId ?? editingItem.id;
    savingEditRef.current = true;
    setIsSavingEdit(true);
    setEditError(null);
    setMobileActivityMenuId(null);
    try {
      setSaveState("saving");
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "update",
          activityId,
          title,
          date: todayDateKey,
          category: editCategory,
          color: CATEGORY_META[editCategory].color,
        }),
      });
      if (!response.ok) throw new Error("Activity update failed.");
      setItems((current) => current.map((item) => (item.activityId ?? item.id) === activityId ? {
        ...item,
        title,
        displayTitle: derivedDisplayTitle(title, item.variantName, item.displayLabel),
        category: editCategory,
        color: CATEGORY_META[editCategory].color,
      } : item));
      setSaveState("saved");
      savingEditRef.current = false;
      cancelEditing();
      return true;
    } catch {
      setSaveState("error");
      setEditError("Couldn’t save this change. Your edit is still here—try saving again.");
      return false;
    } finally {
      savingEditRef.current = false;
      setIsSavingEdit(false);
    }
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    void commitEdit();
  }

  function moveItem(sourceId: string, targetId: string, position: "before" | "after") {
    if (sourceId === targetId || dragGroupForItem(sourceId) !== dragGroupForItem(targetId)) return;
    setItems((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex((item) => item.id === sourceId);
      if (sourceIndex < 0 || !next.some((item) => item.id === targetId)) return current;
      const [moved] = next.splice(sourceIndex, 1);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, moved);
      void persistOccurrenceActions(next.map((item, index) => ({ type: "move_within_day", occurrenceId: item.id, position: index })));
      return next;
    });
  }

  function moveByKeyboard(id: string, direction: -1 | 1) {
    const group = dragGroupForItem(id);
    const groupItems = displayedScheduledItems.filter((item) => dragGroupForItem(item.id) === group);
    const index = groupItems.findIndex((item) => item.id === id);
    const target = groupItems[index + direction];
    if (target) moveItem(id, target.id, direction < 0 ? "before" : "after");
  }

  function handleDragKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    if (event.target !== event.currentTarget || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    moveByKeyboard(id, event.key === "ArrowUp" ? -1 : 1);
  }

  function isActivityDragTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return true;
    return !target.closest(".item-controls, .inline-edit-form, input, textarea, select, a");
  }

  function handleDragStart(event: DragEvent<HTMLElement>, id: string) {
    if (!isActivityDragTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDropTarget(null);
  }

  function dragGroupForItem(id: string) {
    if (essentialItemIds.has(id)) return "essential";
    if (chosenExtraItemIds.has(id)) return "going-further";
    if (keepGoingItemIds.has(id)) return "keep-going";
    return "other";
  }

  function touchDropTarget(clientX: number, clientY: number, sourceId: string): DropTarget | null {
    const sourceGroup = dragGroupForItem(sourceId);
    const rows = [...document.querySelectorAll<HTMLElement>(`.routine-row[data-drag-group="${sourceGroup}"]`)]
      .filter((row) => row.dataset.activityId && row.dataset.activityId !== sourceId);
    if (!rows.length) return null;
    const horizontalBounds = rows.reduce((bounds, row) => {
      const rect = row.getBoundingClientRect();
      return { left: Math.min(bounds.left, rect.left), right: Math.max(bounds.right, rect.right) };
    }, { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY });
    if (clientX < horizontalBounds.left - 28 || clientX > horizontalBounds.right + 28) return null;
    for (const row of rows) {
      const targetId = row.dataset.activityId;
      const bounds = row.getBoundingClientRect();
      if (targetId && clientY < bounds.top + bounds.height / 2) return { id: targetId, position: "before" };
    }
    const lastTargetId = rows.at(-1)?.dataset.activityId;
    return lastTargetId ? { id: lastTargetId, position: "after" } : null;
  }

  function cancelTouchDrag(moveItemOnRelease: boolean, clientX = 0, clientY = 0) {
    const drag = touchDragRef.current;
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.cleanup();
    if (drag.active) {
      const target = moveItemOnRelease ? touchDropTarget(clientX, clientY, drag.sourceId) : null;
      if (target) moveItem(drag.sourceId, target.id, target.position);
      suppressActivityClickRef.current = true;
      if (suppressActivityClickTimer.current) clearTimeout(suppressActivityClickTimer.current);
      suppressActivityClickTimer.current = setTimeout(() => {
        suppressActivityClickRef.current = false;
        suppressActivityClickTimer.current = undefined;
      }, 500);
    }
    touchDragRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    setTouchDragVisual(null);
  }

  function handleActivityPointerDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.pointerType !== "touch" || !isActivityDragTarget(event.target)) return;
    if (touchDragRef.current) cancelTouchDrag(false);
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const drag: TouchDrag = {
      active: false,
      pointerId,
      sourceId: id,
      startX: event.clientX,
      startY: event.clientY,
      cleanup: () => undefined,
      timer: setTimeout(() => {
        const bounds = element.closest<HTMLElement>(".routine-card")?.getBoundingClientRect() ?? element.getBoundingClientRect();
        drag.active = true;
        try {
          element.setPointerCapture(pointerId);
        } catch {
          // Window-level listeners below keep the gesture reliable when a
          // mobile browser declines delayed pointer capture.
        }
        setMobileActivityMenuId(null);
        setDraggingId(id);
        setDropTarget(null);
        setTouchDragVisual({
          sourceId: id,
          clientX: drag.startX,
          clientY: drag.startY,
          offsetX: drag.startX - bounds.left,
          offsetY: drag.startY - bounds.top,
          width: bounds.width,
          height: bounds.height,
        });
      }, 320),
    };
    const handleWindowPointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) handleActivityPointerMove(pointerEvent);
    };
    const handleWindowPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) handleActivityPointerUp(pointerEvent);
    };
    const handleWindowPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === pointerId) cancelTouchDrag(false);
    };
    drag.cleanup = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      try {
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already have ended or been cancelled.
      }
    };
    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", handleWindowPointerCancel, { passive: false });
    touchDragRef.current = drag;
  }

  function handleActivityPointerMove(event: PointerEvent) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 9) cancelTouchDrag(false);
      return;
    }
    event.preventDefault();
    setTouchDragVisual((current) => current?.sourceId === drag.sourceId ? { ...current, clientX: event.clientX, clientY: event.clientY } : current);
    const target = touchDropTarget(event.clientX, event.clientY, drag.sourceId);
    setDropTarget((current) => current?.id === target?.id && current?.position === target?.position ? current : target);
    const edge = 72;
    if (event.clientY < edge) window.scrollBy({ top: -10, behavior: "auto" });
    else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 10, behavior: "auto" });
  }

  function handleActivityPointerUp(event: PointerEvent) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) event.preventDefault();
    cancelTouchDrag(true, event.clientX, event.clientY);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggingId || draggingId === targetId || dragGroupForItem(draggingId) !== dragGroupForItem(targetId)) {
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
        body: JSON.stringify({ activityId: item.activityId ?? item.id, date: todayDateKey }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "This activity could not be reset.");
      resetActivityTimingState([item.occurrenceId ?? item.id]);
      setCompletedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setItems((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, completedAt: null, skippedAt: null }
        : candidate));
      const stillCompleted = items.some((candidate) => candidate.id !== item.id && Boolean(candidate.completedAt));
      setDayHighlight((current) => ({ status: stillCompleted ? "queued" : "quiet", body: null, kind: null, revision: current.revision + 1 }));
      setActivityResetVersions((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
      setMobileActivityMenuId(null);
      setMobileResetActivity(null);
    } catch {
      setMobileResetActivity({ id: item.id, state: "error" });
    }
  }

  function canAnimateMobileActivity() {
    return window.matchMedia("(max-width: 680px)").matches
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearMobileActivityTransitionTimer() {
    if (!mobileActivityTransitionTimer.current) return;
    clearTimeout(mobileActivityTransitionTimer.current);
    mobileActivityTransitionTimer.current = undefined;
  }

  function openActivity(id: string, origin?: DOMRect) {
    setMobileActivityMenuId(null);
    setStartConversationActivityId(null);
    clearMobileActivityTransitionTimer();

    if (origin && canAnimateMobileActivity()) {
      mobileActivitySlotRectsRef.current = Array.from(document.querySelectorAll<HTMLElement>(".routine-row[data-activity-id] > .routine-card:not(.is-expanded)")).map((card) => {
        const bounds = card.getBoundingClientRect();
        return {
          id: card.closest<HTMLElement>(".routine-row[data-activity-id]")?.dataset.activityId ?? "",
          phase: "closing",
          top: bounds.top,
          left: bounds.left,
          right: Math.max(0, window.innerWidth - bounds.right),
          height: bounds.height,
        };
      });
      const geometry: MobileActivityTransition = {
        id,
        phase: "opening",
        top: Math.max(0, origin.top),
        left: Math.max(0, origin.left),
        right: Math.max(0, window.innerWidth - origin.right),
        height: Math.max(1, origin.height),
      };
      mobileActivityOriginRef.current = geometry;
      setMobileActivityTransition(geometry);
      mobileActivityTransitionTimer.current = setTimeout(() => {
        setMobileActivityTransition((current) => current?.id === id ? null : current);
        mobileActivityTransitionTimer.current = undefined;
      }, 340);
    } else {
      mobileActivityOriginRef.current = null;
      mobileActivitySlotRectsRef.current = [];
      setMobileActivityTransition(null);
    }

    setSelectedActivityId(id);
    setDismissedClockActivityId(null);
  }

  function collapseActivity() {
    setMobileActivityMenuId(null);
    setReceiptPreviewActivityId(null);
    clearMobileActivityTransitionTimer();

    const origin = mobileActivityOriginRef.current;
    if (selectedActivityId && origin?.id === selectedActivityId && canAnimateMobileActivity()) {
      const id = selectedActivityId;
      setMobileActivityTransition({ ...origin, phase: "closing" });
      mobileActivityTransitionTimer.current = setTimeout(() => {
        setSelectedActivityId((current) => current === id ? null : current);
        setMobileActivityTransition(null);
        mobileActivityOriginRef.current = null;
        mobileActivitySlotRectsRef.current = [];
        mobileActivityTransitionTimer.current = undefined;
      }, 280);
    } else {
      setSelectedActivityId(null);
      setMobileActivityTransition(null);
      mobileActivityOriginRef.current = null;
      mobileActivitySlotRectsRef.current = [];
    }
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
    if (clockCurrentItem) setDismissedClockActivityId(clockCurrentItem.id);
  }

  function celebrateCompletion(id: string) {
    if (completionCelebrationTimer.current) clearTimeout(completionCelebrationTimer.current);
    setCelebratingActivityId(id);
    completionCelebrationTimer.current = setTimeout(() => {
      setCelebratingActivityId((current) => current === id ? null : current);
    }, 1_150);
  }

  function captureActivityListPositions() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    activityReorderAnimations.current.forEach((animation) => animation.cancel());
    activityReorderAnimations.current = [];
    activityListPositionSnapshot.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>(".routine-row[data-activity-id]")).flatMap((row) => {
        const id = row.dataset.activityId;
        if (!id) return [];
        const bounds = row.getBoundingClientRect();
        return [[id, { left: bounds.left, top: bounds.top }] as const];
      }),
    );
  }

  function removeSettlingCompletion(id: string) {
    setSettlingCompletedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function scheduleCompletedActivityPlacement(id: string) {
    const existingTimer = completionPlacementTimers.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    setSettlingCompletedIds((current) => new Set(current).add(id));
    const timer = setTimeout(() => {
      captureActivityListPositions();
      removeSettlingCompletion(id);
      completionPlacementTimers.current.delete(id);
    }, 560);
    completionPlacementTimers.current.set(id, timer);
  }

  function nextIncompleteActivityId(excludedId: string) {
    return scheduledItems
      .find((item) => item.id !== excludedId && !item.completedAt && !item.skippedAt && !completedIds.has(item.id))
      ?.id ?? null;
  }

  function cueNextActivity(id: string) {
    if (nextActivityCueTimer.current) clearTimeout(nextActivityCueTimer.current);
    setNextActivityCueId(id);

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>(".routine-row[data-activity-id]"))
        .find((candidate) => candidate.dataset.activityId === id);
      if (!row) return;

      const bounds = row.getBoundingClientRect();
      const targetTop = Math.max(72, window.innerHeight * 0.22);
      const isComfortablyVisible = bounds.top >= targetTop - 24 && bounds.bottom <= window.innerHeight - 72;
      if (!isComfortablyVisible) {
        window.scrollBy({
          top: bounds.top - targetTop,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }
    }));

    nextActivityCueTimer.current = setTimeout(() => {
      setNextActivityCueId((current) => current === id ? null : current);
    }, 1_600);
  }

  function collapseCompletedActivity(id: string, nextId: string | null) {
    clearMobileActivityTransitionTimer();
    const origin = mobileActivityOriginRef.current;

    if (origin?.id === id && canAnimateMobileActivity()) {
      setMobileActivityTransition({ ...origin, id, phase: "closing" });
      mobileActivityTransitionTimer.current = setTimeout(() => {
        captureActivityListPositions();
        setSelectedActivityId((current) => current === id ? null : current);
        removeSettlingCompletion(id);
        setMobileActivityTransition(null);
        mobileActivityOriginRef.current = null;
        mobileActivitySlotRectsRef.current = [];
        mobileActivityTransitionTimer.current = undefined;
        if (nextId) cueNextActivity(nextId);
      }, 280);
      return;
    }

    captureActivityListPositions();
    setSelectedActivityId((current) => current === id ? null : current);
    removeSettlingCompletion(id);
    setMobileActivityTransition(null);
    mobileActivityOriginRef.current = null;
    mobileActivitySlotRectsRef.current = [];
    if (nextId) cueNextActivity(nextId);
  }

  function handleCompletionSaved(id: string, completedAt: string | null, collapseAfterCelebration: boolean) {
    if (!completedAt) {
      const placementTimer = completionPlacementTimers.current.get(id);
      if (placementTimer) {
        clearTimeout(placementTimer);
        completionPlacementTimers.current.delete(id);
      } else {
        captureActivityListPositions();
      }
      removeSettlingCompletion(id);
      toggleComplete(id, null);
      const stillCompleted = items.some((item) => item.id !== id && Boolean(item.completedAt));
      setDayHighlight((current) => ({ status: stillCompleted ? "queued" : "quiet", body: null, kind: null, revision: current.revision + 1 }));
      return;
    }

    const nextId = nextIncompleteActivityId(id);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimatePlacement = !collapseAfterCelebration && !prefersReducedMotion;
    if (collapseAfterCelebration) setSelectedActivityId(id);
    if (collapseAfterCelebration) setSettlingCompletedIds((current) => new Set(current).add(id));
    else if (shouldAnimatePlacement) scheduleCompletedActivityPlacement(id);
    else {
      setSettlingCompletedIds((current) => new Set(current).add(id));
      const timer = setTimeout(() => {
        captureActivityListPositions();
        removeSettlingCompletion(id);
        completionPlacementTimers.current.delete(id);
      }, 360);
      completionPlacementTimers.current.set(id, timer);
    }
    toggleComplete(id, completedAt);
    setDayHighlight((current) => ({ status: "queued", body: null, kind: null, revision: current.revision + 1 }));
    celebrateCompletion(id);

    if (completionHandoffTimer.current) clearTimeout(completionHandoffTimer.current);
    const handoffDelay = prefersReducedMotion
      ? collapseAfterCelebration ? 420 : 240
      : collapseAfterCelebration ? 780 : shouldAnimatePlacement ? 1_080 : 760;
    completionHandoffTimer.current = setTimeout(() => {
      if (collapseAfterCelebration) {
        collapseCompletedActivity(id, nextId);
        return;
      }
      if (nextId) cueNextActivity(nextId);
    }, handoffDelay);
  }

  function applySkipState(id: string, skippedAt: string | null) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (skippedAt) next.delete(id);
      return next;
    });
    setItems((current) => current.map((item) => item.id === id ? { ...item, skippedAt, completedAt: skippedAt ? null : item.completedAt } : item));
    if (clockCurrentItem) setDismissedClockActivityId(clockCurrentItem.id);
  }

  function clearSkipMotion(id?: string) {
    if (skipMotionTimer.current) clearTimeout(skipMotionTimer.current);
    skipMotionTimer.current = undefined;
    setSkippingActivityId((current) => !id || current === id ? null : current);
    if (!id || skipMotionStartedActivityRef.current === id) skipMotionStartedActivityRef.current = null;
    if (!id || skipMotionVisibleActivityRef.current === id) skipMotionVisibleActivityRef.current = null;
  }

  function beginSkipMotion(id: string) {
    if (skipMotionTimer.current) clearTimeout(skipMotionTimer.current);
    skipMotionStartedActivityRef.current = id;
    skipMotionVisibleActivityRef.current = id;
    setSkippingActivityId(id);
    skipMotionTimer.current = setTimeout(() => {
      setSkippingActivityId((current) => current === id ? null : current);
      if (skipMotionVisibleActivityRef.current === id) skipMotionVisibleActivityRef.current = null;
      skipMotionTimer.current = undefined;
    }, 520);
  }

  function collapseSkippedActivity(id: string, nextId: string | null) {
    setMobileActivityMenuId(null);
    clearMobileActivityTransitionTimer();
    const origin = mobileActivityOriginRef.current;

    if (origin?.id === id && canAnimateMobileActivity()) {
      setMobileActivityTransition({ ...origin, phase: "closing" });
      mobileActivityTransitionTimer.current = setTimeout(() => {
        setSelectedActivityId((current) => current === id ? null : current);
        setMobileActivityTransition(null);
        mobileActivityOriginRef.current = null;
        mobileActivitySlotRectsRef.current = [];
        mobileActivityTransitionTimer.current = undefined;
        if (nextId) cueNextActivity(nextId);
      }, 280);
      return;
    }

    setSelectedActivityId((current) => current === id ? null : current);
    setMobileActivityTransition(null);
    mobileActivityOriginRef.current = null;
    mobileActivitySlotRectsRef.current = [];
    if (nextId) cueNextActivity(nextId);
  }

  function handleSkipSaved(id: string, skippedAt: string | null, collapseAfterMotion: boolean) {
    if (!skippedAt) {
      clearSkipMotion(id);
      applySkipState(id, null);
      const hasCompleted = items.some((item) => Boolean(item.completedAt));
      setDayHighlight((current) => ({ status: hasCompleted ? "queued" : "quiet", body: null, kind: null, revision: current.revision + 1 }));
      return;
    }

    const nextId = nextIncompleteActivityId(id);
    applySkipState(id, skippedAt);
    const hasOtherCompletion = items.some((item) => item.id !== id && Boolean(item.completedAt));
    setDayHighlight((current) => ({ status: hasOtherCompletion ? "queued" : "quiet", body: null, kind: null, revision: current.revision + 1 }));
    if (skipMotionStartedActivityRef.current !== id) beginSkipMotion(id);
    if (!collapseAfterMotion) return;

    if (skipHandoffTimer.current) clearTimeout(skipHandoffTimer.current);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handoffDelay = prefersReducedMotion ? 160 : skipMotionVisibleActivityRef.current === id ? 300 : 120;
    skipHandoffTimer.current = setTimeout(() => {
      clearSkipMotion(id);
      collapseSkippedActivity(id, nextId);
      skipHandoffTimer.current = undefined;
    }, handoffDelay);
  }

  async function updateActivityStatus(item: ScheduledItem, mode: "complete" | "reopen" | "skip" | "unskip") {
    if (pendingActivityIds.has(item.id)) return;
    setPendingActivityIds((current) => new Set(current).add(item.id));
    if (mode === "skip") beginSkipMotion(item.id);
    try {
      const response = await fetch("/api/activity/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, activityId: item.activityId ?? item.id, occurrenceId: item.occurrenceId ?? item.id, date: todayDateKey, timing: null }),
      });
      if (!response.ok) throw new Error("Activity status could not be saved.");
      if (mode === "complete" || mode === "reopen") {
        const result = await response.json() as { completed: boolean; completedAt?: string };
        handleCompletionSaved(item.id, result.completed ? result.completedAt ?? new Date().toISOString() : null, false);
      } else {
        const result = await response.json() as { skipped: boolean; skippedAt?: string | null };
        handleSkipSaved(item.id, result.skipped ? result.skippedAt ?? new Date().toISOString() : null, false);
      }
      setSaveState("saved");
    } catch {
      if (mode === "skip") clearSkipMotion(item.id);
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
          <div className={`save-state save-state-${saveState}`}><span /> {{ loading: "Loading your day", saving: "Saving", saved: "Saved to your day", retrying: "Offline · retrying", error: "Change not saved" }[saveState]}</div>
          <button
            aria-expanded={isGlobalLunaOpen}
            aria-haspopup="dialog"
            aria-label={lunaSummary.unreadCount || lunaSummary.pendingDecisionCount ? "Talk with Luna, update available" : "Talk with Luna"}
            className="luna-shell-trigger"
            type="button"
            onClick={() => { setIsDevMenuOpen(false); setIsSettingsOpen(false); setIsGlobalLunaOpen(true); }}
          ><Sparkles aria-hidden="true" size={17} /><span>Luna</span>{lunaSummary.unreadCount || lunaSummary.pendingDecisionCount ? <i className="luna-shell-notification" aria-hidden="true" /> : null}</button>
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
          ><Settings aria-hidden="true" size={17} /></button>
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
              <Clock3 aria-hidden="true" size={14} />
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

      {isScheduleManagerOpen ? <ScheduleManager
        initialActivityId={scheduleManagerActivityId}
        open
        onAskLuna={(draft) => { setIsScheduleManagerOpen(false); setScheduleManagerActivityId(null); setGlobalLunaDraft(draft); setIsGlobalLunaOpen(true); }}
        onClose={() => { setIsScheduleManagerOpen(false); setScheduleManagerActivityId(null); }}
        onSaved={() => void reloadToday()}
      /> : null}
      <GlobalLuna
        initialDraft={globalLunaDraft}
        open={isGlobalLunaOpen}
        onClose={() => setIsGlobalLunaOpen(false)}
        onOpenActivity={async (target, origin) => {
          let currentItems = items;
          let item = currentItems.find((candidate) => (
            candidate.activityId === target.activityClientKey
            || candidate.activityId === target.activityId
            || candidate.id === target.activityId
          ));
          if (!item) {
            currentItems = await reloadToday() ?? currentItems;
            item = currentItems.find((candidate) => (
              candidate.activityId === target.activityClientKey
              || candidate.activityId === target.activityId
              || candidate.id === target.activityId
            ));
          }
          if (!item) return false;
          const isUnselectedExtra = normalizePlanRole(item.planRole) === "extra"
            && !item.activatedAt && !item.completedAt && !item.skippedAt;
          setReceiptPreviewActivityId(isUnselectedExtra ? item.id : null);
          openActivity(item.id, origin);
          return true;
        }}
        onDraftConsumed={() => setGlobalLunaDraft("")}
        onRead={() => setLunaSummary((current) => ({ ...current, unreadCount: 0 }))}
        onScheduleChanged={() => { void reloadToday(); }}
      />
      <OccurrenceEditor
        item={occurrenceEditorItem}
        onClose={() => setOccurrenceEditorItem(null)}
        onFuture={() => {
          const activityId = occurrenceEditorItem?.activityId ?? null;
          setOccurrenceEditorItem(null);
          setScheduleManagerActivityId(activityId);
          setIsScheduleManagerOpen(true);
        }}
        onSaved={() => { void reloadToday(); }}
      />
      {removeTodayItem ? (
        <div className="settings-modal-backdrop remove-today-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isRemovingToday) setRemoveTodayItem(null); }}>
          <section aria-labelledby="remove-today-title" aria-modal="true" className="settings-modal remove-today-dialog" role="dialog">
            <header className="settings-modal-header"><div><span>Today only</span><h2 id="remove-today-title">Remove {activityDisplayTitle(removeTodayItem)}?</h2></div><button aria-label="Close" disabled={isRemovingToday} type="button" onClick={() => setRemoveTodayItem(null)}><X aria-hidden="true" size={18} /></button></header>
            <p>This removes the activity from today only. Your routine will not change.</p>
            {removeTodayError ? <p className="settings-save-error" role="alert">{removeTodayError}</p> : null}
            <div className="schedule-editor-actions"><button disabled={isRemovingToday} type="button" onClick={() => setRemoveTodayItem(null)}>Cancel</button><button className="remove-today-confirm" disabled={isRemovingToday} type="button" onClick={() => void confirmRemoveItem()}>{isRemovingToday ? "Removing…" : "Remove from today"}</button></div>
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
              <div><span>Completed</span><strong>{hasLoaded ? `${selectedCompletedItemCount} of ${selectedItemCount}` : "—"}</strong></div>
              <div><span>Remaining</span><strong>{hasLoaded ? Math.max(0, selectedItemCount - selectedCompletedItemCount) : "—"}</strong></div>
            </>}
          </div>
        </section>

        <div className="main-grid">
          <section className="planner" aria-labelledby="schedule-title">
            <header className="planner-header">
              <div className="planner-heading-copy">
                <h2 id="schedule-title">
                  <span className="desktop-schedule-title">{timelineEnabled ? "Schedule" : "Today"}</span>
                  <MobileDateHeading date={dateFromKey(viewDate)} />
                </h2>
                <p>
                  <span className="desktop-schedule-summary">{isReviewingPastDay ? `Reviewing ${reviewDayLabel(viewDate, todayDateKey)}` : hasLoaded ? essentialsComplete ? `Essentials complete${unfinishedChosenExtras.length ? ` · ${unfinishedChosenExtras.length} chosen` : ""} · ${availableExtras.length} more` : timelineEnabled ? `${activeItemCount} essentials · ${formatDuration(totalMinutes)} planned` : `${activeItemCount} essentials · ${availableExtras.length} ways to go further` : "Loading your saved day…"}</span>
                </p>
                <nav className="mobile-day-nav" aria-label="Browse past days">
                  <button aria-label="View previous day" type="button" onClick={() => showDay(shiftDateKey(viewDate, -1))}><ChevronLeft aria-hidden="true" size={16} /><span>{isReviewingPastDay ? "Earlier" : "Yesterday"}</span></button>
                  {isReviewingPastDay && viewDate < shiftDateKey(todayDateKey, -1) ? <button aria-label="View next day" type="button" onClick={() => showDay(shiftDateKey(viewDate, 1))}><span>Later</span><ChevronRight aria-hidden="true" size={16} /></button> : null}
                  {isReviewingPastDay ? <button className="mobile-day-nav-today" type="button" onClick={() => showDay(todayDateKey)}>Today</button> : null}
                </nav>
              </div>
              {!isReviewingPastDay ? <div className="planner-actions">
                <div className="planner-menu" ref={menuRef}>
                  <button
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                    aria-label="More routine options"
                    className="planner-menu-trigger"
                    disabled={!hasLoaded}
                    type="button"
                    onClick={() => setIsMenuOpen((current) => !current)}
                  ><MoreVertical aria-hidden="true" size={16} /></button>
                  {isMenuOpen ? (
                    <div className="planner-menu-popover" role="menu">
                      <button className="planner-menu-item" role="menuitem" type="button" onClick={() => { setIsMenuOpen(false); setScheduleManagerActivityId(null); setIsScheduleManagerOpen(true); }}>
                        <CalendarDays aria-hidden="true" size={15} />
                        <span>Manage routine</span>
                      </button>
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
                ><span aria-hidden="true">+</span> Add</button>
              </div> : null}
            </header>

            {!isReviewingPastDay && isAdding ? (
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
                <div className="add-field">
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
                </div>
                <div className="add-field">
                  <label htmlFor="block-category">Category</label>
                  <CategoryPicker
                    id="block-category"
                    ariaLabel="Category"
                    onChange={setDraftCategory}
                    value={draftCategory}
                  />
                </div>
                <div className="add-field">
                  <label htmlFor="block-role">Daily role</label>
                  <select id="block-role" value={draftPlanRole} onChange={(event) => setDraftPlanRole(event.target.value === "extra" ? "extra" : "essential")}>
                    <option value="essential">Essential</option>
                    <option value="extra">Go Further</option>
                  </select>
                </div>
                <div className="add-field add-schedule-field">
                  <label htmlFor="block-schedule">Schedule</label>
                  <select id="block-schedule" value={draftScheduleKind} onChange={(event) => setDraftScheduleKind(event.target.value as typeof draftScheduleKind)}>
                    <option value="none">No recurring schedule</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Selected weekdays</option>
                    <option value="interval_days">Every N days</option>
                    <option value="sequence">Create a sequence</option>
                    <option value="luna">Describe it to Luna</option>
                  </select>
                </div>
                {draftScheduleKind === "weekdays" ? <fieldset className="add-weekday-picker"><legend>Days</legend>{["S", "M", "T", "W", "T", "F", "S"].map((label, day) => <label key={`${label}-${day}`}><input checked={draftWeekdays.includes(day)} type="checkbox" onChange={() => setDraftWeekdays((current) => current.includes(day) ? current.length > 1 ? current.filter((value) => value !== day) : current : [...current, day].sort())} /><span>{label}</span></label>)}</fieldset> : null}
                {draftScheduleKind === "interval_days" ? <div className="add-field"><label htmlFor="block-interval">Every</label><span className="add-interval-field"><input id="block-interval" max="365" min="1" type="number" value={draftIntervalDays} onChange={(event) => setDraftIntervalDays(Math.max(1, event.target.valueAsNumber || 1))} /> days</span></div> : null}
                {draftScheduleKind === "luna" ? <div className="add-field add-luna-request"><label htmlFor="block-luna-request">What should Luna help arrange?</label><textarea id="block-luna-request" maxLength={1000} placeholder="For example: alternate this with Cardio on weekdays" value={draftLunaRequest} onChange={(event) => setDraftLunaRequest(event.target.value)} /></div> : null}
                <details className="add-setup-details" open={Boolean(draftSetupRequest)}>
                  <summary>Set this up with Luna</summary>
                  <div className="add-field add-luna-request"><label htmlFor="block-setup-request">Product link or details</label><textarea id="block-setup-request" maxLength={4000} placeholder="Paste a product link, describe what you want this to help with, or leave it for later." value={draftSetupRequest} onChange={(event) => setDraftSetupRequest(event.target.value)} /></div>
                </details>
                <label className="add-include-today"><input checked={draftIncludeToday} type="checkbox" onChange={(event) => setDraftIncludeToday(event.target.checked)} /><span>Include today</span></label>
                <div className="add-form-actions">
                  <button className="cancel-add-button" type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                  <button className="confirm-add-button" disabled={!draftTitle.trim()} type="submit">{draftSetupRequest.trim() || draftScheduleKind === "luna" ? "Add & Set Up" : "Add"}</button>
                </div>
              </form>
            ) : null}

            {!isReviewingPastDay ? <div className="planner-help">Drag an activity to reorder {timelineEnabled ? <><span className="help-divider" aria-hidden="true">·</span> Adjust minutes on any block</> : null}</div> : null}

            {!isReviewingPastDay && dayMode.showStartGate && hasLoaded && !isDayStarted ? (
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

            {isReviewingPastDay ? <PastDayReview
              items={pastDayItems}
              onToggle={(item) => void togglePastDayCompletion(item)}
              pendingIds={pastDayPendingIds}
              state={pastDayState}
            /> : <div className="schedule" aria-label="Idealized day schedule">
              {hasLoaded ? <>
              {settledCompletedItems.length ? <DayHighlights
                celebratingActivityId={celebratingActivityId}
                completedItems={settledCompletedItems}
                highlight={dayHighlight}
                totalSelectedActivities={selectedItemCount}
                onOpenActivity={(item, bounds) => openActivity(item.id, bounds)}
              /> : null}
              {dayAchievementReady ? <DayVictory isArriving={isDayBloom} skippedEssentials={skippedEssentialCount} /> : null}
              {firstVisibleEssentialId ? <div className="daily-list-heading"><span>Essentials</span></div> : null}
              {recentlyActivatedExtra ? <div className="extra-undo-notice" role="status"><span><strong>{recentlyActivatedExtra.title}</strong> added to Going further.</span><button type="button" onClick={() => { const item = items.find((candidate) => candidate.id === recentlyActivatedExtra.id); if (item) void deactivateExtra(item); }}>Undo</button></div> : null}
              {displayedScheduledItems.map((item, displayIndex) => {
                const start = completedBeforeLaunchIds.has(item.id) ? timestampTimeParts(item.completedAt) ?? timeParts(item.start) : timeParts(item.start);
                const isDragging = draggingId === item.id;
                const isTouchDragging = touchDragVisual?.sourceId === item.id;
                const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
                const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";
                const isEditing = editingId === item.id;
                const isExpanded = expandedActivityId === item.id;
                const isComplete = completedIds.has(item.id);
                const isSkipped = Boolean(item.skippedAt);
                const isPending = pendingActivityIds.has(item.id);
                const activityState = isSkipped ? "skipped" : isComplete ? "complete" : !timelineEnabled || !isDayStarted ? "planned" : item.end <= displayedMinutes ? "past" : item.start > displayedMinutes ? "upcoming" : "current";
                const transitionGeometry = mobileActivityTransition?.id === item.id ? mobileActivityTransition : null;
                const itemStyle = {
                  "--item-color": CATEGORY_META[item.category].color,
                  ...(isTouchDragging ? {
                    "--touch-drag-left": `${touchDragVisual.clientX - touchDragVisual.offsetX}px`,
                    "--touch-drag-top": `${touchDragVisual.clientY - touchDragVisual.offsetY}px`,
                    "--touch-drag-width": `${touchDragVisual.width}px`,
                    "--touch-drag-height": `${touchDragVisual.height}px`,
                  } : {}),
                  ...(transitionGeometry ? {
                    "--activity-origin-top": `${transitionGeometry.top}px`,
                    "--activity-origin-left": `${transitionGeometry.left}px`,
                    "--activity-origin-right": `${transitionGeometry.right}px`,
                    "--activity-origin-height": `${transitionGeometry.height}px`,
                  } : {}),
                } as CSSProperties;
                const ActivityIcon = activityIconFor(item);
                const ItemIcon = isSkipped ? SkipForward : isComplete ? Check : ActivityIcon;
                const itemIconState = isSkipped ? "is-skipped" : isComplete ? "is-complete" : "";

                return (
                  <Fragment key={item.id}>
                    {firstVisibleChosenExtraId === item.id ? <h3 className="going-further-heading">Going further</h3> : null}
                    {firstVisibleKeepGoingId === item.id ? <h3 className="keep-going-heading">Keep it going</h3> : null}
                    {dayMode.showClockState && nowLineIndex === displayIndex ? (
                      <div className="now-line" aria-label={`Current time ${formatTime(displayedMinutes)}`}>
                        <span>{formatTime(displayedMinutes)}</span><i /><strong>{fakeMinutes !== null ? "Preview now" : "Now"}</strong>
                      </div>
                    ) : null}
                    {isDropBefore && touchDragVisual ? <div className="touch-drop-slot" aria-hidden="true" style={{ "--touch-drag-height": `${touchDragVisual.height}px` } as CSSProperties}><span>Drop here</span></div> : null}
                    <div
                      data-activity-id={item.id}
                      data-drag-group={dragGroupForItem(item.id)}
                      className={`routine-row is-${activityState} ${isDragging ? "is-dragging" : ""} ${isTouchDragging ? "is-touch-dragging" : ""} ${isTouchDragging && dropTarget ? "has-touch-drop-target" : ""} ${isDropBefore ? "drop-before" : ""} ${isDropAfter ? "drop-after" : ""} ${nextActivityCueId === item.id ? "is-next-cue" : ""}`}
                      onDragOver={(event) => handleDragOver(event, item.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(event) => handleDrop(event, item.id)}
                      style={itemStyle}
                    >
                    {(isDropBefore || isDropAfter) && !touchDragVisual ? <div className="drop-indicator" aria-hidden="true"><span>Move here</span></div> : null}
                    {isTouchDragging && !dropTarget ? <div className="touch-drag-origin-slot" aria-hidden="true" /> : null}

                    {dayMode.showClockState ? <div className="time-label">{isSkipped
                      ? <strong className="sequence-label">Skipped</strong>
                      : isDayStarted
                        ? <><strong>{start.time}</strong><span>{start.suffix}</span></>
                        : <strong className="sequence-label">Queued</strong>}</div> : null}

                    <article className={`routine-card ${isEditing ? "is-editing" : ""} ${isExpanded ? "is-expanded" : ""} ${transitionGeometry ? `is-mobile-${transitionGeometry.phase}` : ""} ${mobileActivityMenuId === item.id ? "has-open-mobile-menu" : ""} ${celebratingActivityId === item.id ? "is-celebrating" : ""} ${skippingActivityId === item.id ? "is-skipping" : ""}`}>
                      <span className="activity-card-surface activity-card-surface-front" aria-hidden="true" />
                      <span className="activity-card-surface activity-card-surface-back" aria-hidden="true" />
                      {celebratingActivityId === item.id ? <span className="completion-sweep" aria-hidden="true" /> : null}
                      {celebratingActivityId === item.id && isExpanded ? <span className="completion-full-view-wash" aria-hidden="true" /> : null}
                      {skippingActivityId === item.id ? <span className="skip-sweep" aria-hidden="true" /> : null}
                      <div className="activity-header-flip">
                        <div className="activity-header-flip-inner">
                          <div aria-hidden={isEditing} className="activity-header-face activity-header-front">
                            <button
                              aria-label={`${item.title}${isSkipped ? ", skipped today" : isComplete ? ", done" : ""}`}
                              aria-expanded={isExpanded}
                              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                              className="item-copy"
                              draggable={!isExpanded && !isEditing}
                              tabIndex={isEditing ? -1 : undefined}
                              type="button"
                              onContextMenu={(event) => { if (touchDragRef.current?.sourceId === item.id) event.preventDefault(); }}
                              onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                              onDragStart={(event) => handleDragStart(event, item.id)}
                              onKeyDown={(event) => handleDragKeyDown(event, item.id)}
                              onPointerDown={(event) => handleActivityPointerDown(event, item.id)}
                              onClick={(event) => {
                                if (suppressActivityClickRef.current || transitionGeometry) return;
                                if (isExpanded) collapseActivity();
                                else openActivity(item.id, event.currentTarget.closest<HTMLElement>(".routine-card")?.getBoundingClientRect());
                              }}
                            >
                              <div className="item-title">
                                <span className={`activity-title-icon ${itemIconState}`} aria-hidden="true"><ItemIcon size={18} weight={isComplete ? "bold" : "regular"} /></span>
                                <h3>{activityDisplayTitle(item)}</h3>
                              </div>
                              <div className="mobile-top-meta"><ActivityAgenda item={item} /></div>
                              <div className="item-state">{activityState === "current" ? <span className="now-chip">Now</span> : null}</div>
                              <div className="item-meta">
                                <ActivityAgenda item={item} />
                                <div className="mobile-item-state">{activityState === "current" ? <span className="now-chip">Now</span> : null}</div>
                              </div>
                            </button>

                            <div className="item-controls">
                              {isExpanded ? <button className="collapse-activity-button" tabIndex={isEditing ? -1 : undefined} type="button" aria-label={`Collapse ${item.title}`} onClick={collapseActivity}><ChevronUp className="desktop-collapse-icon" aria-hidden="true" size={16} /></button> : null}
                              <span className="front-duration-label"><span className="front-duration-value">{item.duration}</span><span className="front-duration-unit">minutes</span></span>
                              <button aria-label={`Edit ${item.title}`} className="activity-edit-trigger" tabIndex={isEditing ? -1 : undefined} type="button" onClick={() => startEditing(item)}><Pencil aria-hidden="true" size={15} /></button>
                              <ControlTooltip id={`complete-tooltip-${item.id}`} label={isComplete ? `${item.title} is complete` : `Mark ${item.title} complete`}>
                                <button
                                  aria-describedby={`complete-tooltip-${item.id}`}
                                  aria-label={isComplete ? `${item.title} completed` : `Mark ${item.title} complete`}
                                  className={`closed-status-button complete-status-button ${isComplete ? "is-active" : ""}`}
                                  disabled={isPending || isComplete}
                                  tabIndex={isEditing ? -1 : undefined}
                                  type="button"
                                  onClick={() => {
                                    if (isExpanded && expandedCompletionActionRef.current) {
                                      expandedCompletionActionRef.current();
                                      return;
                                    }
                                    void updateActivityStatus(item, isComplete ? "reopen" : "complete");
                                  }}
                                ><Check aria-hidden="true" size={14} weight="bold" /></button>
                              </ControlTooltip>
                            </div>
                          </div>

                          <form aria-hidden={!isEditing} className="activity-header-face activity-header-back inline-edit-form" onSubmit={saveEdit}>
                            <input
                              aria-label={`Title for ${item.title}`}
                              id={`activity-title-edit-${item.id}`}
                              maxLength={60}
                              disabled={isSavingEdit}
                              onChange={(event) => setEditTitle(event.target.value)}
                              onKeyDown={(event) => { if (event.key === "Escape") cancelEditing(); }}
                              tabIndex={isEditing ? undefined : -1}
                              value={isEditing ? editTitle : item.title}
                            />
                            <div className="activity-back-duration">
                              <DurationControl item={item} onAdjust={(delta) => adjustDuration(item.id, delta)} onSet={(value) => setDuration(item.id, value)} />
                            </div>
                            <button
                              aria-label={isSkipped ? `Restore ${item.title} to today` : `Skip ${item.title} for today`}
                              className={`activity-back-skip ${isSkipped ? "is-active" : ""}`}
                              disabled={isPending || isComplete || isSavingEdit}
                              tabIndex={isEditing ? undefined : -1}
                              type="button"
                              onClick={async () => {
                                if (editTitle.trim()) { if (!await commitEdit()) return; }
                                else cancelEditing();
                                void updateActivityStatus(item, isSkipped ? "unskip" : "skip");
                              }}
                            ><span>{isSkipped ? "Restore" : "Skip"}</span><SkipForward aria-hidden="true" size={15} /></button>

                            <button aria-label="Save and return" aria-busy={isSavingEdit} className="activity-edit-done" disabled={!editTitle.trim() || isSavingEdit} tabIndex={isEditing ? undefined : -1} type="submit"><ArrowLeft aria-hidden="true" size={17} /></button>

                            <div className={`mobile-activity-menu ${mobileActivityMenuId === item.id ? "is-open" : ""}`} data-activity-id={item.id}>
                              <button
                                aria-expanded={mobileActivityMenuId === item.id}
                                aria-haspopup={mobileResetActivity?.id === item.id ? "dialog" : "menu"}
                                aria-label={`More options for ${item.title}`}
                                className="mobile-activity-menu-trigger"
                                disabled={isSavingEdit}
                                tabIndex={isEditing ? undefined : -1}
                                type="button"
                                onClick={() => {
                                  setMobileResetActivity(null);
                                  setMobileActivityMenuId((current) => current === item.id ? null : item.id);
                                }}
                              ><MoreVertical aria-hidden="true" size={18} /></button>
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
                                    <button role="menuitem" type="button" onClick={() => { setMobileActivityMenuId(null); document.getElementById(`activity-title-edit-${item.id}`)?.focus(); }}><Pencil aria-hidden="true" size={15} /> Edit activity</button>
                                    <button role="menuitem" type="button" onClick={async () => { if (editTitle.trim() && !await commitEdit()) return; setOccurrenceEditorItem(item); }}><CalendarDays aria-hidden="true" size={15} /> Change today</button>
                                    <button role="menuitem" type="button" onClick={async () => { if (editTitle.trim() && !await commitEdit()) return; void setActivityRole(item, normalizePlanRole(item.planRole) === "essential" ? "extra" : "essential"); }}><Sparkles aria-hidden="true" size={15} /> {normalizePlanRole(item.planRole) === "essential" ? "Move to Go Further" : "Make essential"}</button>
                                    {isComplete ? <button disabled={isPending} role="menuitem" type="button" onClick={async () => { if (editTitle.trim() && !await commitEdit()) return; void updateActivityStatus(item, "reopen"); }}><RotateCcw aria-hidden="true" size={15} /> Mark incomplete</button> : null}
                                    <button className="activity-reset-menu-action" role="menuitem" type="button" onClick={() => setMobileResetActivity({ id: item.id, state: "confirming" })}><RotateCcw aria-hidden="true" size={15} /> Dev reset activity</button>
                                    <button className="mobile-remove-action" role="menuitem" type="button" onClick={async () => { if (editTitle.trim() && !await commitEdit()) return; requestRemoveItem(item); }}>{normalizePlanRole(item.planRole) === "extra" && item.activatedAt && !item.completedAt && !item.skippedAt ? <RotateCcw aria-hidden="true" size={15} /> : <Trash2 aria-hidden="true" size={15} />} {normalizePlanRole(item.planRole) === "extra" && item.activatedAt && !item.completedAt && !item.skippedAt ? "Return to More for today" : "Remove from today"}</button>
                                  </>}
                                </div>
                              ) : null}
                            </div>
                          </form>
                        </div>
                      </div>

                      {isEditing && editError ? <p className="activity-edit-error" role="alert">{editError}</p> : null}
                      {isExpanded ? (
                        <ActivityWorkbench
                          key={`${item.id}:${activityResetVersions[item.id] ?? 0}`}
                          completionActionRef={expandedCompletionActionRef}
                          isComplete={isComplete}
                          isSkipped={isSkipped}
                          item={item}
                          timelineEnabled={timelineEnabled}
                          openConversationOnMount={startConversationActivityId === item.id}
                          onAdjustDuration={(delta) => adjustDuration(item.id, delta)}
                          onComplete={(completedAt) => handleCompletionSaved(item.id, completedAt, true)}
                          onSkip={(skippedAt) => handleSkipSaved(item.id, skippedAt, true)}
                          onSkipStart={() => beginSkipMotion(item.id)}
                          onEdit={() => startEditing(item)}
                          onRemove={() => requestRemoveItem(item)}
                          onSetDuration={(value) => setDuration(item.id, value)}
                          onChangeToday={() => setOccurrenceEditorItem(item)}
                          onManageSchedule={() => { setScheduleManagerActivityId(item.activityId ?? item.id); setIsScheduleManagerOpen(true); }}
                          onSetRole={(role) => void setActivityRole(item, role)}
                          onOpenActivityTarget={(target, origin) => {
                            const destination = items.find((candidate) => candidate.activityId === target.activityClientKey || candidate.activityId === target.activityId || candidate.id === target.activityId);
                            if (destination) openActivity(destination.id, origin);
                          }}
                        />
                      ) : null}

                    </article>
                    </div>
                    {isDropAfter && touchDragVisual ? <div className="touch-drop-slot" aria-hidden="true" style={{ "--touch-drag-height": `${touchDragVisual.height}px` } as CSSProperties}><span>Drop here</span></div> : null}
                  </Fragment>
                );
              })}

              {goFurtherExtras.length ? (
                <section className={`go-further ${settledEssentialsComplete ? "is-after-essentials" : ""} ${isDayBloom ? "is-day-bloom-handoff" : ""}`} aria-labelledby="go-further-title">
                  <header>
                    <div><h3 id="go-further-title">More for today</h3></div>
                    <small>Still going strong? Here are some stretch goals.</small>
                  </header>
                  {extraPromotionError ? <p className="go-further-error" role="alert">{extraPromotionError}</p> : null}
                  {visibleAttentionExtras.length ? <div className="go-further-group is-attention">
                    <div className="go-further-group-heading">
                      <div><span>Needs attention</span><small>You asked Luna to keep these close.</small></div>
                    </div>
                    <div className="go-further-list">
                      {visibleAttentionExtras.map((item) => {
                        const ExtraIcon = activityIconFor(item);
                        const captures = item.activityId ? attentionByActivity.get(item.activityId) ?? [] : [];
                        const labels = captures.slice(0, 2).map((capture) => capture.label).join(", ");
                        return <div
                          className="go-further-option is-attention"
                          data-extra-id={item.id}
                          key={item.id}
                          style={{ "--item-color": CATEGORY_META[item.category].color } as CSSProperties}
                        >
                          <span className="go-further-icon" aria-hidden="true"><ExtraIcon size={17} /></span>
                          <span className="go-further-copy"><strong>{activityDisplayTitle(item)}</strong><small>{labels}{captures.length > 2 ? ` +${captures.length - 2}` : ""}</small></span>
                          <button aria-label={`Add ${activityDisplayTitle(item)} to today`} className="go-further-add" disabled={extraTransitionLocked || promotingExtraId === item.id} type="button" onClick={(event) => void promoteExtra(item, event.currentTarget.closest<HTMLElement>(".go-further-option")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect())}>{promotingExtraId === item.id ? <Sparkles aria-hidden="true" size={16} /> : <><Plus aria-hidden="true" size={16} /><span>Add</span></>}</button>
                        </div>;
                      })}
                    </div>
                  </div> : null}
                  {visibleOtherExtras.length ? <div className={`go-further-group ${visibleAttentionExtras.length ? "has-continuations" : ""}`}>
                    {visibleAttentionExtras.length ? <div className="go-further-group-heading"><div><span>More to choose from</span></div></div> : null}
                    <div className="go-further-list">
                      {visibleOtherExtras.map((item) => {
                        const ExtraIcon = activityIconFor(item);
                        return <div
                          className="go-further-option"
                          data-extra-id={item.id}
                          key={item.id}
                          style={{ "--item-color": CATEGORY_META[item.category].color } as CSSProperties}
                        >
                          <span className="go-further-icon" aria-hidden="true"><ExtraIcon size={17} /></span>
                          <span className="go-further-copy"><strong>{activityDisplayTitle(item)}</strong><small>{formatDuration(item.duration)} · {item.category}</small></span>
                          <button aria-label={`Add ${activityDisplayTitle(item)} to today`} className="go-further-add" disabled={extraTransitionLocked || promotingExtraId === item.id} type="button" onClick={(event) => void promoteExtra(item, event.currentTarget.closest<HTMLElement>(".go-further-option")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect())}>{promotingExtraId === item.id ? <Sparkles aria-hidden="true" size={16} /> : <><Plus aria-hidden="true" size={16} /><span>Add</span></>}</button>
                        </div>;
                      })}
                    </div>
                  </div> : null}
                  {goFurtherExtras.length > GO_FURTHER_PREVIEW_LIMIT ? <button className="go-further-toggle" type="button" onClick={() => setShowAllExtras((current) => !current)}>{showAllExtras ? "Show less" : `See all ${goFurtherExtras.length}`}</button> : null}
                </section>
              ) : null}

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
            </div>}
          </section>

          <aside className="summary-rail" aria-label="Plan summary">
            <section className="summary-card shape-card">
              <div className="summary-title"><div><p className="eyebrow">{timelineEnabled ? "Day shape" : "Today’s mix"}</p><h2>{hasLoaded ? timelineEnabled ? `${formatDuration(totalMinutes)} total` : `${selectedItemCount} activities` : "Loading…"}</h2></div><span>{hasLoaded ? timelineEnabled ? isDayStarted ? `${formatTime(startMinutes)}–${formatTime(finishMinutes)}` : `Ready for ${formatTime(preferredStartMinutes)}` : `${selectedCompletedItemCount} done` : "—"}</span></div>
              <div className="shape-list">
                {hasLoaded ? categoryTotals.map((entry) => (
                  <div className="shape-row" key={entry.category}>
                    <div><span className="shape-dot" style={{ background: entry.color }} /><strong>{entry.category}</strong><span>{timelineEnabled ? `${entry.minutes} min` : entry.count}</span></div>
                    <div className="shape-track"><span style={{ background: entry.color, width: timelineEnabled ? totalMinutes ? `${(entry.minutes / totalMinutes) * 100}%` : "0%" : selectedItemCount ? `${(entry.count / selectedItemCount) * 100}%` : "0%" }} /></div>
                  </div>
                )) : [0, 1, 2, 3, 4].map((row) => <div className="shape-loading-row" aria-hidden="true" key={row} />)}
              </div>
            </section>

            <p className="local-note"><span>●</span> {hasLoaded ? "Today is saved to your account." : "Loading your saved day…"}</p>
          </aside>
        </div>
      </div>
      {hasLoaded && !expandedActivityId ? (
        <button
          aria-expanded={isGlobalLunaOpen}
          aria-haspopup="dialog"
          aria-label={lunaSummary.unreadCount || lunaSummary.pendingDecisionCount ? "Open notes and conversation, update available" : "Open notes and conversation"}
          className="global-luna-dock"
          type="button"
          onClick={() => { setIsDevMenuOpen(false); setIsSettingsOpen(false); setIsGlobalLunaOpen(true); }}
        >
          <strong>Notes &amp; Assistant</strong>
          <span className="global-luna-dock-state">
            {lunaSummary.unreadCount || lunaSummary.pendingDecisionCount ? <span className="global-luna-dock-badge" aria-label={`${lunaSummary.unreadCount + lunaSummary.pendingDecisionCount} update${lunaSummary.unreadCount + lunaSummary.pendingDecisionCount === 1 ? "" : "s"}`}>{Math.min(9, lunaSummary.unreadCount + lunaSummary.pendingDecisionCount)}{lunaSummary.unreadCount + lunaSummary.pendingDecisionCount > 9 ? "+" : ""}</span> : null}
            <ChevronUp aria-hidden="true" size={17} />
          </span>
        </button>
      ) : null}
    </main>
  );
}
