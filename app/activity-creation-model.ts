import { isLocalDate, parseCadence, type ScheduleCadence } from "./schedule-model";

export type ActivityCreation = {
  title: string;
  category: string;
  durationMinutes: number;
  cadence: ScheduleCadence;
  effectiveDate: string;
  planRole: "essential" | "extra";
};

export function parseActivityCreation(value: unknown): ActivityCreation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const cadence = parseCadence(v.cadence);
  if (!title || title.length > 60 || typeof v.category !== "string"
    || !["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"].includes(v.category)
    || typeof v.durationMinutes !== "number" || !Number.isInteger(v.durationMinutes)
    || v.durationMinutes < 5 || v.durationMinutes > 480 || !cadence
    || !isLocalDate(v.effectiveDate) || !["essential", "extra"].includes(String(v.planRole))) return null;
  return { title, category: v.category, durationMinutes: v.durationMinutes, cadence,
    effectiveDate: v.effectiveDate, planRole: v.planRole as ActivityCreation["planRole"] };
}
