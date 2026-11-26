import { paginateAttendanceStudents } from './attendance-core.js';

export interface AttendanceKeyboardStudent { [key: string]: unknown; }
export interface AttendanceKeyboardGroup {
  students?: readonly AttendanceKeyboardStudent[];
  attendance?: Record<string, Record<string, unknown>>;
}
export interface AttendanceKeyboardButton { text: string; callbackData: string; }
export type AttendanceKeyboardRows = AttendanceKeyboardButton[][];

/** Creates the legacy per-student attendance keyboard data, independent of Telegraf. */
export function buildAttendanceButtons(
  group: AttendanceKeyboardGroup,
  pageInput: unknown,
  today: string,
  getStudentKey: (student: AttendanceKeyboardStudent) => unknown
): AttendanceKeyboardRows {
  const students = group.students || [];
  const size = 10;
  const pages = Math.max(1, Math.ceil(students.length / size));
  const page = Math.max(0, Math.min(Number(pageInput) || 0, pages - 1));
  const rows = students.slice(page * size, (page + 1) * size).map((student, offset) => {
    const index = page * size + offset;
    const status = group.attendance?.[String(getStudentKey(student))]?.[today];
    return [
      { text: (status === 'present' ? '✅ Был' : '▫️ Был') + ' ' + (index + 1), callbackData: 'attmark:' + index + ':present' },
      { text: (status === 'absent' ? '❌ Нет' : '▫️ Нет') + ' ' + (index + 1), callbackData: 'attmark:' + index + ':absent' }
    ];
  });
  const navigation: AttendanceKeyboardButton[] = [];
  if (page > 0) navigation.push({ text: '⬅️', callbackData: 'attpage:' + (page - 1) });
  navigation.push({ text: (page + 1) + '/' + pages, callbackData: 'attsummary' });
  if (page < pages - 1) navigation.push({ text: '➡️', callbackData: 'attpage:' + (page + 1) });
  rows.push(navigation);
  return rows;
}

/** Creates the legacy individual attendance status keyboard data. */
export function buildAttendanceStatusButtons(index: number): AttendanceKeyboardRows {
  return [
    [
      { text: '✅ Был', callbackData: 'attmark:' + index + ':present' },
      { text: '❌ Не был', callbackData: 'attmark:' + index + ':absent' }
    ],
    [{ text: '↩️ Снять отметку', callbackData: 'attmark:' + index + ':clear' }],
    [{ text: '⬅️ К списку', callbackData: 'attback' }]
  ];
}


export interface LessonAttendancePageData {
  items: readonly AttendanceKeyboardStudent[];
  page: number;
  pageCount: number;
  startIndex: number;
}

/** Builds the legacy per-lesson attendance controls, preserving callback payloads. */
export function buildLessonAttendanceButtons(
  pageData: LessonAttendancePageData,
  attendance: Record<string, unknown>,
  getStudentKey: (student: AttendanceKeyboardStudent) => unknown
): AttendanceKeyboardRows {
  const { items, page, pageCount, startIndex } = pageData;
  const rows = items.map((student, offset) => {
    const index = startIndex + offset;
    const status = attendance[String(getStudentKey(student))];
    return [
      { text: (status === 'present' ? '✅ Был' : '▫️ Был') + ' ' + (index + 1), callbackData: 'attpairmark:' + index + ':present' },
      { text: (status === 'absent' ? '❌ Нет' : '▫️ Нет') + ' ' + (index + 1), callbackData: 'attpairmark:' + index + ':absent' }
    ];
  });
  const navigation: AttendanceKeyboardButton[] = [];
  if (page > 0) navigation.push({ text: '⬅️', callbackData: 'attpairpage:' + (page - 1) });
  navigation.push({ text: (page + 1) + '/' + pageCount, callbackData: 'attpairpage:' + page });
  if (page < pageCount - 1) navigation.push({ text: '➡️', callbackData: 'attpairpage:' + (page + 1) });
  rows.push(navigation, [{ text: '↩️ К списку пар', callbackData: 'attpairback' }]);
  return rows;
}

/** Compose pagination and legacy per-lesson controls for one group/lesson. */
export function buildLessonAttendancePageButtons(
  students: readonly AttendanceKeyboardStudent[],
  requestedPage: unknown,
  attendance: Record<string, unknown>,
  getStudentKey: (student: AttendanceKeyboardStudent) => unknown
): AttendanceKeyboardRows {
  const pageData = paginateAttendanceStudents(students, Number(requestedPage) || 0, 10);
  return buildLessonAttendanceButtons(pageData, attendance, getStudentKey);
}
