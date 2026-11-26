export interface ScheduledLesson {
  date?: string;
  subject?: string;
  timeStart?: string;
}

/** Select and chronologically order the named day's lessons. */
export function selectLessonsForDate<T extends ScheduledLesson>(lessons: readonly T[], date: string): T[] {
  return lessons
    .filter(lesson => lesson.date === date && Boolean(lesson.subject))
    .sort((a, b) => String(a.timeStart || '').localeCompare(String(b.timeStart || '')));
}
