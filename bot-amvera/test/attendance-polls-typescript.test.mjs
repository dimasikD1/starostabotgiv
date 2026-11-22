import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAttendancePollAnswer, findAttendancePollRecord, buildAttendancePollKey, isAttendancePollDue } from '../../.test-build/domain-user/attendance-polls.js';

test('finds a saved attendance poll by Telegram poll ID', () => {
  const records = {
    first: { pollId: 123, groupId: '-1001' },
    second: { pollId: 456, groupId: '-1002' }
  };
  assert.equal(findAttendancePollRecord(records, '456'), records.second);
  assert.equal(findAttendancePollRecord(records, 'missing'), undefined);
});

test('records a positive answer and updates the linked student lesson journal by Telegram ID', () => {
  const record = { pollId: 'p1', groupId: '-1001', groupName: 'Группа 1', lessonKey: '2026-11-22|09:00||Математика' };
  const groups = {
    '-1001': {
      students: [{ name: 'Анна', telegramId: 101 }],
      lessonAttendance: {}
    }
  };
  const result = applyAttendancePollAnswer(record, {
    poll_id: 'p1',
    option_ids: [0],
    user: { id: 101, username: 'anna', first_name: 'Анна' }
  }, groups, '2026-11-22T08:00:00.000Z');

  assert.deepEqual(result, { userId: '101', groupName: 'Группа 1', attendanceUpdated: true });
  assert.deepEqual(record.responses?.['101'], {
    userId: '101', username: 'anna', firstName: 'Анна',
    status: 'present', answeredAt: '2026-11-22T08:00:00.000Z'
  });
  assert.equal(groups['-1001'].lessonAttendance['2026-11-22|09:00||Математика']['101'], 'present');
});

test('records a negative answer without requiring a username', () => {
  const record = { groupId: '-1001', groupName: 'Группа 1' };
  const result = applyAttendancePollAnswer(record, {
    option_ids: [1],
    user: { id: 202, first_name: 'Борис' }
  }, { '-1001': { students: [{ name: 'Борис', telegramId: 202 }] } }, 'now');
  assert.equal(result?.attendanceUpdated, false);
  assert.equal(record.responses?.['202'].status, 'absent');
  assert.equal(record.responses?.['202'].username, '');
});

test('stores unknown poll options and maps a linked student to unmarked', () => {
  const record = { groupId: '-1001', lessonKey: 'lesson' };
  const groups = {
    '-1001': { students: [{ name: 'Вера', telegramId: 303 }], lessonAttendance: {} }
  };
  const result = applyAttendancePollAnswer(record, {
    option_ids: [2],
    user: { id: 303 }
  }, groups, 'now');
  assert.equal(result?.attendanceUpdated, true);
  assert.equal(record.responses?.['303'].status, 'unknown');
  assert.equal(groups['-1001'].lessonAttendance.lesson['303'], 'unmarked');
});

test('does not auto-link attendance by username or name alone', () => {
  const record = { groupId: '-1001', lessonKey: 'lesson' };
  const groups = {
    '-1001': { students: [{ name: 'Глеб', username: 'gleb' }], lessonAttendance: {} }
  };
  const result = applyAttendancePollAnswer(record, {
    option_ids: [0],
    user: { id: 404, username: 'gleb' }
  }, groups, 'now');
  assert.equal(result?.attendanceUpdated, false);
  assert.deepEqual(groups['-1001'].lessonAttendance, {});
});

test('ignores answers without a Telegram user ID', () => {
  const record = { groupId: '-1001' };
  assert.equal(applyAttendancePollAnswer(record, { option_ids: [0] }, {}, 'now'), null);
});

test('removes a withdrawn poll response and clears only the linked lesson mark', () => {
  const record = {
    groupId: '-1001',
    lessonKey: 'lesson-a',
    responses: {
      '101': { userId: '101', username: 'anna', firstName: 'Анна', status: 'present', answeredAt: 'before' },
      '202': { userId: '202', username: 'boris', firstName: 'Борис', status: 'absent', answeredAt: 'before' }
    }
  };
  const groups = {
    '-1001': {
      students: [{ name: 'Анна', telegramId: 101 }, { name: 'Борис', telegramId: 202 }],
      lessonAttendance: { 'lesson-a': { '101': 'present', '202': 'absent' }, 'lesson-b': { '101': 'present' } }
    }
  };
  const result = applyAttendancePollAnswer(record, {
    option_ids: [],
    user: { id: 101, username: 'anna' }
  }, groups, 'now');

  assert.equal(result?.attendanceUpdated, true);
  assert.equal(record.responses['101'], undefined);
  assert.ok(record.responses['202']);
  assert.deepEqual(groups['-1001'].lessonAttendance, {
    'lesson-a': { '202': 'absent' },
    'lesson-b': { '101': 'present' }
  });
});

test('builds the legacy poll key without changing its delimiter format', () => {
  assert.equal(buildAttendancePollKey('-1001', '2026-11-23', '09:00', 'Математика'),
    '-1001|2026-11-23|09:00|Математика');
});

test('sends automatic polls only in the existing ten-minute window', () => {
  assert.equal(isAttendancePollDue(470, 480), true);
  assert.equal(isAttendancePollDue(471, 480), true);
  assert.equal(isAttendancePollDue(469, 480), false);
  assert.equal(isAttendancePollDue(472, 480), false);
  assert.equal(isAttendancePollDue(NaN, 480), false);
});
