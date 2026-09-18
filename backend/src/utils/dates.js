// Streaks and activity are counted in the machine's local time zone.
export const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: LOCAL_TIME_ZONE }).format(date);
}

export function shiftDayKey(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// `days`: iterable of YYYY-MM-DD strings with activity.
export function computeStreaks(days) {
  const active = new Set(days);
  const today = dayKey();

  let cursor = active.has(today) ? today : shiftDayKey(today, -1);
  let current = 0;
  while (active.has(cursor)) {
    current++;
    cursor = shiftDayKey(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of [...active].sort()) {
    run = previous && shiftDayKey(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  return { current, longest };
}
