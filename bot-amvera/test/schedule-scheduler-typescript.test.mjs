import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceScheduleTasks } from '../../.test-build/scheduler.js';

const base = {
  chatId: -100123,
  today: '2026-11-23',
  currentMinutes: 8 * 60 + 30,
  sentLessonNotices: {},
  sentAttendancePolls: {}
};
const lesson = { date: '2026-11-23', timeStart: '09:00', subject: 'Математика', room: '12' };

test('plans a lesson reminder exactly 30 minutes before the start', () => {
  const tasks = buildAttendanceScheduleTasks({ ...base, currentMinutes: 8 * 60 + 30, lessons: [lesson] });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].sendLessonReminder, true);
  assert.equal(tasks[0].sendAttendancePoll, false);
  assert.equal(tasks[0].key, '-100123|2026-11-23|09:00|Математика');
});

test('plans an attendance poll in the legacy -10/-9 minute window', () => {
  const tasks = buildAttendanceScheduleTasks({ ...base, currentMinutes: 8 * 60 + 50, lessons: [lesson] });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].sendLessonReminder, false);
  assert.equal(tasks[0].sendAttendancePoll, true);
});

test('does not repeat already sent reminders or polls', () => {
  const key = '-100123|2026-11-23|09:00|Математика';
  assert.deepEqual(buildAttendanceScheduleTasks({
    ...base, currentMinutes: 8 * 60 + 30, lessons: [lesson], sentLessonNotices: { [key]: 'sent' }
  }), []);
  assert.deepEqual(buildAttendanceScheduleTasks({
    ...base, currentMinutes: 8 * 60 + 50, lessons: [lesson], sentAttendancePolls: { [key]: { pollId: 'x' } }
  }), []);
});

test('ignores other dates, malformed times and invalid clock values', () => {
  const tasks = buildAttendanceScheduleTasks({
    ...base,
    currentMinutes: 8 * 60 + 30,
    lessons: [
      { ...lesson, date: '2026-11-24' },
      { ...lesson, timeStart: '9am' },
      { ...lesson, timeStart: '25:00' },
      { ...lesson, timeStart: '09:99' }
    ]
  });
  assert.deepEqual(tasks, []);
});

test('does not schedule outside the exact minute windows', () => {
  assert.deepEqual(buildAttendanceScheduleTasks({
    ...base, currentMinutes: 8 * 60 + 29, lessons: [lesson]
  }), []);
  assert.deepEqual(buildAttendanceScheduleTasks({
    ...base, currentMinutes: 8 * 60 + 40, lessons: [lesson]
  }), []);
});
