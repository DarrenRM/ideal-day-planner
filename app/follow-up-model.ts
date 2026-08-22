export type FollowUpStatus = "pending" | "due" | "asked" | "completed" | "dismissed";

export type ActivityFollowUp = {
  id: string;
  key: string;
  title: string;
  question: string;
  dueDate: string;
  status: FollowUpStatus;
  inferred: boolean;
  createdAt: string;
  askedAt: string | null;
};

export type FollowUpAction =
  | { op: "upsert"; key: string; title: string; question: string; dueDate: string; inferred: boolean }
  | { op: "complete"; key: string }
  | { op: "dismiss"; key: string };

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateSerial(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function compareLocalDates(left: string, right: string) {
  return dateSerial(left) - dateSerial(right);
}

function addLocalDays(value: string, amount: number) {
  const date = new Date((dateSerial(value) + amount) * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maximum ? result : null;
}

export function validateFollowUpActions(value: unknown, localDate: string): FollowUpAction[] {
  if (!Array.isArray(value) || !isLocalDate(localDate)) return [];
  const latestAllowedDate = addLocalDays(localDate, 366);
  const actions: FollowUpAction[] = [];
  const seen = new Set<string>();

  for (const candidate of value.slice(0, 12)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const source = candidate as Record<string, unknown>;
    const op = source.op;
    const key = boundedText(source.key, 120);
    if (!key || !/^[a-z0-9][a-z0-9-]*$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    if (op === "complete" || op === "dismiss") {
      actions.push({ op, key });
      continue;
    }
    if (op !== "upsert") continue;
    const title = boundedText(source.title, 100);
    const question = boundedText(source.question, 360);
    const dueDate = isLocalDate(source.dueDate) ? source.dueDate : null;
    if (!title || !question || !dueDate) continue;
    if (compareLocalDates(dueDate, localDate) < 0 || compareLocalDates(dueDate, latestAllowedDate) > 0) continue;
    actions.push({ op, key, title, question, dueDate, inferred: source.inferred === true });
  }
  return actions;
}
