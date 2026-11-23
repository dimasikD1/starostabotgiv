export interface AttendanceStatisticsStudentInput {
  [key: string]: unknown;
}

export interface AttendanceStatisticsEntry {
  key: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  subject: string;
  present: number;
  absent: number;
  marked: number;
  total: number;
  rate: number;
}

export interface AttendanceStatisticsStudent {
  index: number;
  attendanceBySubject: Array<{
    subject: string;
    present: number;
    absent: number;
    marked: number;
    rate: number;
  }>;
  statuses: Record<string, unknown>;
  attendance30d: { present: number; absent: number; marked: number; rate: number };
  attendanceHistory: Array<{
    date: string;
    timeStart: string;
    subject: string;
    status: 'present' | 'absent';
  }>;
}

export interface AttendanceStatisticsResult {
  historyEntries: AttendanceStatisticsEntry[];
  attendanceHistory: {
    week: { lessons: number; present: number; absent: number; marked: number; rate: number };
    month: { lessons: number; present: number; absent: number; marked: number; rate: number };
    recent: AttendanceStatisticsEntry[];
  };
  students: AttendanceStatisticsStudent[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function roundedRate(present: number, marked: number): number {
  return marked ? Math.round(present / marked * 100) : 0;
}

/** Reproduce the legacy Mini App attendance history and per-student summaries. */
export function buildAttendanceStatistics(
  attendanceInput: unknown,
  studentsInput: unknown,
  currentLessonsInput: unknown,
  today: string,
  getAttendanceKey: (student: unknown) => unknown,
  nowMs = Date.now()
): AttendanceStatisticsResult {
  const attendance = asRecord(attendanceInput);
  const students = Array.isArray(studentsInput) ? studentsInput : [];
  const currentLessons = Array.isArray(currentLessonsInput) ? currentLessonsInput : [];
  const historyCutoff = new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10);

  const historyEntries = Object.entries(attendance).flatMap(([key, value]): AttendanceStatisticsEntry[] => {
    const [date = '', timeStart = '', timeEnd = '', subject = 'Занятие'] = key.split('|');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || date > today || date < historyCutoff) return [];
    const record = asRecord(value);
    let present = 0;
    let absent = 0;
    for (const student of students) {
      const status = record[String(getAttendanceKey(student))];
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
    }
    const marked = present + absent;
    return [{
      key, date, timeStart, timeEnd, subject, present, absent, marked,
      total: students.length,
      rate: roundedRate(present, marked)
    }];
  }).sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    String(b.timeStart).localeCompare(String(a.timeStart))
  );

  const summarizeHistory = (days: number) => {
    const cutoff = new Date(nowMs - days * 86400000).toISOString().slice(0, 10);
    const entries = historyEntries.filter(entry => entry.date >= cutoff);
    const present = entries.reduce((total, entry) => total + entry.present, 0);
    const absent = entries.reduce((total, entry) => total + entry.absent, 0);
    const marked = present + absent;
    return { lessons: entries.length, present, absent, marked, rate: roundedRate(present, marked) };
  };

  const studentStatistics = students.map((student, index): AttendanceStatisticsStudent => {
    const key = String(getAttendanceKey(student));
    const attendance30d = { present: 0, absent: 0, marked: 0, rate: 0 };
    const bySubject = new Map<string, { subject: string; present: number; absent: number; marked: number; rate: number }>();

    for (const entry of historyEntries) {
      const status = asRecord(attendance[entry.key])[key];
      if (status === 'present') attendance30d.present++;
      else if (status === 'absent') attendance30d.absent++;

      if (status === 'present' || status === 'absent') {
        const subject = String(entry.subject || 'Занятие').trim() || 'Занятие';
        let summary = bySubject.get(subject);
        if (!summary) {
          summary = { subject, present: 0, absent: 0, marked: 0, rate: 0 };
          bySubject.set(subject, summary);
        }
        summary[status]++;
      }
    }

    attendance30d.marked = attendance30d.present + attendance30d.absent;
    attendance30d.rate = roundedRate(attendance30d.present, attendance30d.marked);
    const attendanceBySubject = [...bySubject.values()].map(summary => {
      summary.marked = summary.present + summary.absent;
      summary.rate = roundedRate(summary.present, summary.marked);
      return summary;
    }).sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));

    const statuses = Object.fromEntries(currentLessons.map(lessonValue => {
      const lesson = asRecord(lessonValue);
      const lessonKey = String(lesson.key || '');
      return [lessonKey, asRecord(attendance[lessonKey])[key] || 'unmarked'];
    }));

    const attendanceHistory = historyEntries.flatMap(entry => {
      const status = asRecord(attendance[entry.key])[key];
      return status === 'present' || status === 'absent'
        ? [{ date: entry.date, timeStart: entry.timeStart, subject: entry.subject, status }]
        : [];
    });

    return { index, attendanceBySubject, statuses, attendance30d, attendanceHistory };
  });

  return {
    historyEntries,
    attendanceHistory: {
      week: summarizeHistory(7),
      month: summarizeHistory(30),
      recent: historyEntries.slice(0, 12)
    },
    students: studentStatistics
  };
}
