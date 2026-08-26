"use client";

import { Boxes, Check, ChevronRight, Columns2, Database, Layers3, Monitor, RotateCcw, Search, Smartphone, Sparkles, WandSparkles } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { ActivityRecordComponent, type RecordMutation } from "../activity-record-components";
import type { ActivityRecord } from "../activity-record-model";
import { ActivityFollowUpComponent, ActivityScheduleSummaryComponent, ActivityWorkspace, CountdownComponent, RoutineComponent, TimerComponent, WorkspaceEmptyGuidance, WorkspaceLunaInvitation, WorkspaceWorkingComponent, type WorkspaceActivity } from "../activity-workspace";
import { StreakTrack } from "../streak-track";
import { buildComponentLibraryFixtures, COMPONENT_GROUPS, COMPONENT_SPECIMENS, type LibraryComponentType } from "./component-library-fixtures";
import type { ComponentUsageMap } from "./component-usage";
import styles from "./component-library.module.css";

type CatalogEntry = { type: string; purpose: string; schema: string };
type Props = { catalog: CatalogEntry[]; catalogVersion: string; recipes: string[]; today: string; usage: ComponentUsageMap };
type View = "components" | "selection";
type PreviewWidth = "desktop" | "mobile";

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

export function ComponentLibraryPage({ catalog, catalogVersion, recipes, today, usage }: Props) {
  const [view, setView] = useState<View>("components");
  const [selectedType, setSelectedType] = useState<LibraryComponentType>("summary");
  const [query, setQuery] = useState("");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [fixtures, setFixtures] = useState(() => buildComponentLibraryFixtures(today));
  const [notice, setNotice] = useState("Live production renderer");

  const specimen = COMPONENT_SPECIMENS.find((entry) => entry.type === selectedType) ?? COMPONENT_SPECIMENS[0];
  const catalogEntry = catalog.find((entry) => entry.type === (specimen.type === "session_choice_compact" ? "session_choice" : specimen.type));
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
        return { ...record, data: { ...data, entries: [...entries, { id: `mock-selection-${today}`, date: today, itemIds: payload.itemIds }] }, version: record.version + 1 };
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
  };

  function resetMock() {
    setFixtures(buildComponentLibraryFixtures(today));
    setNotice("Mock data reset");
  }

  function renderSpecimen() {
    if (specimen.type === "timer") return <TimerComponent activity={activity} component={fixtures.timer} />;
    if (specimen.type === "countdown") return <CountdownComponent activity={activity} component={fixtures.countdown} />;
    if (specimen.type === "routine") return <RoutineComponent component={fixtures.routine} />;
    if (specimen.type === "activity_streak") return <StreakTrack ariaLabel="Morning practice streak" completedToday count={6} />;
    if (specimen.type === "activity_schedule") return <ActivityScheduleSummaryComponent activity={{ title: "Cardio" }} onManageSchedule={() => setNotice("Mock schedule manager captured")} scheduleSummary={fixtures.scheduleSummary} />;
    if (specimen.type === "activity_follow_up") return <ActivityFollowUpComponent followUp={fixtures.followUp} onFollowUpMutation={() => setNotice("Mock check-in action captured")} />;
    if (specimen.type === "workspace_working") return <WorkspaceWorkingComponent activity={{ title: "Cardio" }} workState="building" />;
    if (specimen.type === "workspace_empty") return <WorkspaceEmptyGuidance />;
    if (specimen.type === "workspace_invitation") return <WorkspaceLunaInvitation onTalkWithLuna={() => setNotice("Mock Luna handoff captured")} />;
    if (specimen.type === "product_action_tabs") return <ActivityWorkspace activity={productActivity} onRecordMutation={mutate} onTalkWithLuna={() => setNotice("Mock Luna handoff captured")} records={fixtures.records} workspace={fixtures.productWorkspace} />;
    const record = fixtures.records.find((entry) => entry.key === specimen.recordKey);
    if (!record) return <p>Fixture unavailable.</p>;
    const supportingRecords = fixtures.records.filter((entry) => specimen.supportingRecordKeys?.includes(entry.key));
    const relatedRecords = fixtures.records.filter((entry) => specimen.relatedRecordKeys?.includes(entry.key));
    return <ActivityRecordComponent
      onMutate={mutate}
      onTalkWithLuna={() => setNotice("Mock Luna handoff captured")}
      presentation={specimen.type === "strength_session" ? "featured" : specimen.type === "session_choice_compact" ? "compact" : "default"}
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
        <button aria-pressed={view === "selection"} onClick={() => setView("selection")} type="button"><WandSparkles size={15} /> Selection map</button>
      </nav>
      <div className={styles.status}><span /> Sites workbench</div>
    </header>

    {view === "components" ? <div className={styles.libraryGrid}>
      <aside className={styles.sidebar}>
        <label className={styles.search}><Search size={15} /><input aria-label="Search components" onChange={(event) => setQuery(event.target.value)} placeholder="Search components" value={query} /></label>
        <div className={styles.componentNav}>{COMPONENT_GROUPS.map((group) => {
          const entries = filtered.filter((entry) => entry.group === group);
          return entries.length ? <section key={group}><h2>{group}</h2>{entries.map((entry) => <button aria-current={entry.type === selectedType ? "page" : undefined} key={entry.type} onClick={() => setSelectedType(entry.type)} type="button"><span><b>{entry.label}</b><small>{entry.type}</small></span><ChevronRight size={14} /></button>)}</section> : null;
        })}</div>
        <p className={styles.count}>{filtered.length} of {COMPONENT_SPECIMENS.length} component types</p>
      </aside>

      <section className={styles.stage}>
        <div className={styles.stageHeading}>
          <div><span className={styles.eyebrow}>{specimen.group} · {specimen.layer}</span><h1>{specimen.label}</h1><p>{catalogEntry?.purpose ?? specimen.selection}</p></div>
          <div className={styles.stageActions}>
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
        <section><span className={styles.eyebrow}>Data contract</span><code>{catalogEntry?.schema ?? "Legacy app-owned workspace component"}</code></section>
        <section className={styles.syncNote}><Layers3 size={17} /><div><b>One implementation</b><p>This specimen uses the production renderer. A component design change here is the same change activities receive.</p></div></section>
      </aside>
    </div> : <SelectionMap catalog={catalog} recipes={recipes} />}
  </main>;
}

function SelectionMap({ catalog, recipes }: { catalog: CatalogEntry[]; recipes: string[] }) {
  const hierarchy = [
    ["1", "Adherence / streak", "Current rhythm first"],
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
