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
  return <article className={`conversation-clarification ${answered ? "is-answered" : "is-pending"}`}>
    <div className="conversation-clarification-heading">
      <span aria-hidden="true"><MessageCircle size={16} /></span>
      <small>{answered ? "Answered" : "A quick question"}</small>
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
    {!answered && onOther ? <button className="conversation-clarification-other" disabled={busy} type="button" onClick={onOther}>Tell Luna another way</button> : null}
  </article>;
}
