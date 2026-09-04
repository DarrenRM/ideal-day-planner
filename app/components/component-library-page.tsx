"use client";

import { ArrowRightLeft, BookOpen, Boxes, CalendarCheck2, CalendarDays, Check, ChevronRight, Clock3, Columns2, Database, Droplet, Layers3, Monitor, RotateCcw, Search, Smartphone, Sparkles, WandSparkles, Wrench } from "../icons";
import { createElement, useMemo, useState, type CSSProperties } from "react";
import { ActivityRecordComponent, type RecordMutation } from "../activity-record-components";
import type { ActivityRecord } from "../activity-record-model";
import { previousDateKey } from "../daily-selection-model";
import { ActivityFollowUpComponent, ActivityScheduleSummaryComponent, ActivityWorkspace, VariableRoutineAdjustment, CountdownComponent, RoutineComponent, TimerComponent, WorkspaceEmptyGuidance, WorkspaceLunaInvitation, WorkspaceWorkingComponent, type WorkspaceActivity } from "../activity-workspace";
import { StreakTrack } from "../streak-track";
import { ConversationWorkReceipt } from "../conversation-work-receipt";
import { ConversationClarificationCard } from "../conversation-clarification-card";
import { activityIconFor, CATEGORY_META, type ActivityCategory } from "../activity-presentation";
import type { WorkReceiptKind } from "../work-receipt-model";
import { buildComponentLibraryFixtures, COMPONENT_GROUPS, COMPONENT_SPECIMENS, type LibraryComponentType } from "./component-library-fixtures";
import type { ComponentUsageMap } from "./component-usage";
import styles from "./component-library.module.css";

type CatalogEntry = { type: string; purpose: string; schema: string };
type ActivityChoice = { key: string; title: string; category: string; durationMinutes: number; recipe: string; components: string[] };
type ActivityChoiceSet = { label: string; prompt: string; choices: ActivityChoice[] };
type ActivityEntry = {
  key: string; title: string; aliases: string[]; category: string; durationMinutes: number; outcome: string; immediatelyActionable: boolean; recipe: string;
  components: { starting: string[]; optional: string[] };
  setup: { mode: "ready" | "guided"; guidance: string };
  onboarding: { priorities: string[]; rhythms: string[]; choiceSet: string | null };
};
type Props = { catalog: CatalogEntry[]; catalogVersion: string; recipes: string[]; activities: ActivityEntry[]; activityChoiceSets: Record<string, ActivityChoiceSet>; activityLibraryVersion: string; today: string; usage: ComponentUsageMap; initialSelectedType?: LibraryComponentType };
type View = "components" | "activities" | "selection" | "setups";
type PreviewWidth = "desktop" | "mobile";
type SessionChoiceState = "choosing" | "selected";
type ReceiptState = "new" | "viewed";
type ClarificationState = "pending" | "answered";

const RECEIPT_SPECIMENS: Record<WorkReceiptKind, { title: string; icon: typeof Sparkles }> = {
  activity_update: { title: "Added a pace target to Morning Walk", icon: Sparkles },
  schedule_update: { title: "Shower is now every 3 days", icon: CalendarDays },
  subject_move: { title: "Massage gun moved to Recovery", icon: ArrowRightLeft },
  check_in: { title: "Progress review scheduled for September 2", icon: CalendarCheck2 },
};

const activity: WorkspaceActivity = {
  id: "component-library-specimen",
  title: "Component specimen",
  duration: 30,
  category: "Training",
  color: "#b7db78",
  timelineEnabled: false,
  recentRuns: [],
};

const productActivity: WorkspaceActivity = {
  ...activity,
  id: "component-library-product-composition",
  title: "Bed Routine",
  category: "Care",
  color: "#d58bb5",
};

function replaceRecord(records: ActivityRecord[], key: string, update: (record: ActivityRecord) => ActivityRecord) {
  return records.map((record) => record.key === key ? update(record) : record);
}

function toggledEntries(data: Record<string, unknown>, itemId: string) {
  for (const field of ["items", "steps", "exercises"] as const) {
    const entries = data[field];
    if (!Array.isArray(entries)) continue;
    return { ...data, [field]: entries.map((entry) => {
      if (!entry || typeof entry !== "object" || !("id" in entry) || entry.id !== itemId) return entry;
      const current = entry as Record<string, unknown>;
      if (Array.isArray(current.completedDates)) {
        const dates = current.completedDates.filter((date): date is string => typeof date === "string");
        return { ...current, completedDates: dates.includes(new Date().toLocaleDateString("en-CA"))
          ? dates.filter((date) => date !== new Date().toLocaleDateString("en-CA"))
          : [...dates, new Date().toLocaleDateString("en-CA")] };
      }
      return { ...current, completed: current.completed !== true };
    }) };
  }
  return data;
}

function recipeParts(recipe: string) {
  const split = recipe.indexOf(":");
  return split < 0 ? { title: recipe, body: "" } : { title: recipe.slice(0, split), body: recipe.slice(split + 1).trim() };
}

export function ComponentLibraryPage({ catalog, catalogVersion, recipes, activities, activityChoiceSets, activityLibraryVersion, today, usage, initialSelectedType = "summary" }: Props) {
  const [view, setView] = useState<View>("components");
  const [selectedType, setSelectedType] = useState<LibraryComponentType>(initialSelectedType);
  const [query, setQuery] = useState("");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [sessionChoiceState, setSessionChoiceState] = useState<SessionChoiceState>("choosing");
  const [receiptKind, setReceiptKind] = useState<WorkReceiptKind>("schedule_update");
  const [receiptState, setReceiptState] = useState<ReceiptState>("new");
  const [clarificationState, setClarificationState] = useState<ClarificationState>("pending");
  const [clarificationOptionId, setClarificationOptionId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState(() => buildComponentLibraryFixtures(today));
  const [notice, setNotice] = useState("Live production renderer");

  const specimen = COMPONENT_SPECIMENS.find((entry) => entry.type === selectedType) ?? COMPONENT_SPECIMENS[0];
  const catalogEntry = catalog.find((entry) => entry.type === specimen.type);
  const dataContract = catalogEntry?.schema ?? (specimen.type === "conversation_clarification"
    ? "conversation_clarifications(question, options_json[2–4], status, selected_option_id, response_message_id)"
    : "Legacy app-owned workspace component");
  const usedOn = usage[specimen.type] ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COMPONENT_SPECIMENS;
    return COMPONENT_SPECIMENS.filter((entry) => `${entry.label} ${entry.type} ${entry.group} ${entry.activities.join(" ")}`.toLowerCase().includes(normalized));
  }, [query]);

  const mutate: RecordMutation = async (recordKey, operation, payload) => {
    setFixtures((current) => ({ ...current, records: replaceRecord(current.records, recordKey, (record) => {
      const data = record.data as Record<string, unknown>;
      if (operation === "toggle_item" && typeof payload.itemId === "string") return { ...record, data: toggledEntries(data, payload.itemId), version: record.version + 1 };
      if (operation === "add_item" && typeof payload.label === "string") {
        const items = Array.isArray(data.items) ? data.items : [];
        return { ...record, data: { ...data, items: [...items, { id: `mock-${Date.now()}`, label: payload.label }] }, version: record.version + 1 };
      }
      if (operation === "set_daily_selection" && Array.isArray(payload.itemIds)) {
        const entries = Array.isArray(data.entries) ? data.entries.filter((entry) => !entry || typeof entry !== "object" || !("date" in entry) || entry.date !== today) : [];
        return { ...record, data: { ...data, entries: [...entries, { id: `mock-selection-${today}`, date: today, itemIds: payload.itemIds, ...(payload.counts && typeof payload.counts === "object" ? { counts: payload.counts } : {}) }] }, version: record.version + 1 };
      }
      if (operation === "set_daily_selection_count" && typeof payload.itemId === "string" && typeof payload.count === "number") {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const current = entries.find((entry) => entry && typeof entry === "object" && "date" in entry && entry.date === today) as { itemIds?: string[]; counts?: Record<string, number> } | undefined;
        const itemIds = (current?.itemIds ?? []).filter((id) => id !== payload.itemId);
        const counts = { ...(current?.counts ?? {}) };
        delete counts[payload.itemId];
        if (payload.count > 0) itemIds.push(payload.itemId);
        if (payload.count > 1) counts[payload.itemId] = payload.count;
        return { ...record, data: { ...data, entries: [...entries.filter((entry) => !entry || typeof entry !== "object" || !("date" in entry) || entry.date !== today), { id: `mock-selection-${today}`, date: today, itemIds, ...(Object.keys(counts).length ? { counts } : {}) }] }, version: record.version + 1 };
      }
      if (operation === "copy_daily_selection_previous") {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const previous = [...entries].reverse().find((entry) => entry && typeof entry === "object" && "date" in entry && entry.date !== today) as { itemIds?: string[] } | undefined;
        const withoutToday = entries.filter((entry) => !entry || typeof entry !== "object" || !("date" in entry) || entry.date !== today);
        return { ...record, data: { ...data, entries: [...withoutToday, { id: `mock-selection-${today}`, date: today, itemIds: previous?.itemIds ?? [] }] }, version: record.version + 1 };
      }
      if (operation === "add_daily_selection_item" && typeof payload.label === "string") {
        const items = Array.isArray(data.items) ? data.items : [];
        return { ...record, data: { ...data, items: [...items, { id: `mock-choice-${Date.now()}`, label: payload.label, active: true }] }, version: record.version + 1 };
      }
      if (operation === "select_session_choice" && typeof payload.optionId === "string") {
        const selections = Array.isArray(data.selections) ? data.selections.filter((entry) => !entry || typeof entry !== "object" || !("date" in entry) || entry.date !== today) : [];
        return { ...record, data: { ...data, selections: [...selections, { id: `mock-choice-${today}`, date: today, optionId: payload.optionId }] }, version: record.version + 1 };
      }
      if (operation === "save_session_log" || operation === "add_quick_log") {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        return { ...record, data: { ...data, entries: [...entries, { id: `mock-entry-${Date.now()}`, date: today, createdAt: new Date().toISOString(), ...payload }] }, version: record.version + 1 };
      }
      if (operation === "set_adherence") {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const existing = entries.find((entry) => entry && typeof entry === "object" && "date" in entry && entry.date === (payload.date ?? today)) as { completed?: boolean } | undefined;
        const date = typeof payload.date === "string" ? payload.date : today;
        return { ...record, data: { ...data, entries: [...entries.filter((entry) => !entry || typeof entry !== "object" || !("date" in entry) || entry.date !== date), { id: `mock-adherence-${date}`, date, completed: existing?.completed !== true }] }, version: record.version + 1 };
      }
      if (operation === "toggle_recurring_step") {
        const dates = Array.isArray(data.completedDates) ? data.completedDates.filter((date): date is string => typeof date === "string") : [];
        return { ...record, data: { ...data, completedDates: dates.includes(today) ? dates.filter((date) => date !== today) : [...dates, today] }, version: record.version + 1 };
      }
      return { ...record, version: record.version + 1 };
    }) }));
    setNotice(`Mock ${operation.replaceAll("_", " ")} captured`);
    return true;
  };

  function resetMock() {
    setFixtures(buildComponentLibraryFixtures(today));
    setSessionChoiceState("choosing");
    setReceiptKind("schedule_update");
    setReceiptState("new");
    setClarificationState("pending");
    setClarificationOptionId(null);
    setNotice("Mock data reset");
  }

  function selectSpecimen(next: LibraryComponentType) {
    setSelectedType(next);
    const url = new URL(window.location.href);
    url.searchParams.set("component", next);
    window.history.replaceState(window.history.state, "", url);
  }

  function renderSpecimen() {
    if (specimen.type === "timer") return <TimerComponent activity={activity} component={fixtures.timer} />;
    if (specimen.type === "countdown") return <CountdownComponent activity={activity} component={fixtures.countdown} />;
    if (specimen.type === "routine") return <RoutineComponent component={fixtures.routine} />;
    if (specimen.type === "activity_streak") return <StreakTrack ariaLabel="Morning practice streak" completedToday count={8} />;
    if (specimen.type === "activity_schedule") return <ActivityScheduleSummaryComponent activity={{ title: "Cardio" }} onManageSchedule={() => setNotice("Mock schedule manager captured")} scheduleSummary={fixtures.scheduleSummary} />;
    if (specimen.type === "activity_follow_up") return <ActivityFollowUpComponent followUp={fixtures.followUp} onFollowUpMutation={() => setNotice("Mock check-in action captured")} />;
    if (specimen.type === "workspace_working") return <WorkspaceWorkingComponent activity={{ title: "Cardio" }} workState="building" />;
    if (specimen.type === "workspace_empty") return <WorkspaceEmptyGuidance />;
    if (specimen.type === "workspace_invitation") return <WorkspaceLunaInvitation onTalkWithLuna={() => setNotice("Mock Luna handoff captured")} />;
    if (specimen.type === "conversation_work_receipt") {
      const receipt = RECEIPT_SPECIMENS[receiptKind];
      const ReceiptIcon = receipt.icon;
      return <ConversationWorkReceipt
        artifact={{ id: "mock-work-receipt", kind: receiptKind, title: receipt.title, viewedAt: receiptState === "viewed" ? "2026-08-26 11:28:00" : null, createdAt: "2026-08-26 11:26:00" }}
        icon={<ReceiptIcon aria-hidden="true" size={17} />}
        onView={() => { setReceiptState("viewed"); setNotice("Mock committed result opened"); }}
        timestamp="11:26 AM"
      />;
    }
    if (specimen.type === "conversation_clarification") return <ConversationClarificationCard
      busy={false}
      clarification={{
        id: "mock-clarification",
        body: "How do you usually want this routine to work?",
        options: [
          { id: "every-step", label: "I usually do every step", detail: "Keep one ordered routine with a single completion.", response: "I normally use every step in order." },
          { id: "choose-daily", label: "I choose what fits", detail: "Let me check individual items and repeat one when needed.", response: "I choose whichever steps fit each day." },
        ],
        status: clarificationState,
        selectedOptionId: clarificationOptionId,
        sourceAgentJobId: "mock-clarification-job",
        createdAt: "2026-09-02 13:30:00",
        answeredAt: clarificationState === "answered" ? "2026-09-02 13:31:00" : null,
      }}
      onChoose={(option) => { setClarificationOptionId(option.id); setClarificationState("answered"); setNotice(`Mock option selected: ${option.label}`); }}
      onOther={() => setNotice("Mock composer focused")}
    />;
    if (specimen.type === "product_action_tabs") return <ActivityWorkspace activity={productActivity} onRecordMutation={mutate} onTalkWithLuna={() => setNotice("Mock Luna handoff captured")} records={fixtures.records} workspace={fixtures.productWorkspace} />;
    const record = fixtures.records.find((entry) => entry.key === specimen.recordKey);
    if (!record) return <p>Fixture unavailable.</p>;
    const supportingRecords = fixtures.records.filter((entry) => specimen.supportingRecordKeys?.includes(entry.key));
    const relatedRecords = fixtures.records.filter((entry) => specimen.relatedRecordKeys?.includes(entry.key));
    return <ActivityRecordComponent
      key={`${record.key}:${specimen.type === "session_choice" ? sessionChoiceState : "default"}`}
      onMutate={mutate}
      onTalkWithLuna={() => setNotice("Mock Luna handoff captured")}
      presentation={specimen.type === "strength_session" ? "featured" : specimen.type === "session_choice" && sessionChoiceState === "selected" ? "compact" : "default"}
      record={record}
      relatedRecords={relatedRecords}
      supportingRecords={supportingRecords}
    />;
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand}><span><Boxes size={17} /></span><div><b>Ideal Day</b><small>Component library · {catalogVersion}</small></div></div>
      <nav aria-label="Library views" className={styles.viewTabs}>
        <button aria-pressed={view === "components"} onClick={() => setView("components")} type="button"><Columns2 size={15} /> Components</button>
        <button aria-pressed={view === "activities"} onClick={() => setView("activities")} type="button"><BookOpen size={15} /> Activities</button>
        <button aria-pressed={view === "setups"} onClick={() => setView("setups")} type="button"><Wrench size={15} /> Activity setups</button>
        <button aria-pressed={view === "selection"} onClick={() => setView("selection")} type="button"><WandSparkles size={15} /> Selection map</button>
      </nav>
      <div className={styles.status}><span /> Sites workbench</div>
    </header>

    {view === "components" ? <div className={styles.libraryGrid}>
      <aside className={styles.sidebar}>
        <label className={styles.search}><Search size={15} /><input aria-label="Search components" onChange={(event) => setQuery(event.target.value)} placeholder="Search components" value={query} /></label>
        <div className={styles.componentNav}>{COMPONENT_GROUPS.map((group) => {
          const entries = filtered.filter((entry) => entry.group === group);
          return entries.length ? <section key={group}><h2>{group}</h2>{entries.map((entry) => <button aria-current={entry.type === selectedType ? "page" : undefined} key={entry.type} onClick={() => selectSpecimen(entry.type)} type="button"><span><b>{entry.label}</b><small>{entry.type}</small></span><ChevronRight size={14} /></button>)}</section> : null;
        })}</div>
        <p className={styles.count}>{filtered.length} of {COMPONENT_SPECIMENS.length} component types</p>
      </aside>

      <section className={styles.stage}>
        <div className={styles.stageHeading}>
          <div><span className={styles.eyebrow}>{specimen.group} · {specimen.layer}</span><h1>{specimen.label}</h1><p>{catalogEntry?.purpose ?? specimen.selection}</p></div>
          <div className={styles.stageActions}>
            {specimen.type === "session_choice" ? <div className={styles.stateSwitch} aria-label="Session choice state"><button aria-pressed={sessionChoiceState === "choosing"} onClick={() => setSessionChoiceState("choosing")} type="button">Choosing</button><button aria-pressed={sessionChoiceState === "selected"} onClick={() => setSessionChoiceState("selected")} type="button">Selected</button></div> : null}
            {specimen.type === "conversation_work_receipt" ? <>
              <label className={styles.variantSelect}><span>Receipt type</span><select aria-label="Receipt type" onChange={(event) => setReceiptKind(event.target.value as WorkReceiptKind)} value={receiptKind}>{Object.keys(RECEIPT_SPECIMENS).map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label>
              <div className={styles.stateSwitch} aria-label="Work receipt state"><button aria-pressed={receiptState === "new"} onClick={() => setReceiptState("new")} type="button">New</button><button aria-pressed={receiptState === "viewed"} onClick={() => setReceiptState("viewed")} type="button">Viewed</button></div>
            </> : null}
            <div className={styles.widthSwitch} aria-label="Preview width"><button aria-pressed={previewWidth === "desktop"} onClick={() => setPreviewWidth("desktop")} title="Desktop width" type="button"><Monitor size={15} /></button><button aria-pressed={previewWidth === "mobile"} onClick={() => setPreviewWidth("mobile")} title="Mobile width" type="button"><Smartphone size={15} /></button></div>
            <button className={styles.resetButton} onClick={resetMock} type="button"><RotateCcw size={14} /> Reset mock</button>
          </div>
        </div>
        <div className={styles.previewField}>
          <div className={styles.previewShell} data-width={previewWidth}>
            <div className={`${specimen.type === "product_action_tabs" ? "" : "activity-workspace workspace-live"} ${styles.productionSurface}`} style={{ "--item-color": specimen.type === "product_action_tabs" ? productActivity.color : activity.color } as CSSProperties}>
              <div className={specimen.type === "product_action_tabs" ? undefined : "workspace-stack"}>{renderSpecimen()}</div>
            </div>
          </div>
        </div>
        <div className={styles.previewFooter}><span><Check size={13} /> {notice}</span><span>{previewWidth === "desktop" ? "620 px" : "390 px"} specimen</span></div>
      </section>

      <aside className={styles.inspector}>
        <section><span className={styles.eyebrow}>Selection rule</span><p>{specimen.selection}</p></section>
        <section><span className={styles.eyebrow}>Good fits</span><div className={styles.chips}>{specimen.activities.map((name) => <span key={name}>{name}</span>)}</div></section>
        <section><span className={styles.eyebrow}>Used on</span>{usedOn.length ? <div className={styles.usedOn}>{usedOn.map((name) => <span key={name}>{name}</span>)}</div> : <p className={styles.notUsed}>Not currently used by an activity.</p>}</section>
        <section><span className={styles.eyebrow}>Hierarchy</span><div className={styles.hierarchy}><span>{specimen.role}</span><ChevronRight size={13} /><p>{specimen.hierarchy}</p></div></section>
        <section><span className={styles.eyebrow}>Data contract</span><code>{dataContract}</code></section>
        <section className={styles.syncNote}><Layers3 size={17} /><div><b>One implementation</b><p>This specimen uses the production renderer. A component design change here is the same change activities receive.</p></div></section>
      </aside>
    </div> : view === "activities" ? <ActivityLibrary activities={activities} choiceSets={activityChoiceSets} version={activityLibraryVersion} /> : view === "setups" ? <ActivitySetupLab /> : <SelectionMap catalog={catalog} recipes={recipes} />}
  </main>;
}

type SetupMode = "choose" | "sequence" | "separate";

const SETUP_OPTIONS: Array<{ id: SetupMode; title: string; description: string }> = [
  { id: "choose", title: "Choose what fits today", description: "Pick any combination without implying the whole roster was completed." },
  { id: "sequence", title: "Follow the same steps", description: "Keep one ordered routine and work through it from top to bottom." },
  { id: "separate", title: "Separate a treatment", description: "Give a treatment its own schedule, completion, and activity context." },
];

const FACE_CARE_ITEMS = [
  { id: "retinol", label: "Retinol", detail: "Scheduled treatment", group: "due", cadence: "Every 4 days" },
  { id: "cleanse", label: "Gentle cleanser", detail: "Start with clean, dry skin", group: "other", cadence: null },
  { id: "serum", label: "Hydrating serum", detail: "Use when extra hydration feels useful", group: "other", cadence: null },
  { id: "moisturize", label: "Moisturizer", detail: "Finish the routine with moisture", group: "other", cadence: null },
];

function ActivitySetupLab() {
  const [mode, setMode] = useState<SetupMode>("choose");
  const [selected, setSelected] = useState<string[]>(["cleanse", "serum", "moisturize"]);
  const [maskCounts, setMaskCounts] = useState<Record<string, number>>({ red: 1, green: 0, amber: 0 });
  const [separateSubject, setSeparateSubject] = useState("LED face mask");
  const [notice, setNotice] = useState("Prototype only · no activity data changed");

  function chooseMode(nextMode: SetupMode) {
    setMode(nextMode);
    setNotice(nextMode === "choose" ? "Variable daily routine preview" : nextMode === "sequence" ? "Fixed sequence preview" : "Separate activity preview");
  }

  const chosenOption = SETUP_OPTIONS.find((option) => option.id === mode)!;
  const today = new Date().toLocaleDateString("en-CA");
  const mockRecord = (key: string, type: ActivityRecord["type"], data: Record<string, unknown>): ActivityRecord => ({ id: key, key, type, data, title: "Face Care", subjectKey: null, scope: "activity", scopeDate: null, version: 1, updatedAt: today });
  const routineRecord = mockRecord("preview-choices", "daily_selection", {
    kind: "routine", prompt: "What fits your skin today?",
    items: [...FACE_CARE_ITEMS.map((item) => ({ ...item, cadenceRecordKey: item.id === "retinol" ? "preview-retinol" : undefined })),
      { id: "mask", label: "Light mask", subjectKey: "preview-device" },
      { id: "red", label: "Red", parentItemId: "mask", subjectKey: "preview-device", allowMultiple: true, unitLabel: "session", cadenceRecordKey: "preview-mask" },
      { id: "green", label: "Green", parentItemId: "mask", subjectKey: "preview-device", allowMultiple: true, unitLabel: "session" },
      { id: "amber", label: "Amber", parentItemId: "mask", subjectKey: "preview-device", allowMultiple: true, unitLabel: "session" }],
    entries: [
      { id: "preview-yesterday", date: previousDateKey(today), itemIds: ["cleanse", "moisturize", "red", "green"], counts: { red: 2 } },
      { id: "preview-today", date: today, itemIds: [...selected, ...Object.keys(maskCounts).filter((color) => maskCounts[color] > 0)], counts: maskCounts },
    ],
  });
  const cadenceRecords = [mockRecord("preview-retinol", "recurring_step", { cadence: { kind: "interval_days", every: 4 }, anchorDate: today }), mockRecord("preview-mask", "recurring_step", { cadence: { kind: "interval_days", every: 2 }, anchorDate: today })];
  cadenceRecords.push(mockRecord("preview-device", "product", { kind: "device", name: "Light mask", notes: "Example modes only. Use the options and instructions verified for your device; the cadence shown here is demo data." }));
  const mutatePreview: RecordMutation = async (_key, operation, payload) => {
    if (operation === "set_daily_selection" || operation === "copy_daily_selection_previous") {
      const previous = operation === "copy_daily_selection_previous"
        ? (routineRecord.data.entries as Array<{ date: string; itemIds: string[]; counts?: Record<string, number> }>).find((entry) => entry.date === previousDateKey(today))
        : undefined;
      const ids = previous?.itemIds ?? payload.itemIds as string[];
      setSelected(ids.filter((id) => !["red", "green", "amber"].includes(id)));
      const counts = previous?.counts ?? payload.counts as Record<string, number> | undefined;
      setMaskCounts(Object.fromEntries(["red", "green", "amber"].map((id) => [id, ids.includes(id) ? counts?.[id] ?? 1 : 0])));
    }
    else if (operation === "toggle_item") setSelected((current) => current.includes(String(payload.itemId)) ? current.filter((id) => id !== payload.itemId) : [...current, String(payload.itemId)]);
    else if (operation === "set_daily_selection_count") setMaskCounts((current) => ({ ...current, [payload.itemId as string]: Number(payload.count) }));
    setNotice("Preview updated · no activity data changed");
    return true;
  };

  return <div className={styles.setupLab}>
    <section className={styles.setupIntro}>
      <div><span className={styles.eyebrow}>Prototype · activity-level pattern</span><h1>Let the routine match how the person actually uses it.</h1><p>This playground combines a reusable daily-choice component with the question, preview, and safe conversion needed to place it in an activity.</p></div>
      <span className={styles.prototypeBadge}><Sparkles size={13} /> Exploratory</span>
    </section>

    <section className={styles.setupQuestion}>
      <div className={styles.setupQuestionCopy}><span className={styles.eyebrow}>Luna’s one useful question</span><h2>How do you normally use this routine?</h2><p>Asked only when the person’s description does not already make the answer clear.</p></div>
      <div className={styles.setupOptionGrid}>{SETUP_OPTIONS.map((option) => <button aria-pressed={mode === option.id} key={option.id} onClick={() => chooseMode(option.id)} type="button"><span>{mode === option.id ? <Check size={12} weight="bold" /> : null}</span><b>{option.title}</b><small>{option.description}</small></button>)}</div>
    </section>

    <div className={styles.setupWorkbench}>
      <aside className={styles.setupNotes}>
        <section><span className={styles.eyebrow}>Recommended behavior</span><h2>{chosenOption.title}</h2><p>{chosenOption.description}</p></section>
        <section><span className={styles.eyebrow}>Why Luna chose it</span><blockquote>“I skip some steps depending on what my face needs, and sometimes use two mask colors.”</blockquote><p>The language describes a variable subset and repeatable modes. The number of items is not the deciding signal.</p></section>
        <section><span className={styles.eyebrow}>Preserve during conversion</span><ul><li>Product names and directions</li><li>Verified sources and notes</li><li>Existing dated history</li><li>The Face Care conversation</li></ul></section>
      </aside>

      <section className={styles.setupStage}>
        <div className={styles.phonePreview}>
          <header className={styles.mockActivityHeader}><div className={styles.mockActivityIcon}><Droplet size={18} /></div><div><h2>Face Care</h2><p>15 minutes</p></div><span className="category-chip">CARE</span></header>
          {mode === "choose" ? <div className={styles.productionRoutinePreview}><ActivityRecordComponent record={routineRecord} relatedRecords={cadenceRecords} onMutate={mutatePreview} /></div> : mode === "sequence" ? <div className={styles.productionRoutinePreview}><ActivityRecordComponent protocolInitiallyOpen record={mockRecord("preview-protocol", "protocol", { summary: "Work through the same ordered sequence.", steps: FACE_CARE_ITEMS.map((item) => ({ id: item.id, label: item.label, note: item.detail, completedDates: selected.includes(item.id) ? [today] : [] })) })} onMutate={mutatePreview} /></div> : <div className={styles.separatePreview}>
            <section><span className="workspace-overline">Face Care · daily choices</span><h3>Everyday products stay together</h3><p>Cleanser, serum, moisturizer, and other choices remain in this activity.</p></section>
            <div className={styles.moveDivider}><span /><ArrowRightLeft size={16} /><span /></div>
            <section className={styles.newActivityCard}><span className="workspace-overline">New activity</span><h3>{separateSubject}</h3><p>Its own schedule, completion state, instructions, and future conversation.</p><label><span>Treatment to separate</span><select aria-label="Treatment to separate" onChange={(event) => setSeparateSubject(event.target.value)} value={separateSubject}><option>LED face mask</option><option>Retinol treatment</option><option>Exfoliation</option></select></label></section>
          </div>}
          <div className={styles.adjustmentPreview}><VariableRoutineAdjustment onTalkWithLuna={() => setNotice("Preview only: in an activity, this opens its existing Luna conversation.")} /></div>
          <div className={styles.mockFooter}><button className="skip-activity-button" onClick={() => setNotice("Preview only: Face Care skipped")} type="button">Skip</button><button className="complete-activity-button" onClick={() => setNotice("Preview only: Face Care completed")} type="button"><Check size={14} /> Done with face care</button></div>
        </div>
        <div className={styles.setupStatus}><span><Check size={13} /> {notice}</span><span>390 px activity preview</span></div>
      </section>

      <aside className={styles.setupInspector}>
        <section><span className={styles.eyebrow}>What changes</span><h2>{mode === "choose" ? "Selection and cadence compose" : mode === "sequence" ? "Daily interaction" : "Activity ownership"}</h2><p>{mode === "choose" ? "Recurring steps appear under Due today while the rest remain available. Completing Face Care closes the session without claiming every choice was used." : mode === "sequence" ? "The activity returns to one ordered protocol. Individual step completion remains visible." : "The selected subject and its owned instructions move together. Shared history is never guessed or silently split."}</p></section>
        <section><span className={styles.eyebrow}>Underlying pieces</span><div className={styles.setupPieces}>{mode === "choose" ? <><span>variable daily routine</span><span>subject references</span><span>recurring cadence</span><span>dated selections</span><span>mode counts</span></> : mode === "sequence" ? <><span>protocol</span><span>ordered steps</span><span>dated completion</span></> : <><span>activity proposal</span><span>subject move</span><span>schedule choice</span></>}</div></section>
        <section className={styles.prototypeCallout}><Sparkles size={17} /><div><b>Prototype boundary</b><p>Every control on this page changes mock state only. A real conversion would need a separate review showing each record and schedule change before any confirmation exists.</p></div></section>
      </aside>
    </div>
  </div>;
}

const PRIORITY_LABELS: Record<string, string> = { energy: "More energy", strength: "Strength & movement", focus: "Focused work", sleep: "Better sleep", calm: "Calm & recovery", nourishment: "Nourishment", "self-care": "Self-care", home: "Home & order", creativity: "Creativity", connection: "Connection" };
const RHYTHM_LABELS: Record<string, string> = { morning: "Morning anchor", midday: "Midday reset", evening: "Evening wind-down", movement: "Movement", flexible: "Flexible day" };

function ActivityLibrary({ activities, choiceSets, version }: { activities: ActivityEntry[]; choiceSets: Record<string, ActivityChoiceSet>; version: string }) {
  const [selectedKey, setSelectedKey] = useState(activities[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return activities;
    return activities.filter((entry) => `${entry.title} ${entry.key} ${entry.category} ${entry.aliases.join(" ")} ${entry.onboarding.priorities.join(" ")} ${entry.onboarding.rhythms.join(" ")}`.toLowerCase().includes(normalized));
  }, [activities, query]);
  const selected = filtered.find((entry) => entry.key === selectedKey) ?? filtered[0] ?? activities[0];
  if (!selected) return null;
  const category = selected.category as ActivityCategory;
  const choiceSet = selected.onboarding.choiceSet ? choiceSets[selected.onboarding.choiceSet] : null;
  const color = CATEGORY_META[category].color;
  return <div className={styles.activityLibraryGrid} style={{ "--activity-color": color } as CSSProperties}>
    <aside className={styles.activitySidebar}>
      <div className={styles.activitySidebarIntro}><span className={styles.eyebrow}>Core starter set</span><p>Canonical activities used by onboarding and exact activity-to-recipe mapping. Personal activities can still exist outside this set.</p></div>
      <label className={styles.search}><Search size={15} /><input aria-label="Search activities" onChange={(event) => setQuery(event.target.value)} placeholder="Search activities" value={query} /></label>
      <div className={styles.activityNav}>{filtered.map((entry) => {
        const entryCategory = entry.category as ActivityCategory;
        return <button aria-current={entry.key === selected.key ? "page" : undefined} key={entry.key} onClick={() => setSelectedKey(entry.key)} style={{ "--nav-color": CATEGORY_META[entryCategory].color } as CSSProperties} type="button"><span className={styles.activityNavIcon}>{createElement(activityIconFor({ title: entry.title, category: entryCategory }), { size: 16 })}</span><span><b>{entry.title}</b><small>{entry.category} · {entry.durationMinutes} min</small></span><ChevronRight size={14} /></button>;
      })}</div>
      <p className={styles.count}>{filtered.length} of {activities.length} core activities</p>
    </aside>

    <section className={styles.activityStage}>
      <header className={styles.activityHero}>
        <div className={styles.activityHeroIcon}>{createElement(activityIconFor({ title: selected.title, category }), { size: 27 })}</div>
        <div><span className={styles.eyebrow}>{selected.category} · {selected.key}</span><h1>{selected.title}</h1><p>{selected.outcome}</p></div>
        <div className={styles.activityFacts}><span><Clock3 size={13} /> {selected.durationMinutes} minutes</span><span><Check size={13} /> {selected.immediatelyActionable ? "Ready to try" : "Needs setup"}</span></div>
      </header>

      <section className={styles.activitySection}><div className={styles.activitySectionHeading}><span className={styles.eyebrow}>Default experience</span><h2>{selected.recipe}</h2></div><p className={styles.activityGuidance}>{selected.setup.guidance}</p><div className={styles.componentPipeline}><div><small>Start with</small>{selected.components.starting.map((type) => <code key={type}>{type}</code>)}</div><ChevronRight size={16} /><div><small>Add when supported</small>{selected.components.optional.map((type) => <code key={type}>{type}</code>)}</div></div></section>

      {choiceSet ? <section className={styles.activitySection}><div className={styles.activitySectionHeading}><span className={styles.eyebrow}>{choiceSet.label}</span><h2>{choiceSet.prompt}</h2><p>Onboarding recommends one concrete choice and lets the person switch before the starting set is created.</p></div><div className={styles.choiceGrid}>{choiceSet.choices.map((choice) => <article key={choice.key}><span>{choice.category} · {choice.durationMinutes} min</span><h3>{choice.title}</h3><p>{choice.recipe}</p><div>{choice.components.map((component) => <code key={component}>{component}</code>)}</div></article>)}</div></section> : <section className={`${styles.activitySection} ${styles.noChoiceSet}`}><Sparkles size={18} /><div><b>No preference fork</b><p>Onboarding can recommend this action directly because its title already describes what the person will do.</p></div></section>}
    </section>

    <aside className={styles.activityInspector}>
      <section><span className={styles.eyebrow}>Onboarding match</span><h2>Priorities</h2><div className={styles.mappingChips}>{selected.onboarding.priorities.map((value) => <span key={value}>{PRIORITY_LABELS[value] ?? value}</span>)}</div><h2>Rhythms</h2><div className={styles.mappingChips}>{selected.onboarding.rhythms.map((value) => <span key={value}>{RHYTHM_LABELS[value] ?? value}</span>)}</div></section>
      <section><span className={styles.eyebrow}>Ranking behavior</span><p>A priority match adds 4 points; a rhythm match adds 2. Ties follow catalog order. Gentle selects 3, balanced 4, and push 5. Low-energy, getting-started, or physical-limit friction caps fallback durations at 20 minutes.</p></section>
      <section><span className={styles.eyebrow}>Setup posture</span><strong>{selected.setup.mode === "ready" ? "Quiet by default" : "One useful question"}</strong><p>{selected.setup.mode === "ready" ? "The person can start without durable setup. Luna waits for evidence before adding detail." : "Luna may ask one high-value question when its answer determines the durable design."}</p></section>
      <section><span className={styles.eyebrow}>Recognized aliases</span><div className={styles.aliasList}>{selected.aliases.map((alias) => <span key={alias}>{alias}</span>)}</div></section>
      <section><span className={styles.eyebrow}>Catalog identity</span><code>{selected.key}</code><p>{version}</p></section>
    </aside>
  </div>;
}

function SelectionMap({ catalog, recipes }: { catalog: CatalogEntry[]; recipes: string[] }) {
  const hierarchy = [
    ["1", "Adherence / streak", "Current streak first"],
    ["2", "Recurring step", "Only when its own cadence is due"],
    ["3", "Countdown", "Before the work it times"],
    ["4", "Primary content", "The action or canonical tracker"],
    ["5", "Reference", "Equipment and supporting evidence"],
    ["6", "Resources", "Authoritative links last"],
  ];
  return <div className={styles.mapPage}>
    <section className={styles.mapIntro}><span className={styles.eyebrow}>How Luna composes an activity</span><h1>Evidence chooses the recipe. The recipe chooses the smallest useful component set.</h1><p>Category is a hint, never the decision. Existing records, supplied source evidence, and the user’s actual tracking need determine the composition.</p></section>
    <div className={styles.flow}>
      <article><span>01</span><Sparkles size={18} /><h2>Evidence</h2><p>User language, linked sources, existing records, and known activity intent.</p></article>
      <article><span>02</span><WandSparkles size={18} /><h2>Recipe</h2><p>A composition pattern such as Measured session or Product/device care.</p></article>
      <article><span>03</span><Database size={18} /><h2>Typed records</h2><p>Validated records with explicit activity or subject ownership.</p></article>
      <article><span>04</span><Layers3 size={18} /><h2>Workspace</h2><p>Semantic ordering and special compositions rendered from those records.</p></article>
    </div>
    <div className={styles.mapColumns}>
      <section className={styles.rulesPanel}><span className={styles.eyebrow}>Display hierarchy</span><div>{hierarchy.map(([number, title, detail]) => <article key={number}><span>{number}</span><div><b>{title}</b><p>{detail}</p></div></article>)}</div><p className={styles.ruleFootnote}>Product/device records become visual parents for records with the same subject key. Session choices and logs, and workout plans and strength sessions, are explicitly linked compositions—not neighboring cards that happen to sit together.</p></section>
      <section className={styles.catalogPanel}><span className={styles.eyebrow}>Approved primitives</span><div className={styles.catalogTypes}>{catalog.map((entry) => <span key={entry.type} title={entry.purpose}>{entry.type}</span>)}</div><p>{catalog.length} catalog primitives, plus the retained legacy routine renderer.</p></section>
    </div>
    <section className={styles.recipeSection}><div><span className={styles.eyebrow}>Composition recipes</span><h2>Known activity patterns</h2></div><div className={styles.recipeGrid}>{recipes.map((recipe) => { const parts = recipeParts(recipe); return <article key={parts.title}><h3>{parts.title}</h3><p>{parts.body}</p></article>; })}</div></section>
  </div>;
}
