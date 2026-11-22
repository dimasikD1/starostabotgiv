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

export interface LessonAttendanceGroup {
  lessonAttendance?: Record<string, Record<string, unknown>>;
}

export type LessonAttendanceStatus = 'present' | 'absent' | 'unmarked';

/** Update one student's status for one exact lesson without touching other lessons. */
export function setLessonAttendanceStatus(
  group: LessonAttendanceGroup,
  lessonKey: string,
  studentKey: string,
  status: LessonAttendanceStatus
): boolean {
  if (!lessonKey.trim() || !studentKey.trim()) return false;
  if (!['present', 'absent', 'unmarked'].includes(status)) return false;

  group.lessonAttendance ||= {};
  if (status === 'unmarked') {
    const record = group.lessonAttendance[lessonKey];
    if (record) delete record[studentKey];
    return true;
  }

  group.lessonAttendance[lessonKey] ||= {};
  group.lessonAttendance[lessonKey][studentKey] = status;
  return true;
}

export interface AttendancePage<T> {
  items: T[];
  page: number;
  pageCount: number;
  startIndex: number;
  pageSize: number;
}

/** Safely select a page of students, clamping invalid page numbers. */
export function paginateAttendanceStudents<T>(
  students: readonly T[],
  requestedPage: number,
  pageSize = 10
): AttendancePage<T> {
  const safeSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const pageCount = Math.max(1, Math.ceil(students.length / safeSize));
  const numericPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0;
  const page = Math.max(0, Math.min(numericPage, pageCount - 1));
  const startIndex = page * safeSize;
  return {
    items: students.slice(startIndex, startIndex + safeSize),
    page,
    pageCount,
    startIndex,
    pageSize: safeSize
  };
}

/** Resolve a lesson by its visible list index without allowing invalid array access. */
export function getAttendanceLessonAt<T>(
  lessons: readonly T[],
  requestedIndex: number
): T | undefined {
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0) return undefined;
  return lessons[requestedIndex];
}
