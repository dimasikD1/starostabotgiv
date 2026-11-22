import type { ScheduleLesson } from './types.js';

export type ScheduleViewResult =
  | { ok: false; reason: 'invalid-group' }
  | { ok: true; group: string; lessons: ScheduleLesson[] };

/** Validate the selected study group and prepare the requested day view. */
export function buildScheduleView(
  selectedGroup: string,
  allowedGroups: readonly string[],
  lessons: readonly ScheduleLesson[],
  dayOffset = 0
): ScheduleViewResult {
  const group = String(selectedGroup || '').trim();
  if (!group || !allowedGroups.includes(group)) return { ok: false, reason: 'invalid-group' };
  const filtered = dayOffset
    ? lessons.filter(lesson => Number(lesson.dayOffset) === dayOffset)
    : [...lessons];
  return {
    ok: true,
    group,
    lessons: filtered.slice().sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.timeStart || '').localeCompare(String(b.timeStart || ''))
    )
  };
}
