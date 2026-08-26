"use client";

import { Check, Copy, Pause, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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
      { key: "innerTipPosition", label: "Inner tip position", min: .45, max: .7, step: .001, decimals: 3 },
      { key: "sideTipPosition", label: "Side-tip position", min: .705, max: .86, step: .001, decimals: 3 },
      { key: "outerTipPosition", label: "Outer tip position", min: .865, max: 1.08, step: .001, decimals: 3 },
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

const STORAGE_KEY = "ideal-day-luna-facet-tuning-v1";

function formatValue(control: FacetControl, value: number) {
  return `${value.toFixed(control.decimals ?? 0)}${control.suffix ?? ""}`;
}

function isSavedTuning(value: unknown): value is Partial<LunaFacetTuning> {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).every(([key, entry]) => key in DEFAULT_LUNA_FACET_TUNING && typeof entry === "number" && Number.isFinite(entry));
}

export default function LunaDemoPage() {
  const [state, setState] = useState<LunaAvatarState>("idle");
  const [layer, setLayer] = useState<LunaAvatarLayer>("facets");
  const [facetTuning, setFacetTuning] = useState<LunaFacetTuning>({ ...DEFAULT_LUNA_FACET_TUNING });
  const [storageReady, setStorageReady] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const active = STATES.find((item) => item.id === state) || STATES[0];

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isSavedTuning(parsed)) setFacetTuning({ ...DEFAULT_LUNA_FACET_TUNING, ...parsed });
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(facetTuning));
  }, [facetTuning, storageReady]);

  const updateFacet = (key: keyof LunaFacetTuning, value: number) => {
    setFacetTuning((current) => ({ ...current, [key]: value }));
    setCopyState("idle");
  };

  const resetFacets = () => {
    setFacetTuning({ ...DEFAULT_LUNA_FACET_TUNING });
    setCopyState("idle");
  };

  const copyFacets = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(facetTuning, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return <main className="luna-demo-page">
    <header className="luna-demo-header"><span className="onboarding-kicker">LUNA · DIAMOND STUDY</span><h1>Shape the ring until it feels right.</h1><p>These 19 controls affect only the diamond row. The constellation stays untouched.</p></header>
    <section className="luna-demo-grid">
      <article className="luna-demo-stage" aria-label="Large Luna avatar preview"><LunaAvatar facetTuning={facetTuning} layer={layer} size={520} state={state} /><div className="luna-demo-state-copy"><span>{layer === "complete" ? active.label : LAYERS.find((item) => item.id === layer)?.label}</span><p>{layer === "complete" ? active.detail : "Use Diamonds only for the clearest view while tuning the shape."}</p></div></article>
      <aside className="luna-demo-controls">
        <section className="luna-demo-control-section"><span className="onboarding-kicker">BEHAVIOR</span><h2>Try Luna’s states</h2><div className="luna-state-options">{STATES.map((option) => <button aria-pressed={state === option.id} className={state === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setState(option.id)}>{option.id === "idle" ? <Pause size={16} /> : <Sparkles size={16} />}<span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div></section>
        <section className="luna-geometry-study"><span className="onboarding-kicker">VIEW</span><div>{LAYERS.map((option) => <button aria-pressed={layer === option.id} className={layer === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setLayer(option.id)}>{option.label}</button>)}</div></section>
        <section className="luna-facet-tuner">
          <div className="luna-tuning-heading"><div><span className="onboarding-kicker">DIAMOND CONTROLS</span><h2>19 live sliders</h2><p>Saved in this browser as you adjust them.</p></div><div className="luna-tuning-actions"><button type="button" onClick={resetFacets}><RotateCcw size={14} />Reset</button><button className="is-primary" type="button" onClick={copyFacets}>{copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}{copyState === "copied" ? "Copied" : "Copy values"}</button></div></div>
          <p className="luna-copy-status" aria-live="polite">{copyState === "failed" ? "Clipboard access failed. Try again from the published page." : "Copy the values when you land on the version you want."}</p>
          <div className="luna-tuning-groups">{FACET_GROUPS.map((group) => <fieldset key={group.title}><legend>{group.title}</legend>{group.controls.map((control) => {
            const inputId = `luna-${control.key}`;
            const value = facetTuning[control.key];
            return <label className="luna-tuning-row" htmlFor={inputId} key={control.key}><span><strong>{control.label}</strong><output htmlFor={inputId}>{formatValue(control, value)}</output></span><input aria-label={control.label} id={inputId} max={control.max} min={control.min} step={control.step} type="range" value={value} onInput={(event) => updateFacet(control.key, Number(event.currentTarget.value))} /></label>;
          })}</fieldset>)}</div>
        </section>
        <section className="luna-scale-study"><span className="onboarding-kicker">SCALE TEST</span><div><span><LunaAvatar facetTuning={facetTuning} size={64} state={state} /><small>64</small></span><span><LunaAvatar facetTuning={facetTuning} size={88} state={state} /><small>88</small></span><span><LunaAvatar facetTuning={facetTuning} size={112} state={state} /><small>112</small></span></div></section>
      </aside>
    </section>
  </main>;
}
