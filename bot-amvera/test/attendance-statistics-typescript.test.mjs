import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceStatistics } from '../../.test-build/domain/attendance-statistics.js';

const students = [{ name: 'Аня', telegramId: 1 }, { name: 'Борис', telegramId: 2 }, { name: 'Вера', telegramId: 3 }];
const key = student => student.telegramId || student.name;
const now = Date.parse('2026-11-23T12:00:00.000Z');

test('builds per-lesson counts, rates and newest-first history for present and absent marks', () => {
  const result = buildAttendanceStatistics({
    '2026-11-22|09:00|10:30|Математика': { '1': 'present', '2': 'absent' },
    '2026-11-21|09:00|10:30|История': { '1': 'present', '3': 'present' }
  }, students, [], '2026-11-23', key, now);
  assert.deepEqual(result.historyEntries.map(x => [x.subject, x.present, x.absent, x.marked, x.total, x.rate]), [
    ['Математика', 1, 1, 2, 3, 50],
    ['История', 2, 0, 2, 3, 100]
  ]);
  assert.equal(result.attendanceHistory.month.lessons, 2);
});

test('keeps unmarked students out of marked-rate denominator and returns student summaries', () => {
  const result = buildAttendanceStatistics({
    '2026-11-22|09:00||Математика': { '1': 'present', '2': 'absent' }
  }, students, [{ key: 'today|10:00||Физика' }], '2026-11-23', key, now);
  assert.deepEqual(result.students[0].attendance30d, { present: 1, absent: 0, marked: 1, rate: 100 });
  assert.deepEqual(result.students[1].attendanceBySubject[0], {
    subject: 'Математика', present: 0, absent: 1, marked: 1, rate: 0
  });
  assert.deepEqual(result.students[2].attendance30d, { present: 0, absent: 0, marked: 0, rate: 0 });
  assert.deepEqual(result.students[0].statuses, { 'today|10:00||Физика': 'unmarked' });
});

test('applies the 30-day boundary and excludes future and malformed dates', () => {
  const result = buildAttendanceStatistics({
    '2026-10-24|08:00||Граница': { '1': 'present' },
    '2026-10-23|08:00||Старая': { '1': 'present' },
    '2026-11-24|08:00||Будущая': { '1': 'present' },
    'bad-date|08:00||Ошибка': { '1': 'present' }
  }, students, [], '2026-11-23', key, now);
  assert.deepEqual(result.historyEntries.map(x => x.subject), ['Граница']);
});

test('summarizes last seven days and last thirty days without mutating source records', () => {
  const source = {
    '2026-11-22|09:00||Неделя': { '1': 'present', '2': 'absent' },
    '2026-11-10|09:00||Месяц': { '1': 'present' }
  };
  const before = structuredClone(source);
  const result = buildAttendanceStatistics(source, students, [], '2026-11-23', key, now);
  assert.deepEqual(result.attendanceHistory.week, { lessons: 1, present: 1, absent: 1, marked: 2, rate: 50 });
  assert.deepEqual(result.attendanceHistory.month, { lessons: 2, present: 2, absent: 1, marked: 3, rate: 67 });
  assert.deepEqual(source, before);
});

test('handles an empty roster and empty journal', () => {
  const result = buildAttendanceStatistics({}, [], [], '2026-11-23', key, now);
  assert.deepEqual(result.historyEntries, []);
  assert.deepEqual(result.attendanceHistory.week, { lessons: 0, present: 0, absent: 0, marked: 0, rate: 0 });
  assert.deepEqual(result.students, []);
});

test('preserves legacy fallback key behavior for students without telegram IDs', () => {
  const result = buildAttendanceStatistics({
    '2026-11-22|09:00||Математика': { 'undefined': 'present', 'Студент': 'absent' }
  }, [{ name: 'Студент' }, {}], [], '2026-11-23', key, now);
  assert.deepEqual(result.historyEntries.map(x => [x.present, x.absent]), [[1, 1]]);
});
