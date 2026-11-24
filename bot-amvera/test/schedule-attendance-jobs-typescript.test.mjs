import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendancePollRunner } from '../../.test-build/attendance-jobs.js';

const lesson = { date: '2026-11-24', timeStart: '09:00', subject: 'Математика', room: '12' };
function dependencies(overrides = {}) {
  const sentLessonNotices = {};
  const sentAttendancePolls = {};
  const calls = [];
  return {
    deps: {
      groups: [{ chatId: -1001, title: 'Группа', scheduleGroup: 'БИ(ЭБ)2' }],
      today: '2026-11-24',
      currentMinutes: 8 * 60 + 30,
      loadSchedule: async () => [lesson],
      sendMessage: async (...args) => { calls.push(['message', ...args]); },
      sendPoll: async (...args) => { calls.push(['poll', ...args]); return 'poll-1'; },
      escapeHtml: value => value,
      getLessonKey: () => 'lesson-key',
      sentLessonNotices,
      sentAttendancePolls,
      save: () => calls.push(['save']),
      nowIso: () => '2026-11-24T05:30:00.000Z',
      log: (...args) => calls.push(['log', ...args]),
      error: (...args) => calls.push(['error', ...args]),
      ...overrides
    },
    calls,
    sentLessonNotices,
    sentAttendancePolls
  };
}

test('runs reminder and persists its sent marker', async () => {
  const runner = createAttendancePollRunner();
  const state = dependencies();
  await runner(state.deps);
  assert.equal(state.calls[0][0], 'message');
  assert.equal(state.sentLessonNotices['-1001|2026-11-24|09:00|Математика'], '2026-11-24T05:30:00.000Z');
  assert.equal(state.calls.filter(call => call[0] === 'save').length, 1);
});

test('records poll metadata and does not resend a previously recorded poll', async () => {
  const runner = createAttendancePollRunner();
  const state = dependencies({ currentMinutes: 8 * 60 + 50 });
  await runner(state.deps);
  const record = state.sentAttendancePolls['-1001|2026-11-24|09:00|Математика'];
  assert.equal(record.pollId, 'poll-1');
  assert.equal(record.groupId, '-1001');
  assert.equal(record.lessonKey, 'lesson-key');
  assert.equal(state.calls.filter(call => call[0] === 'poll').length, 1);
  await runner(state.deps);
  assert.equal(state.calls.filter(call => call[0] === 'poll').length, 1);
});

test('continues with later groups after one schedule source fails', async () => {
  const runner = createAttendancePollRunner();
  const state = dependencies({
    groups: [
      { chatId: -1001, title: 'Ошибка', scheduleGroup: 'bad' },
      { chatId: -1002, title: 'Нормальная', scheduleGroup: 'good' }
    ],
    loadSchedule: async group => {
      if (group === 'bad') throw new Error('source unavailable');
      return [lesson];
    }
  });
  await runner(state.deps);
  assert.equal(state.calls.some(call => call[0] === 'error'), true);
  assert.equal(state.calls.some(call => call[0] === 'message' && call[1] === -1002), true);
});

test('prevents overlapping cycles while a source request is pending', async () => {
  const runner = createAttendancePollRunner();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = dependencies({ loadSchedule: async () => { await gate; return []; } });
  const first = runner(state.deps);
  await Promise.resolve();
  await runner(state.deps);
  assert.equal(state.calls.length, 0);
  release();
  await first;
});
