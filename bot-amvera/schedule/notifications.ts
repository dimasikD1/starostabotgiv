export interface ScheduleNotificationTarget {
  chatId?: string | number | null;
  scheduleGroup?: string | null;
  title?: string | null;
}

export interface ScheduleChangeSet {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Stable per-chat key used to avoid duplicate weekly schedule publications. */
export function buildWeeklySchedulePublicationKey(chatId: string | number, startDate: string): string {
  return String(chatId) + ':' + String(startDate);
}

/** Group registered chats by the exact schedule group they subscribe to. */
export function groupScheduleTargetsByGroup<T extends ScheduleNotificationTarget>(
  targets: readonly T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const target of targets) {
    if (!target.chatId || !target.scheduleGroup) continue;
    const group = String(target.scheduleGroup).trim();
    if (!group) continue;
    const list = grouped.get(group) || [];
    list.push(target);
    grouped.set(group, list);
  }
  return grouped;
}

/** Return the inclusive end date for the schedule-change monitoring window. */
export function getScheduleChangeMonitorEnd(today: string, days = 7): string {
  const date = new Date(String(today).slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(String(today))) {
    throw new Error('Invalid schedule monitoring start date');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Build the Telegram HTML message for a detected schedule change. */
export function buildScheduleChangeMessage(
  scheduleGroup: string,
  changes: ScheduleChangeSet,
  escapeHtml: (value: string) => string
): string {
  const lines = [
    '🔔 <b>Обнаружены изменения в расписании</b>',
    'Учебная группа: <b>' + escapeHtml(scheduleGroup) + '</b>',
    ''
  ];
  if (changes.added.length) lines.push('<b>Добавлено:</b>', ...changes.added.slice(0, 12).map(escapeHtml), '');
  if (changes.removed.length) lines.push('<b>Убрано:</b>', ...changes.removed.slice(0, 12).map(escapeHtml), '');
  if (changes.changed.length) lines.push('<b>Изменено:</b>', ...changes.changed.slice(0, 12).map(escapeHtml), '');
  lines.push('Проверяй актуальное расписание в боте.');
  return lines.join('\n').slice(0, 3900);
}

export interface ScheduleClockParts {
  year: string;
  month: string;
  day: string;
  hour: string;
}

/** Preserve the existing Sunday-at-or-after-18:00 publication window. */
export function isWeeklySchedulePublicationWindow(parts: ScheduleClockParts): boolean {
  const dateText = parts.year + '-' + parts.month + '-' + parts.day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const date = new Date(dateText + 'T12:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) return false;
  const hour = Number(parts.hour);
  return date.getUTCDay() === 0 && Number.isInteger(hour) && hour >= 18 && hour <= 23;
}

export const WEEKLY_SCHEDULE_CHECK_INTERVAL_MS = 60_000;
export const SCHEDULE_CHANGE_CHECK_INTERVAL_MS = 5 * 60_000;
