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

export interface AttendanceBuckets<T> {
  present: T[];
  absent: T[];
  unmarked: T[];
}

/** Classify students while preserving source order and treating unknown values as unmarked. */
export function classifyAttendance<T, R>(
  students: readonly T[],
  getStatus: (student: T) => unknown,
  getValue: (student: T) => R
): AttendanceBuckets<R> {
  const result: AttendanceBuckets<R> = { present: [], absent: [], unmarked: [] };
  for (const student of students) {
    const value = getValue(student);
    const status = getStatus(student);
    if (status === 'present') result.present.push(value);
    else if (status === 'absent') result.absent.push(value);
    else result.unmarked.push(value);
  }
  return result;
}
