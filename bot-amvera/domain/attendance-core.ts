export interface AttendanceLessonKeyInput {
  date?: unknown;
  timeStart?: unknown;
  time?: unknown;
  timeEnd?: unknown;
  subject?: unknown;
}

/** Preserve the exact legacy key format used to store attendance for a lesson. */
export function buildAttendanceLessonKey(
  lesson: AttendanceLessonKeyInput,
  fallbackDate: string
): string {
  return [
    lesson.date || fallbackDate,
    lesson.timeStart || lesson.time || '',
    lesson.timeEnd || '',
    lesson.subject || 'Занятие'
  ].join('|');
}
