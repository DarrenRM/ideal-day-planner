export const STRENGTH_SET_TYPES = ["working", "warmup", "drop", "failure"] as const;

export type StrengthSetType = typeof STRENGTH_SET_TYPES[number];

export type StrengthSet = {
  id: string;
  ordinal: number;
  type: StrengthSetType;
  load?: string;
  reps: number;
  rir?: number | null;
  completedAt: string;
};

export type StrengthExerciseResult = {
  id: string;
  exerciseId: string;
  name: string;
  sets: StrengthSet[];
};

export type StrengthSession = {
  id: string;
  date: string;
  workoutTitle: string;
  startedAt?: string;
  completedAt?: string;
  note?: string;
  exercises: StrengthExerciseResult[];
};

export type StrengthSessionData = {
  workoutRecordKey: string;
  sessions?: StrengthSession[];
};

export type WorkoutPlanExercise = {
  id: string;
  name: string;
  note?: string;
  targetSets?: number | null;
  targetReps?: string;
  targetLoad?: string;
  restSeconds?: number | null;
};

export type WorkoutPlanData = {
  focus?: string;
  exercises?: WorkoutPlanExercise[];
  openChoices?: Array<{ id: string; label: string; guidance?: string; equipment?: string[] }>;
};

export type WorkoutPhaseProtocolData = {
  workoutRecordKey: string;
  phase: "warmup" | "cooldown";
  summary?: string;
  steps?: Array<{ id: string; label: string; note?: string; completed?: boolean; completedDates?: string[] }>;
};

export function strengthSessionForDate(data: StrengthSessionData, date: string) {
  return data.sessions?.find((session) => session.date === date) ?? null;
}

export function priorStrengthSession(data: StrengthSessionData, date: string) {
  return [...(data.sessions ?? [])]
    .filter((session) => session.date < date && session.exercises.some((exercise) => exercise.sets.length))
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1) ?? null;
}

export function priorExerciseResult(data: StrengthSessionData, exerciseId: string, date: string) {
  return [...(data.sessions ?? [])]
    .filter((session) => session.date < date)
    .sort((left, right) => left.date.localeCompare(right.date))
    .reverse()
    .flatMap((session) => session.exercises.filter((exercise) => exercise.exerciseId === exerciseId))
    .find((exercise) => exercise.sets.length) ?? null;
}

export function strengthSessionProgress(session: StrengthSession | null, plannedExerciseIds: string[]) {
  const performed = session?.exercises ?? [];
  const completedExerciseIds = new Set(performed.filter((exercise) => exercise.sets.length).map((exercise) => exercise.exerciseId));
  return {
    completedExercises: plannedExerciseIds.filter((id) => completedExerciseIds.has(id)).length,
    totalExercises: plannedExerciseIds.length,
    completedSets: performed.reduce((total, exercise) => total + exercise.sets.length, 0),
  };
}

export function summarizeStrengthSets(sets: StrengthSet[]) {
  if (!sets.length) return "No history yet";
  return sets.map((set) => `${set.load || "BW"} × ${set.reps}`).join(" · ");
}

export function summarizeStrengthExerciseSets(sets: StrengthSet[]) {
  if (!sets.length) return "No sets recorded";
  const first = sets[0];
  const sameResult = sets.every((set) => set.reps === first.reps && (set.load || "") === (first.load || ""));
  if (!sameResult) return summarizeStrengthSets(sets);
  return `${sets.length} ${sets.length === 1 ? "set" : "sets"} × ${first.reps} ${first.reps === 1 ? "rep" : "reps"}${first.load ? ` · ${first.load}` : ""}`;
}

export function strengthWeekSummary(data: StrengthSessionData, referenceDate: string) {
  const reference = new Date(`${referenceDate}T12:00:00`);
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - ((reference.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const key = (date: Date) => date.toLocaleDateString("en-CA");
  const sessions = (data.sessions ?? []).filter((session) => session.date >= key(monday) && session.date <= key(sunday));
  return {
    sessions: sessions.filter((session) => session.exercises.some((exercise) => exercise.sets.length)).length,
    sets: sessions.reduce((total, session) => total + session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), 0),
  };
}
