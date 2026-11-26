import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayLessons } from '../schedule/today-lessons-entry.mjs';

test('rejects groups without a schedule group', async () => {
  await assert.rejects(() => getTodayLessons({}, '2026-11-27', async () => []), /не указано расписание/);
});

test('loads seven days and returns only the selected date in time order', async () => {
  const calls = [];
  const lessons = [
    { date: '2026-11-27', subject: 'Поздняя', timeStart: '12:00' },
    { date: '2026-11-28', subject: 'Завтра', timeStart: '09:00' },
    { date: '2026-11-27', subject: 'Ранняя', timeStart: '08:30' },
    { date: '2026-11-27', timeStart: '10:00' }
  ];
  const result = await getTodayLessons({ scheduleGroup: 'group-a' }, '2026-11-27', async (...args) => {
    calls.push(args);
    return lessons;
  });
  assert.deepEqual(calls, [['group-a', 7]]);
  assert.deepEqual(result.map(lesson => lesson.subject), ['Ранняя', 'Поздняя']);
});

test('handles an empty cache result', async () => {
  assert.deepEqual(await getTodayLessons({ scheduleGroup: 'group-a' }, '2026-11-27', async () => null), []);
});
