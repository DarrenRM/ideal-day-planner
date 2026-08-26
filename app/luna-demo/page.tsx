"use client";

import { Check, Copy, Layers3, Pause, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LUNA_FACET_TUNING,
  LunaAvatar,
  type LunaAvatarLayer,
  type LunaAvatarState,
  type LunaFacetTuning,
} from "../luna-avatar";

const STATES: Array<{ id: LunaAvatarState; label: string; detail: string }> = [
  { id: "idle", label: "At rest", detail: "A slow, quiet breath while Luna is available." },
  { id: "thinking", label: "Thinking", detail: "A faster breath while Luna is working." },
];

const LAYERS: Array<{ id: LunaAvatarLayer; label: string }> = [
  { id: "complete", label: "Complete" },
  { id: "facets", label: "Diamonds only" },
  { id: "network", label: "Network" },
];

type DiamondRowId = "outer" | "inner";

type FacetControl = {
  key: keyof LunaFacetTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  suffix?: string;
};

const FACET_GROUPS: Array<{ title: string; controls: FacetControl[] }> = [
  {
    title: "Ring geometry",
    controls: [
      { key: "facetCount", label: "Diamond count", min: 24, max: 72, step: 1 },
      { key: "artScale", label: "Overall ring scale", min: .55, max: .92, step: .01, decimals: 2 },
      { key: "innerTipPosition", label: "Inner tip position", min: .28, max: .8, step: .001, decimals: 3 },
      { key: "sideTipPosition", label: "Side-tip position", min: .36, max: .95, step: .001, decimals: 3 },
      { key: "outerTipPosition", label: "Outer tip position", min: .45, max: 1.15, step: .001, decimals: 3 },
      { key: "angularSpan", label: "Overlap / width", min: .55, max: 1.35, step: .01, decimals: 2 },
    ],
  },
  {
    title: "Diamond shape",
    controls: [
      { key: "innerConvexity", label: "Inner-edge bow", min: .7, max: 1.6, step: .01, decimals: 2 },
      { key: "outerConvexity", label: "Outer-edge bow", min: .7, max: 1.6, step: .01, decimals: 2 },
      { key: "edgeSteps", label: "Edge smoothness", min: 1, max: 12, step: 1 },
    ],
  },
  {
    title: "Color & surface",
    controls: [
      { key: "facetOpacity", label: "Diamond opacity", min: .08, max: .75, step: .01, decimals: 2 },
      { key: "colorRotation", label: "Palette rotation", min: -180, max: 180, step: 1, suffix: "°" },
      { key: "colorLift", label: "Color lift", min: 0, max: .45, step: .01, decimals: 2 },
      { key: "shimmerAmount", label: "Shimmer amount", min: 0, max: .18, step: .005, decimals: 3 },
      { key: "shimmerSpeed", label: "Shimmer speed", min: 0, max: 1.2, step: .01, decimals: 2 },
    ],
  },
  {
    title: "Diamond motion",
    controls: [
      { key: "motionSpeed", label: "Motion speed", min: .2, max: 2, step: .01, decimals: 2 },
      { key: "breathAmount", label: "Breath distance", min: 0, max: 3, step: .02, decimals: 2 },
      { key: "breathPeriod", label: "Breath cycle", min: 2.5, max: 12, step: .1, decimals: 1, suffix: "s" },
      { key: "colorDriftAmount", label: "Palette drift", min: 0, max: 8, step: .1, decimals: 1, suffix: "°" },
      { key: "colorDriftSpeed", label: "Palette drift speed", min: 0, max: .8, step: .01, decimals: 2 },
    ],
  },
];

const STORAGE_KEY = "ideal-day-luna-diamond-rows-v2";
const LEGACY_STORAGE_KEY = "ideal-day-luna-facet-tuning-v1";
const ANCHOR_GAP = .005;

function formatValue(control: FacetControl, value: number) {
  return `${value.toFixed(control.decimals ?? 0)}${control.suffix ?? ""}`;
}

function isSavedTuning(value: unknown): value is Partial<LunaFacetTuning> {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).every(([key, entry]) => key in DEFAULT_LUNA_FACET_TUNING && typeof entry === "number" && Number.isFinite(entry));
}

function createInnerRow(outerRow: LunaFacetTuning): LunaFacetTuning {
  const radialStep = Math.max(.035, outerRow.sideTipPosition - outerRow.innerTipPosition);
  return {
    ...outerRow,
    innerTipPosition: Math.max(.24, outerRow.innerTipPosition - radialStep),
    sideTipPosition: outerRow.innerTipPosition,
    outerTipPosition: outerRow.sideTipPosition,
  };
}

function controlBounds(control: FacetControl, row: LunaFacetTuning) {
  if (control.key === "innerTipPosition") return { min: control.min, max: Math.min(control.max, row.sideTipPosition - ANCHOR_GAP) };
  if (control.key === "sideTipPosition") return { min: Math.max(control.min, row.innerTipPosition + ANCHOR_GAP), max: Math.min(control.max, row.outerTipPosition - ANCHOR_GAP) };
  if (control.key === "outerTipPosition") return { min: Math.max(control.min, row.sideTipPosition + ANCHOR_GAP), max: control.max };
  return { min: control.min, max: control.max };
}

export default function LunaDemoPage() {
  const [state, setState] = useState<LunaAvatarState>("idle");
  const [layer, setLayer] = useState<LunaAvatarLayer>("facets");
  const [outerRow, setOuterRow] = useState<LunaFacetTuning>({ ...DEFAULT_LUNA_FACET_TUNING });
  const [innerRow, setInnerRow] = useState<LunaFacetTuning>(() => createInnerRow(DEFAULT_LUNA_FACET_TUNING));
  const [activeRow, setActiveRow] = useState<DiamondRowId>("outer");
  const [showInnerRow, setShowInnerRow] = useState(false);
  const [innerRowInitialized, setInnerRowInitialized] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const active = STATES.find((item) => item.id === state) || STATES[0];
  const activeTuning = activeRow === "outer" ? outerRow : innerRow;
  const visibleRows = useMemo(() => showInnerRow ? [innerRow, outerRow] : [outerRow], [innerRow, outerRow, showInnerRow]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, unknown>;
          if (isSavedTuning(parsed.outerRow)) setOuterRow({ ...DEFAULT_LUNA_FACET_TUNING, ...parsed.outerRow });
          if (isSavedTuning(parsed.innerRow)) {
            setInnerRow({ ...createInnerRow(DEFAULT_LUNA_FACET_TUNING), ...parsed.innerRow });
            setInnerRowInitialized(true);
          }
          if (typeof parsed.showInnerRow === "boolean") setShowInnerRow(parsed.showInnerRow);
        } else {
          const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            const parsed: unknown = JSON.parse(legacy);
            if (isSavedTuning(parsed)) setOuterRow({ ...DEFAULT_LUNA_FACET_TUNING, ...parsed });
          }
        }
      } catch {
        // Local preferences are a convenience; the demo still works without them.
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ outerRow, innerRow, showInnerRow }));
    } catch {
      // The tuning lab remains usable when browser storage is unavailable.
    }
  }, [innerRow, outerRow, showInnerRow, storageReady]);

  const updateFacet = (key: keyof LunaFacetTuning, value: number) => {
    const update = (current: LunaFacetTuning) => {
      const next = { ...current, [key]: value };
      if (key === "innerTipPosition") next.innerTipPosition = Math.min(value, current.sideTipPosition - ANCHOR_GAP);
      if (key === "sideTipPosition") next.sideTipPosition = Math.max(current.innerTipPosition + ANCHOR_GAP, Math.min(value, current.outerTipPosition - ANCHOR_GAP));
      if (key === "outerTipPosition") next.outerTipPosition = Math.max(value, current.sideTipPosition + ANCHOR_GAP);
      return next;
    };
    if (activeRow === "outer") setOuterRow(update);
    else setInnerRow(update);
    setCopyState("idle");
  };

  const resetActiveRow = () => {
    if (activeRow === "outer") setOuterRow({ ...DEFAULT_LUNA_FACET_TUNING });
    else setInnerRow(createInnerRow(outerRow));
    setCopyState("idle");
  };

  const toggleInnerRow = () => {
    if (!showInnerRow && !innerRowInitialized) {
      setInnerRow(createInnerRow(outerRow));
      setInnerRowInitialized(true);
    }
    const nextVisible = !showInnerRow;
    setShowInnerRow(nextVisible);
    setActiveRow(nextVisible ? "inner" : "outer");
    setCopyState("idle");
  };

  const copySettings = async () => {
    const settings = {
      diamondRows: {
        outer: outerRow,
        inner: { enabled: showInnerRow, ...innerRow },
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const previewLabel = layer === "facets" && showInnerRow ? "Two diamond rows" : LAYERS.find((item) => item.id === layer)?.label;

  return <main className="luna-demo-page">
    <header className="luna-demo-header"><span className="onboarding-kicker">LUNA · DIAMOND STUDY</span><h1>Shape the ring until it feels right.</h1><p>Tune either diamond row independently, then copy only the row settings when you are ready to share them.</p></header>
    <section className="luna-demo-grid">
      <article className="luna-demo-stage" aria-label="Large Luna avatar preview"><LunaAvatar facetRows={visibleRows} layer={layer} size={520} state={state} /><div className="luna-demo-state-copy"><span>{layer === "complete" ? active.label : previewLabel}</span><p>{layer === "complete" ? active.detail : "Use Diamonds only for the clearest view while tuning the shape."}</p></div></article>
      <aside className="luna-demo-controls">
        <section className="luna-demo-control-section"><span className="onboarding-kicker">BEHAVIOR</span><h2>Try Luna’s states</h2><div className="luna-state-options">{STATES.map((option) => <button aria-pressed={state === option.id} className={state === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setState(option.id)}>{option.id === "idle" ? <Pause size={16} /> : <Sparkles size={16} />}<span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div></section>
        <section className="luna-geometry-study"><span className="onboarding-kicker">VIEW</span><div className="luna-layer-options">{LAYERS.map((option) => <button aria-pressed={layer === option.id} className={layer === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setLayer(option.id)}>{option.label}</button>)}</div><button aria-pressed={showInnerRow} className={`luna-row-overlay-button${showInnerRow ? " is-active" : ""}`} type="button" onClick={toggleInnerRow}><Layers3 size={16} />{showInnerRow ? "Hide inner row" : "Overlay inner row"}</button></section>
        <section className="luna-facet-tuner">
          <div className="luna-row-selector" aria-label="Diamond row to adjust" role="group"><button aria-pressed={activeRow === "outer"} className={activeRow === "outer" ? "is-active" : ""} type="button" onClick={() => setActiveRow("outer")}><strong>Outer row</strong><small>Original diamonds</small></button><button aria-pressed={activeRow === "inner"} className={activeRow === "inner" ? "is-active" : ""} disabled={!showInnerRow} type="button" onClick={() => setActiveRow("inner")}><strong>Inner row</strong><small>{showInnerRow ? "Independently adjustable" : "Overlay it first"}</small></button></div>
          <div className="luna-tuning-heading"><div><span className="onboarding-kicker">{activeRow.toUpperCase()} ROW</span><h2>19 live sliders</h2><p>Every control below applies only to this row.</p></div><div className="luna-tuning-actions"><button type="button" onClick={resetActiveRow}><RotateCcw size={14} />Reset row</button><button className="is-primary" type="button" onClick={copySettings}>{copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}{copyState === "copied" ? "Copied" : "Copy settings"}</button></div></div>
          <p className="luna-copy-status" aria-live="polite">{copyState === "failed" ? "Clipboard access failed. Try again from the published page." : copyState === "copied" ? "Both diamond rows are ready to paste back into chat." : "Copies the outer row, inner row, and whether the overlay is visible."}</p>
          <div className="luna-tuning-groups">{FACET_GROUPS.map((group) => <fieldset key={group.title}><legend>{group.title}</legend>{group.controls.map((control) => {
            const inputId = `luna-${activeRow}-${control.key}`;
            const value = activeTuning[control.key];
            const bounds = controlBounds(control, activeTuning);
            return <label className="luna-tuning-row" htmlFor={inputId} key={control.key}><span><strong>{control.label}</strong><output htmlFor={inputId}>{formatValue(control, value)}</output></span><input aria-label={`${activeRow === "outer" ? "Outer" : "Inner"} row ${control.label}`} id={inputId} max={bounds.max} min={bounds.min} step={control.step} type="range" value={value} onInput={(event) => updateFacet(control.key, Number(event.currentTarget.value))} /></label>;
          })}</fieldset>)}</div>
        </section>
        <section className="luna-scale-study"><span className="onboarding-kicker">SCALE TEST</span><div><span><LunaAvatar facetRows={visibleRows} size={64} state={state} /><small>64</small></span><span><LunaAvatar facetRows={visibleRows} size={88} state={state} /><small>88</small></span><span><LunaAvatar facetRows={visibleRows} size={112} state={state} /><small>112</small></span></div></section>
      </aside>
    </section>
  </main>;
}
