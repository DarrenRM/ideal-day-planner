"use client";

import type { CSSProperties, ReactNode } from "react";
import type { WorkReceiptKind } from "./work-receipt-model";

export type ConversationWorkReceiptData = {
  id: string;
  kind: WorkReceiptKind;
  title: string;
  viewedAt: string | null;
  createdAt: string;
};

export const WORK_RECEIPT_LABELS: Record<WorkReceiptKind, string> = {
  activity_update: "Activity updated",
  schedule_update: "Schedule updated",
  subject_move: "Activity moved",
  check_in: "Check-in scheduled",
};

export function ConversationWorkReceipt({
  artifact,
  color,
  icon,
  timestamp,
  onView,
  viewDisabled = false,
  viewLabel = "View",
}: {
  artifact: ConversationWorkReceiptData;
  color?: string;
  icon: ReactNode;
  timestamp?: string;
  onView?: (origin?: DOMRect) => void;
  viewDisabled?: boolean;
  viewLabel?: string;
}) {
  return (
    <div className="conversation-work-receipt-entry" style={color ? { "--item-color": color } as CSSProperties : undefined}>
      <article className={`conversation-work-receipt ${artifact.viewedAt ? "is-viewed" : "is-new"} ${onView ? "has-view-action" : ""}`}>
        <span className="conversation-work-receipt-icon" aria-hidden="true">{icon}</span>
        <span className="conversation-work-receipt-copy">
          <strong>{WORK_RECEIPT_LABELS[artifact.kind]}</strong>
          <span className="conversation-work-receipt-detail">{artifact.title}</span>
        </span>
        {onView ? (
          <span className="conversation-work-receipt-action">
            <button
              aria-label={`View ${artifact.title}`}
              disabled={viewDisabled}
              type="button"
              onClick={(event) => onView(event.currentTarget.closest("article")?.getBoundingClientRect())}
            >{viewLabel}</button>
          </span>
        ) : null}
      </article>
      {timestamp ? <div className="conversation-work-receipt-meta"><time>{timestamp}</time></div> : null}
    </div>
  );
}
