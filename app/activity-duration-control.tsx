"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "./icons";

export const DURATION_STEP = 5;

export function normalizeActivityDuration(duration: number) {
  if (!Number.isFinite(duration)) return 15;
  return Math.min(480, Math.max(5, Math.round(duration / DURATION_STEP) * DURATION_STEP));
}

export function ActivityDurationControl({
  inlineMeta,
  item,
  onAdjust,
  onSet,
}: {
  inlineMeta?: ReactNode;
  item: { id: string; title: string; duration: number };
  onAdjust: (delta: number) => void;
  onSet: (value: number) => void;
}) {
  return (
    <div className="duration-control" aria-label={`Length for ${item.title}`}>
      <div className="duration-value">
        <input
          aria-label={`Length for ${item.title} in minutes`}
          inputMode="numeric"
          max="480"
          min="5"
          onBlur={() => onSet(normalizeActivityDuration(item.duration))}
          onChange={(event) => onSet(event.target.valueAsNumber)}
          step={DURATION_STEP}
          style={{ width: `${String(item.duration).length}ch` }}
          type="number"
          value={item.duration}
        />
        <span className="duration-unit">minutes</span>
      </div>
      <div className="duration-adjustments">
        <button disabled={item.duration <= 5} type="button" aria-label={`Reduce ${item.title} by ${DURATION_STEP} minutes`} onClick={() => onAdjust(-DURATION_STEP)}><Minus aria-hidden="true" size={15} /></button>
        <button disabled={item.duration >= 480} type="button" aria-label={`Add ${DURATION_STEP} minutes to ${item.title}`} onClick={() => onAdjust(DURATION_STEP)}><Plus aria-hidden="true" size={15} /></button>
      </div>
      {inlineMeta ? <div className="duration-inline-meta">{inlineMeta}</div> : null}
    </div>
  );
}
