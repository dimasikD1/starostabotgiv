import type { ScheduleLesson } from './types.js';
import type { DateRange } from './presentation.js';

export type ScheduleViewResult =
  | { ok: false; reason: 'invalid-group' }
  | { ok: true; group: string; lessons: ScheduleLesson[] };

/** Validate the selected study group and prepare the requested day view. */
export function buildScheduleView(
  selectedGroup: string,
  allowedGroups: readonly string[],
  lessons: readonly ScheduleLesson[],
  dayOffset = 0,
  range?: DateRange
): ScheduleViewResult {
  const group = String(selectedGroup || '').trim();
  if (!group || !allowedGroups.includes(group)) return { ok: false, reason: 'invalid-group' };
  const filtered = range
    ? lessons.filter(lesson => lesson.date >= range.start && lesson.date <= range.end)
    : dayOffset
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

export type ScheduleGroupResolution =
  | { ok: true; group: string }
  | { ok: false; reason: 'missing' | 'unknown' };

/** Resolve /setgroup input against exact configured schedule group names. */
export function resolveScheduleGroupName(
  requested: string,
  availableGroups: readonly string[]
): ScheduleGroupResolution {
  const value = String(requested || '').trim();
  if (!value) return { ok: false, reason: 'missing' };
  const group = availableGroups.find(name => String(name || '').trim() === value);
  return group ? { ok: true, group } : { ok: false, reason: 'unknown' };
}

/** Extract the group name from a Telegram /setgroup command, including bot mentions. */
export function parseSetScheduleGroupArgument(messageText: unknown): string {
  return String(messageText ?? '').replace(/^\/setgroup(?:@\S+)?/i, '').trim();
}
