import { classifyAttendance } from './attendance-core.js';
import { attendanceKey, studentName } from './user-profile.js';

type AttendanceRecord = Record<string, unknown>;
type AttendanceStatus = 'present' | 'absent' | unknown;

export interface AttendanceReportGroup {
  title?: unknown;
  students?: unknown;
  attendance?: unknown;
  lessonAttendance?: unknown;
}

export type AttendanceReportPeriod = 'week' | 'month' | 'all' | string;

export interface AttendanceReportOptions {
  group: AttendanceReportGroup;
  period?: AttendanceReportPeriod;
  timeZone: string;
  now?: Date;
}

function asRecord(value: unknown): AttendanceRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as AttendanceRecord
    : {};
}

function asStudents(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Build the legacy HTML attendance export without changing its visible format. */
export function createAttendanceHtml({
  group,
  period = 'all',
  timeZone,
  now = new Date()
}: AttendanceReportOptions): string {
  const attendance = asRecord(group.attendance);
  const lessonAttendance = asRecord(group.lessonAttendance);
  const students = asStudents(group.students);
  const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch] ?? ch);
  const labels: Record<string, string> = {
    week: 'за последние 7 дней',
    month: 'за последние 30 дней',
    all: 'за весь период'
  };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const today = parts;
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 0;
  const cutoff = days
    ? new Date(Date.UTC(
        +today.slice(0, 4),
        +today.slice(5, 7) - 1,
        +today.slice(8, 10)
      ) - ((days - 1) * 86400000)).toISOString().slice(0, 10)
    : '';
  const inPeriod = (date: unknown): boolean => !cutoff || String(date) >= cutoff;
  const list = (title: string, items: string[], icon: string): string =>
    '<h3>' + title + ' (' + items.length + ')</h3>' +
    (items.length
      ? '<ul>' + items.map(name => '<li>' + icon + ' ' + esc(name) + '</li>').join('') + '</ul>'
      : '<p>Нет записей</p>');
  const entries = Object.entries(lessonAttendance).map(([key, rawRecord]) => {
    const record = asRecord(rawRecord);
    const [date = '', timeStart = '', timeEnd = '', subject = 'Занятие'] = key.split('|');
    const { present, absent, unmarked } = classifyAttendance(
      students,
      student => record[String(attendanceKey(student))],
      student => studentName(student)
    );
    return {
      date,
      timeStart,
      record,
      html: '<section><h2>' + esc(date) + '</h2><h3>📚 ' + esc(subject) +
        '</h3><p>🕒 ' + esc(timeStart || 'Время не указано') +
        (timeEnd ? '–' + esc(timeEnd) : '') + '</p>' +
        list('Были', present, '✅') + list('Не были', absent, '❌') +
        list('Не отмечены', unmarked, '▫️') + '</section>'
    };
  }).filter(entry => inPeriod(entry.date))
    .sort((a, b) => (a.date + ' ' + a.timeStart).localeCompare(b.date + ' ' + b.timeStart));

  const totals = students.map(student => {
    let present = 0;
    let absent = 0;
    let unmarked = 0;
    for (const entry of entries) {
      const status = entry.record[String(attendanceKey(student))] as AttendanceStatus;
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else unmarked++;
    }
    const marked = present + absent;
    return {
      name: studentName(student),
      present,
      absent,
      unmarked,
      rate: marked ? Math.round(present / marked * 100) : 0
    };
  });

  const summary = '<section><h2>Сводка ' + (labels[period] || labels.all) +
    '</h2><p>Занятий с журналом: <b>' + entries.length + '</b> · Студентов: <b>' +
    students.length + '</b></p><h3>Посещаемость по студентам</h3><div style="overflow-x:auto"><table><thead><tr><th>Студент</th><th>Был</th><th>Не был</th><th>Не отмечен</th><th>Посещаемость</th></tr></thead><tbody>' +
    totals.map(item => '<tr><td>' + esc(item.name) + '</td><td>' + item.present +
      '</td><td>' + item.absent + '</td><td>' + item.unmarked + '</td><td>' +
      item.rate + '%</td></tr>').join('') +
    '</tbody></table></div><p>Процент считается только по занятиям с отметкой «Был» или «Не был».</p></section>';

  let sections = entries.map(entry => entry.html).join('');
  const legacyDates = [...new Set(
    Object.values(attendance).flatMap(value => Object.keys(asRecord(value)))
  )].filter(inPeriod).sort();
  if (legacyDates.length) {
    sections += '<h2>Старые записи (без привязки к паре)</h2>' +
      legacyDates.map(date => {
        const { present, absent, unmarked } = classifyAttendance(
          students,
          student => asRecord(attendance[String(attendanceKey(student))])[date],
          student => studentName(student)
        );
        return '<section><h2>' + esc(date) + '</h2>' +
          list('Были', present, '✅') + list('Не были', absent, '❌') +
          list('Не отмечены', unmarked, '▫️') + '</section>';
      }).join('');
  }
  if (!sections) sections = '<p>За выбранный период сохранённых отметок нет.</p>';

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Посещаемость — ' +
    esc(group.title || 'Группа') +
    '</title><style>body{font:16px/1.5 Arial,sans-serif;max-width:950px;margin:32px auto;padding:0 16px;color:#222}h1,h2{color:#245}section{border-top:1px solid #ddd;padding:12px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}@media print{body{margin:0;max-width:none}}</style></head><body><h1>Журнал посещаемости по парам</h1><p>Группа: <b>' +
    esc(group.title || 'Без названия') + '</b></p><p>Период: <b>' +
    esc(labels[period] || labels.all) + '</b></p><p>Сформировано: ' +
    esc(now.toLocaleString('ru-RU', { timeZone })) + '</p>' + summary + sections +
    '</body></html>';
}
