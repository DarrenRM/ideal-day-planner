"use client";

import { Check, Flame } from "lucide-react";
import { streakSteps } from "./streak-model";

export function StreakTrack({
  ariaLabel,
  count,
  completedToday,
  label = "Day",
  nested = false,
}: {
  ariaLabel: string;
  count: number;
  completedToday: boolean;
  label?: "Day" | "Use";
  nested?: boolean;
}) {
  const waiting = completedToday ? null : count + 1;
  return (
    <section className={`activity-streak ${nested ? "product-streak" : "workspace-block"}`} aria-label={ariaLabel}>
      <header className="activity-streak-heading"><span className="workspace-overline">Streak</span><Flame aria-hidden="true" size={16} /></header>
      <div className="streak-track">
        {streakSteps(count).map((number) => {
          const complete = number <= count;
          const isWaiting = number === waiting;
          const latest = complete && number === count;
          return (
            <div className={`streak-step ${complete ? "is-complete" : ""} ${isWaiting ? "is-waiting" : ""} ${latest ? "is-latest" : ""}`} key={number}>
              <span className="streak-dot">{complete ? <Check aria-hidden="true" size={13} strokeWidth={3} /> : null}</span>
              <small>{label} {number}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
