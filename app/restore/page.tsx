"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function RestorePage() {
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState<"idle" | "restoring" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("restoring");
    setMessage("");
    try {
      const parsed = JSON.parse(payload) as { items?: unknown; startMinutes?: unknown };
      const response = await fetch(`/api/day?date=${localDateKey()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "restore-template", items: parsed.items, startMinutes: parsed.startMinutes }),
      });
      const result = await response.json() as { items?: unknown[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Restore failed.");
      setStatus("done");
      setMessage(`Restored ${result.items?.length ?? 0} activities to the template and today.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Restore failed.");
    }
  }

  return (
    <main className="restore-page">
      <section className="restore-card">
        <p className="eyebrow">Recovery tool</p>
        <h1>Restore your routine</h1>
        <p>Paste an exported day below. Restoring replaces both your reusable template and today’s schedule.</p>
        <form onSubmit={restore}>
          <label htmlFor="restore-payload">Routine export</label>
          <textarea id="restore-payload" onChange={(event) => setPayload(event.target.value)} placeholder='{"items": [...], "startMinutes": 480}' rows={12} value={payload} />
          <button disabled={!payload.trim() || status === "restoring"} type="submit">{status === "restoring" ? "Restoring…" : "Restore template and today"}</button>
        </form>
        {message ? <p className={`restore-status restore-status-${status}`} role="status">{message}</p> : null}
        {status === "done" ? <Link href="/">Return to your schedule</Link> : null}
      </section>
    </main>
  );
}
