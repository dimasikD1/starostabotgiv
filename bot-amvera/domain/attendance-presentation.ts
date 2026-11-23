import { classifyAttendance } from './attendance-core.js';

export interface AttendancePresentationStudent {
  [key: string]: unknown;
}

export interface AttendancePresentationGroup {
  title?: unknown;
  students?: readonly AttendancePresentationStudent[] | readonly unknown[];
  attendance?: Record<string, Record<string, unknown>>;
  lessonAttendance?: Record<string, Record<string, unknown>>;
}

export interface AttendancePresentationLesson {
  date?: unknown;
  timeStart?: unknown;
  timeEnd?: unknown;
  subject?: unknown;
  room?: unknown;
}

export interface AttendancePresentationOptions {
  today: string;
  getStudentKey(student: unknown): unknown;
  getStudentName(student: unknown): string;
  escapeHtml(value: unknown): string;
}

function numbered(values: readonly string[]): string {
  return values.length ? values.map((value, index) => (index + 1) + '. ' + value).join('\\n') : '—';
}

function attendanceBuckets(
  students: readonly unknown[],
  record: Record<string, unknown>,
  options: AttendancePresentationOptions
) {
  return classifyAttendance(
    students,
    student => record[String(options.getStudentKey(student))],
    student => options.escapeHtml(options.getStudentName(student))
  );
}

/** Format the legacy daily attendance summary without Telegram dependencies. */
export function formatDailyAttendance(
  group: AttendancePresentationGroup,
  options: AttendancePresentationOptions
): string {
  const students = group.students || [];
  const attendance = group.attendance || {};
  if (!students.length) return '📋 <b>Посещаемость</b>\\n\\nСписок группы пуст. Добавь студентов командой /student.';
  const { present, absent, unmarked } = attendanceBuckets(
    students, attendance, options
  );
  return '📋 <b>Посещаемость за ' + options.today + '</b>\\n' +
    '👥 <b>' + options.escapeHtml(group.title || 'Группа') + '</b>\\n\\n' +
    '👨‍🎓 Всего: <b>' + students.length + '</b>\\n\\n' +
    '✅ <b>Были (' + present.length + ')</b>\\n' + numbered(present) + '\\n\\n' +
    '❌ <b>Не были (' + absent.length + ')</b>\\n' + numbered(absent) +
    (unmarked.length ? '\\n\\n▫️ <b>Не отмечены (' + unmarked.length + ')</b>\\n' + numbered(unmarked) : '');
}

/** Format attendance for one lesson, preserving the existing Telegram HTML layout. */
export function formatSingleLessonAttendance(
  group: AttendancePresentationGroup,
  lesson: AttendancePresentationLesson,
  lessonKey: string,
  options: AttendancePresentationOptions
): string {
  const students = group.students || [];
  const record = group.lessonAttendance?.[lessonKey] || {};
  const { present, absent, unmarked } = attendanceBuckets(students, record, options);
  const time = lesson.timeStart
    ? String(lesson.timeStart) + (lesson.timeEnd ? '–' + String(lesson.timeEnd) : '')
    : 'Время не указано';
  return '📋 <b>Посещаемость пары</b>\\n📅 ' + String(lesson.date || '') + ' · ' + time +
    '\\n📚 <b>' + options.escapeHtml(lesson.subject || 'Занятие') + '</b>' +
    (lesson.room ? '\\n🚪 Аудитория: ' + options.escapeHtml(lesson.room) : '') +
    '\\n\\n👨‍🎓 Всего: <b>' + students.length + '</b>\\n\\n' +
    '✅ <b>Были (' + present.length + ')</b>\\n' + numbered(present) +
    '\\n\\n❌ <b>Не были (' + absent.length + ')</b>\\n' + numbered(absent) +
    (unmarked.length ? '\\n\\n▫️ <b>Не отмечены (' + unmarked.length + ')</b>\\n' + numbered(unmarked) : '');
}
