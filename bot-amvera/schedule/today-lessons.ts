import { selectLessonsForDate, type ScheduledLesson } from './lessons-for-date.js';

export interface ScheduleGroup {
  scheduleGroup?: string | null;
}

export async function getTodayLessons<T extends ScheduledLesson>(
  group: ScheduleGroup | null | undefined,
  today: string,
  loadSchedule: (scheduleGroup: string, days: number) => Promise<readonly T[] | null | undefined>
): Promise<T[]> {
  if (!group?.scheduleGroup) {
    throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
  }

  const lessons = await loadSchedule(String(group.scheduleGroup), 7);
  return selectLessonsForDate(lessons || [], today);
}
