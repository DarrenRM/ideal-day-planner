function localDateParts(date: Date) {
  return {
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

export function formatActivityRecordDate(value: string | undefined, today = new Date()) {
  const source = value?.trim();
  if (!source) return "Recent";

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(source);
  if (Number.isNaN(date.getTime())) return source;

  const current = localDateParts(today);
  const entry = localDateParts(date);
  if (entry.year === current.year && entry.month === current.month && entry.day === current.day) return "Today";

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    ...(entry.year === current.year ? {} : { year: "numeric" }),
  });
}
