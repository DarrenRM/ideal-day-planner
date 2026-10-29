import { getD1 } from "../../db";
import { canonicalTimeZone, resolveTimeZone } from "../time-zone";
import { REMEMBER_TIME_ZONE, SELECT_USER_TIME_ZONE } from "./time-zone-sql";

export async function userTimeZone(userId: string) {
  const row = await getD1().prepare(SELECT_USER_TIME_ZONE).bind(userId).first<{ timeZone: string | null }>();
  return resolveTimeZone(row?.timeZone);
}

// Saves the zone the browser reported, if it is valid and has changed.
export async function rememberTimeZone(userId: string, value: unknown) {
  const timeZone = canonicalTimeZone(value);
  if (!timeZone) return;
  await getD1().prepare(REMEMBER_TIME_ZONE).bind(timeZone, userId, timeZone).run();
}
