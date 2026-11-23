import type { ScheduleLesson } from './types.js';

export interface DateRange {
  start: string;
  end: string;
}

export interface WeeklyScheduleResult {
  text: string;
  lessonCount: number;
}

export interface WeeklyScheduleOptions {
  groups: string[];
  range: DateRange;
  loadSchedule(group: string, days: number, startDate: string): Promise<ScheduleLesson[]>;
  logger?: Pick<Console, 'error'>;
}

export function formatSchedule(items: ScheduleLesson[], group: string): string {
  if (!items.length) return 'На ближайшие дни занятий для группы «' + group + '» не найдено.';
  const out: string[] = [];
  let current = '';
  for (const lesson of items) {
    if (lesson.date !== current) {
      current = lesson.date;
      out.push('\n📅 ' + (lesson.date || 'Дата не указана'));
    }
    const lessonTime = lesson.timeStart && lesson.timeEnd
      ? lesson.timeStart + '–' + lesson.timeEnd
      : (lesson.time || '');
    const numberLabel = lesson.lessonNumber ? String(lesson.lessonNumber) + '. ' : '';
    let line = '• ' + numberLabel + (lessonTime ? lessonTime + ' — ' : '') + (lesson.subject || 'Занятие');
    if (lesson.lessonType) line += ' (' + lesson.lessonType + ')';
    if (lesson.teacher) line += '\n   👨‍🏫 ' + lesson.teacher;
    const room = String(lesson.room || '').trim();
    if (room) line += '\n   🚪 Аудитория: ' + room;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Returns the Monday–Sunday calendar week containing the supplied date. */
export function currentMondayDateRange(today: string): DateRange {
  const base = new Date(today + 'T12:00:00Z');
  if (Number.isNaN(base.getTime())) throw new Error('Invalid schedule date: ' + today);
  const daysSinceMonday = (base.getUTCDay() + 6) % 7;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = (date: Date): string => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Returns the next Monday–Sunday publication range, regardless of today's weekday. */
export function nextMondayDateRange(today: string): DateRange {
  const base = new Date(today + 'T12:00:00Z');
  if (Number.isNaN(base.getTime())) throw new Error('Invalid schedule date: ' + today);
  const weekday = base.getUTCDay();
  const daysUntilMonday = (8 - weekday) % 7 || 7;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + daysUntilMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = (date: Date): string => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export function nextWeekDateRange(today: string): DateRange {
  const base = new Date(today + 'T12:00:00Z');
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = (date: Date): string => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function signature(items: ScheduleLesson[]): string {
  return JSON.stringify(items.map(lesson => [
    lesson.date || '', lesson.timeStart || lesson.time || '', lesson.timeEnd || '',
    lesson.subject || '', lesson.teacher || '', lesson.room || ''
  ]));
}

export async function buildWeeklyScheduleText(options: WeeklyScheduleOptions): Promise<WeeklyScheduleResult> {
  const logger = options.logger ?? console;
  const results: Array<{ name: string; lessons: ScheduleLesson[]; error?: unknown }> = [];
  for (const name of options.groups) {
    try {
      const lessons = await options.loadSchedule(name, 7, options.range.start);
      const weekLessons = (lessons || [])
        .filter(lesson => lesson.date >= options.range.start && lesson.date <= options.range.end && lesson.subject)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
          String(a.timeStart || '').localeCompare(String(b.timeStart || '')));
      results.push({ name, lessons: weekLessons });
    } catch (error) {
      logger.error('[weekly schedule] source failed for ' + name + ':', error instanceof Error ? error.message : error);
      results.push({ name, lessons: [], error });
    }
  }

  const lines = [
    '🗓 РАСПИСАНИЕ НА СЛЕДУЮЩУЮ НЕДЕЛЮ',
    '📅 ' + options.range.start + ' — ' + options.range.end,
    ''
  ];
  const same = results.length >= 2 && results.every(result => !result.error) &&
    results.slice(1).every(result => signature(result.lessons) === signature(results[0].lessons));
  if (same) {
    lines.push('👥 Обе учебные группы — расписание совпадает', '');
    lines.push(formatSchedule(results[0].lessons, 'обеих учебных групп'));
  } else {
    for (const result of results) {
      lines.push('👥 ' + result.name);
      lines.push(result.error
        ? '❌ Не удалось загрузить расписание этой учебной группы.'
        : formatSchedule(result.lessons, result.name));
      lines.push('');
    }
  }
  return { text: lines.join('\n').trim(), lessonCount: results.reduce((sum, result) => sum + result.lessons.length, 0) };
}
