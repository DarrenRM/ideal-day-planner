"use client";

import { Check, MessageCircle } from "./icons";
import type { ConversationClarification, ConversationClarificationOption } from "./conversation-clarification-model";

export function ConversationClarificationCard({ clarification, busy, onChoose, onOther }: {
  clarification: ConversationClarification;
  busy: boolean;
  onChoose: (option: ConversationClarificationOption) => void;
  onOther?: () => void;
}) {
  const answered = clarification.status === "answered";
  const answeredDate = clarification.answeredAt
    ? new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(clarification.answeredAt) ? clarification.answeredAt : `${clarification.answeredAt.replace(" ", "T")}Z`)
    : null;
  return <article className={`conversation-clarification ${answered ? "is-answered" : "is-pending"}`}>
    <div className="conversation-clarification-heading">
      <span aria-hidden="true"><MessageCircle size={16} /></span>
      <small>{answered ? "Option selected" : "A quick question"}</small>
    </div>
    <h3>{clarification.body}</h3>
    <div className="conversation-clarification-options">
      {clarification.options.map((option) => {
        const selected = clarification.selectedOptionId === option.id;
        return <button aria-pressed={selected} className={selected ? "is-selected" : ""} disabled={busy || answered} key={option.id} type="button" onClick={() => onChoose(option)}>
          <span>{selected ? <Check aria-hidden="true" size={14} /> : null}</span>
          <span><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
        </button>;
      })}
    </div>
    {answered && answeredDate && !Number.isNaN(answeredDate.getTime()) ? <time className="message-meta" dateTime={answeredDate.toISOString()} suppressHydrationWarning>{answeredDate.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time> : null}
    {!answered && onOther ? <button className="conversation-clarification-other" disabled={busy} type="button" onClick={onOther}>Tell Luna another way</button> : null}
  </article>;
}
