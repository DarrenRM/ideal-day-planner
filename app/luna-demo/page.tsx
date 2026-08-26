"use client";

import { Check, Copy, Pause, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_LUNA_FACET_TUNING,
  DEFAULT_LUNA_MOTION_TUNING,
  LunaAvatar,
  type LunaAvatarLayer,
  type LunaAvatarState,
  type LunaMotionTuning,
} from "../luna-avatar";

const STATES: Array<{ id: LunaAvatarState; label: string; detail: string }> = [
  { id: "idle", label: "Idle", detail: "A slow whole-ring breath while Luna is available." },
  { id: "thinking", label: "Thinking", detail: "A faster pulse with a more active constellation." },
];

const LAYERS: Array<{ id: LunaAvatarLayer; label: string }> = [
  { id: "complete", label: "Complete" },
  { id: "facets", label: "Diamonds" },
  { id: "network", label: "Constellation" },
];

type MotionControl = {
  key: keyof LunaMotionTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  format?: "percent" | "multiplier" | "seconds";
};

const MOTION_GROUPS: Array<{ title: string; detail: string; controls: MotionControl[] }> = [
  {
    title: "Idle mode",
    detail: "The complete halo contracts toward the center without changing its overlaps.",
    controls: [
      { key: "idleBreathDepth", label: "Whole-ring contraction", min: .02, max: .14, step: .005, decimals: 1, format: "percent" },
      { key: "idleBreathPeriod", label: "Breath cycle", min: 3.5, max: 10, step: .1, decimals: 1, format: "seconds" },
    ],
  },
  {
    title: "Thinking mode",
    detail: "Thinking accelerates the breath and palette while increasing constellation activity.",
    controls: [
      { key: "thinkingBreathDepth", label: "Whole-ring contraction", min: .03, max: .18, step: .005, decimals: 1, format: "percent" },
      { key: "thinkingBreathPeriod", label: "Pulse cycle", min: 1.5, max: 6, step: .1, decimals: 1, format: "seconds" },
      { key: "thinkingFieldActivity", label: "Constellation activity", min: 1, max: 3, step: .05, decimals: 2, format: "multiplier" },
    ],
  },
];

const STORAGE_KEY = "ideal-day-luna-mode-tuning-v1";

function isSavedMotionTuning(value: unknown): value is Partial<LunaMotionTuning> {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).every(([key, entry]) => key in DEFAULT_LUNA_MOTION_TUNING && typeof entry === "number" && Number.isFinite(entry));
}

function formatValue(control: MotionControl, value: number) {
  if (control.format === "percent") return `${(value * 100).toFixed(control.decimals ?? 0)}%`;
  if (control.format === "multiplier") return `${value.toFixed(control.decimals ?? 2)}×`;
  if (control.format === "seconds") return `${value.toFixed(control.decimals ?? 1)}s`;
  return value.toFixed(control.decimals ?? 0);
}

export default function LunaDemoPage() {
  const [state, setState] = useState<LunaAvatarState>("idle");
  const [layer, setLayer] = useState<LunaAvatarLayer>("complete");
  const [motionTuning, setMotionTuning] = useState<LunaMotionTuning>({ ...DEFAULT_LUNA_MOTION_TUNING });
  const [storageReady, setStorageReady] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const active = STATES.find((item) => item.id === state) || STATES[0];

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isSavedMotionTuning(parsed)) setMotionTuning({ ...DEFAULT_LUNA_MOTION_TUNING, ...parsed });
        }
      } catch {
        // The mode study remains usable when local preferences are unavailable.
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(motionTuning));
    } catch {
      // Browser storage is only a convenience for the tuning lab.
    }
  }, [motionTuning, storageReady]);

  const updateMotion = (key: keyof LunaMotionTuning, value: number) => {
    setMotionTuning((current) => ({ ...current, [key]: value }));
    setCopyState("idle");
  };

  const resetModes = () => {
    setMotionTuning({ ...DEFAULT_LUNA_MOTION_TUNING });
    setCopyState("idle");
  };

  const copyModes = async () => {
    const settings = {
      lunaModes: {
        idle: {
          breathDepth: motionTuning.idleBreathDepth,
          breathPeriod: motionTuning.idleBreathPeriod,
          colorRotationSpeed: DEFAULT_LUNA_FACET_TUNING.colorRotationSpeed,
        },
        thinking: {
          breathDepth: motionTuning.thinkingBreathDepth,
          breathPeriod: motionTuning.thinkingBreathPeriod,
          constellationActivity: motionTuning.thinkingFieldActivity,
          colorRotationSpeed: DEFAULT_LUNA_FACET_TUNING.colorRotationSpeed * 2,
        },
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return <main className="luna-demo-page">
    <header className="luna-demo-header"><span className="onboarding-kicker">LUNA · MOTION STUDY</span><h1>Tune how Luna rests and thinks.</h1><p>The approved two-row geometry is locked. This study now focuses on whole-ring breathing, constellation activity, and behavior at small sizes.</p></header>
    <section className="luna-demo-grid">
      <article className="luna-demo-stage" aria-label="Large Luna avatar preview"><LunaAvatar layer={layer} motionTuning={motionTuning} size={520} state={state} /><div className="luna-demo-state-copy"><span>{active.label}</span><p>{active.detail}</p></div></article>
      <aside className="luna-demo-controls">
        <section className="luna-demo-control-section"><span className="onboarding-kicker">MODE</span><h2>Compare Luna’s states</h2><div className="luna-state-options">{STATES.map((option) => <button aria-pressed={state === option.id} className={state === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setState(option.id)}>{option.id === "idle" ? <Pause size={16} /> : <Sparkles size={16} />}<span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div></section>
        <section className="luna-geometry-study"><span className="onboarding-kicker">VIEW</span><div className="luna-layer-options">{LAYERS.map((option) => <button aria-pressed={layer === option.id} className={layer === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setLayer(option.id)}>{option.label}</button>)}</div></section>
        <section className="luna-facet-tuner luna-mode-tuner">
          <div className="luna-tuning-heading"><div><span className="onboarding-kicker">MODE CONTROLS</span><h2>5 live sliders</h2><p>Thinking always rotates both the ring and constellation colors at twice idle speed.</p></div><div className="luna-tuning-actions"><button type="button" onClick={resetModes}><RotateCcw size={14} />Reset</button><button className="is-primary" type="button" onClick={copyModes}>{copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}{copyState === "copied" ? "Copied" : "Copy modes"}</button></div></div>
          <p className="luna-copy-status" aria-live="polite">{copyState === "failed" ? "Clipboard access failed. Try again from the published page." : copyState === "copied" ? "Mode settings are ready to paste back into chat." : "Copies only the idle and thinking motion settings."}</p>
          <div className="luna-tuning-groups">{MOTION_GROUPS.map((group) => <fieldset key={group.title}><legend>{group.title}</legend><p className="luna-mode-group-detail">{group.detail}</p>{group.controls.map((control) => {
            const inputId = `luna-mode-${control.key}`;
            const value = motionTuning[control.key];
            return <label className="luna-tuning-row" htmlFor={inputId} key={control.key}><span><strong>{control.label}</strong><output htmlFor={inputId}>{formatValue(control, value)}</output></span><input aria-label={control.label} id={inputId} max={control.max} min={control.min} step={control.step} type="range" value={value} onInput={(event) => updateMotion(control.key, Number(event.currentTarget.value))} /></label>;
          })}</fieldset>)}</div>
        </section>
        <section className="luna-scale-study luna-two-mode-scale"><span className="onboarding-kicker">SCALE TESTS</span>{STATES.map((mode) => <div className="luna-scale-mode" key={mode.id}><header><strong>{mode.label}</strong><small>{mode.id === "thinking" ? "2× color rotation · active field" : "Base color rotation · quiet field"}</small></header><div className="luna-scale-row"><span><LunaAvatar motionTuning={motionTuning} size={64} state={mode.id} /><small>64</small></span><span><LunaAvatar motionTuning={motionTuning} size={88} state={mode.id} /><small>88</small></span><span><LunaAvatar motionTuning={motionTuning} size={112} state={mode.id} /><small>112</small></span></div></div>)}</section>
      </aside>
    </section>
  </main>;
}
