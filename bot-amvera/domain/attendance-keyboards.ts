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
