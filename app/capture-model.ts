export const CAPTURE_TIMINGS = ["unspecified", "today", "tomorrow", "later"] as const;
export const CAPTURE_URGENCIES = ["", "now", "soon", "this_week", "later"] as const;

export type CaptureTiming = typeof CAPTURE_TIMINGS[number];
export type CaptureUrgency = typeof CAPTURE_URGENCIES[number];

export type CaptureAction = {
  op: "capture_open_item";
  activityId: string | null;
  destinationHint: string;
  label: string;
  detail: string;
  urgency: CaptureUrgency;
  timing: CaptureTiming;
  idempotencyKey: string;
};

export type PendingCapture = {
  id: string;
  label: string;
  detail: string;
  urgency: CaptureUrgency;
  status: "pending_destination" | "filed";
  timing: CaptureTiming | "scheduled";
  scheduledDate: string | null;
  activityId: string | null;
  activityClientKey: string | null;
  activityTitle: string | null;
  destinationHint: string;
  createdAt: string;
  updatedAt: string;
};

export type CaptureAttention = {
  captureId: string;
  activityId: string;
  activityClientKey: string;
  activityTitle: string;
  label: string;
  detail: string;
  urgency: CaptureUrgency;
  createdAt: string;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._~-]{0,199}$/;

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function normalizeCaptureLabel(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ").slice(0, 300);
}

export function parseCaptureAction(value: unknown): CaptureAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.op !== "capture_open_item") return null;
  const idempotencyKey = boundedText(source.idempotencyKey, 200);
  const activityId = source.activityId === null || source.activityId === undefined ? null : boundedText(source.activityId, 200);
  const label = boundedText(source.label, 300);
  if (!idempotencyKey || !SAFE_ID.test(idempotencyKey) || !label || !normalizeCaptureLabel(label)) return null;
  if (activityId && !SAFE_ID.test(activityId)) return null;
  const urgency = CAPTURE_URGENCIES.includes(source.urgency as CaptureUrgency) ? source.urgency as CaptureUrgency : "";
  const timing = CAPTURE_TIMINGS.includes(source.timing as CaptureTiming) ? source.timing as CaptureTiming : "unspecified";
  return {
    op: "capture_open_item",
    activityId,
    destinationHint: boundedText(source.destinationHint, 100),
    label,
    detail: boundedText(source.detail, 500),
    urgency,
    timing,
    idempotencyKey,
  };
}

export function validateCaptureActions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((action) => {
    const parsed = parseCaptureAction(action);
    return parsed ? [parsed] : [];
  });
}
