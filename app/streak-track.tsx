"use client";

import { Check, Flame } from "lucide-react";
import { dailyStreakBlocks, streakSteps } from "./streak-model";

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
  const { completedDays, completedWeeks } = dailyStreakBlocks(count, completedToday);
  const waiting = completedToday ? null : completedDays + 1;
  const daySteps = streakSteps(0);
  const weekSteps = streakSteps(completedWeeks);
  return (
    <section className={`activity-streak ${nested ? "product-streak" : "workspace-block"}`} aria-label={ariaLabel}>
      <header className="activity-streak-heading"><span className="workspace-overline">Streak</span><Flame aria-hidden="true" size={16} /></header>
      <div className="streak-track">
        {daySteps.map((number) => {
          const complete = number <= completedDays;
          const isWaiting = number === waiting;
          const latest = complete && number === completedDays;
          return (
            <div className={`streak-step ${complete ? "is-complete" : ""} ${isWaiting ? "is-waiting" : ""} ${latest ? "is-latest" : ""}`} key={number}>
              <span className="streak-dot">{complete ? <Check aria-hidden="true" size={13} strokeWidth={3} /> : null}</span>
              <small>{label} {number}</small>
            </div>
          );
        })}
      </div>
      {completedWeeks > 0 ? <div className="weekly-streak" aria-label={`${completedWeeks} completed consecutive ${completedWeeks === 1 ? "week" : "weeks"}`}>
        <span className="workspace-overline">Weeks</span>
        <div className="weekly-streak-track">
          {weekSteps.map((number) => <div className={`weekly-streak-step ${number <= completedWeeks ? "is-complete" : ""}`} key={number}>
            <span className="weekly-streak-dot">{number <= completedWeeks ? <Check aria-hidden="true" size={9} strokeWidth={3} /> : null}</span>
            <small>W{number}</small>
          </div>)}
        </div>
      </div> : null}
    </section>
  );
}
