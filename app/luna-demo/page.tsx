"use client";

import { MessageCircle, Pause, Radio, Sparkles } from "lucide-react";
import { useState } from "react";
import { LunaAvatar, type LunaAvatarLayer, type LunaAvatarState } from "../luna-avatar";

const STATES: Array<{ id: LunaAvatarState; label: string; detail: string }> = [
  { id: "idle", label: "At rest", detail: "A slow, quiet breath while Luna is available." },
  { id: "listening", label: "Listening", detail: "A little more energy while the person is speaking." },
  { id: "thinking", label: "Thinking", detail: "Brighter motion while Luna is actively working." },
];

const LAYERS: Array<{ id: LunaAvatarLayer; label: string }> = [
  { id: "complete", label: "Complete" },
  { id: "aperture", label: "Aperture" },
  { id: "facets", label: "Facet ring" },
  { id: "network", label: "Network" },
];

export default function LunaDemoPage() {
  const [state, setState] = useState<LunaAvatarState>("idle");
  const [layer, setLayer] = useState<LunaAvatarLayer>("complete");
  const active = STATES.find((item) => item.id === state) || STATES[0];

  return <main className="luna-demo-page">
    <header className="luna-demo-header"><span className="onboarding-kicker">LUNA · MOTION STUDY</span><h1>A calm presence, not another notification.</h1><p>The avatar breathes gently at rest, becomes more attentive while listening, and gathers energy when Luna is working.</p></header>
    <section className="luna-demo-grid">
      <article className="luna-demo-stage" aria-label="Large Luna avatar preview"><div className="luna-demo-atmosphere" /><LunaAvatar layer={layer} size={420} state={state} /><div className="luna-demo-state-copy"><span>{layer === "complete" ? active.label : LAYERS.find((item) => item.id === layer)?.label}</span><p>{layer === "complete" ? active.detail : "Isolated so the geometry can be evaluated without the other layers."}</p></div></article>
      <aside className="luna-demo-controls"><span className="onboarding-kicker">BEHAVIOR</span><h2>Try Luna’s states</h2><div className="luna-state-options">{STATES.map((option) => <button aria-pressed={state === option.id} className={state === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setState(option.id)}>{option.id === "idle" ? <Pause size={16} /> : option.id === "listening" ? <Radio size={16} /> : <Sparkles size={16} />}<span><strong>{option.label}</strong><small>{option.detail}</small></span></button>)}</div><div className="luna-geometry-study"><span className="onboarding-kicker">GEOMETRY</span><div>{LAYERS.map((option) => <button aria-pressed={layer === option.id} className={layer === option.id ? "is-active" : ""} key={option.id} type="button" onClick={() => setLayer(option.id)}>{option.label}</button>)}</div></div><div className="luna-scale-study"><span className="onboarding-kicker">SCALE TEST</span><div><span><LunaAvatar size={64} state={state} /><small>64</small></span><span><LunaAvatar size={88} state={state} /><small>88</small></span><span><LunaAvatar size={112} state={state} /><small>112</small></span></div></div></aside>
    </section>
    <section className="luna-widget-study"><div><span className="onboarding-kicker">IN CONTEXT</span><h2>The bottom-right assistant</h2><p>The halo stays recognizable at compact sizes and leaves room for a short, useful bubble.</p></div><div className="luna-widget-frame"><div className="luna-widget-bubble"><MessageCircle size={15} /><span><strong>I’m here when you need me.</strong><small>Tap Luna to open Notes & Assistant.</small></span></div><button aria-label="Open Luna" className="luna-widget-button" type="button" onClick={() => setState((current) => current === "thinking" ? "idle" : "thinking")}><LunaAvatar size={112} state={state} /></button></div></section>
  </main>;
}
