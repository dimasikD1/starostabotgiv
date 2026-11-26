import { buildAttendanceButtons, buildAttendanceStatusButtons, buildLessonAttendancePageButtons } from './attendance-keyboards.js';
import { buildAttendanceLessonChoices } from './attendance-lesson-choices.js';

export interface AttendanceButtonGroup {
  students?: readonly { [key: string]: unknown }[];
  attendance?: Record<string, Record<string, unknown>>;
  lessonAttendance?: Record<string, Record<string, unknown>>;
}
export interface AttendanceButtonDescriptor { text: string; callbackData: string; }
export type AttendanceButtonRows = AttendanceButtonDescriptor[][];

/** Compose the legacy daily attendance controls using typed domain button builders. */
export function buildDailyAttendanceKeyboard(
  group: AttendanceButtonGroup,
  page: number,
  today: string,
  getStudentKey: (student: { [key: string]: unknown }) => unknown
): AttendanceButtonRows {
  return buildAttendanceButtons(group, page, today, getStudentKey);
}
export function buildAttendanceStatusKeyboard(index: number): AttendanceButtonRows {
  return buildAttendanceStatusButtons(index);
}
export function buildAttendanceLessonPicker(lessons: readonly { timeStart?: unknown; timeEnd?: unknown; subject?: unknown }[]): AttendanceButtonRows {
  return buildAttendanceLessonChoices(lessons);
}
export function buildPerLessonAttendanceKeyboard(
  students: readonly { [key: string]: unknown }[],
  page: number,
  record: Record<string, unknown>,
  getStudentKey: (student: { [key: string]: unknown }) => unknown
): AttendanceButtonRows {
  return buildLessonAttendancePageButtons(students, page, record, getStudentKey);
}
