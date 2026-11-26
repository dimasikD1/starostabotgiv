import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAttendancePollAnswer, findAttendancePollRecord, findLatestAttendancePollRecord, buildAttendancePollKey, isAttendancePollDue, formatAttendancePollReportMessage } from '../../.test-build/domain-user/attendance-polls.js';

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

test('stores unknown poll options and clears the linked lesson mark', () => {
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
  assert.equal(groups['-1001'].lessonAttendance.lesson['303'], undefined);
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


test('builds latest poll report counts and display names without mutating the record', async () => {
  const { buildAttendancePollReport } = await import('../../.test-build/domain-user/attendance-polls.js');
  const latest = {
    subject: 'Математика',
    date: '2026-11-23',
    time: '09:00',
    responses: {
      '1': { firstName: 'Анна', username: 'anna', status: 'present' },
      '2': { firstName: 'Борис', username: '', status: 'absent' },
      '3': { firstName: '', username: '', status: 'unknown' }
    }
  };
  const before = structuredClone(latest);
  assert.deepEqual(buildAttendancePollReport(5, latest), {
    subject: 'Математика',
    date: '2026-11-23',
    time: '09:00',
    presentCount: 1,
    absentCount: 1,
    unansweredCount: 2,
    names: ['Анна (@anna) — ✅ Будет', 'Борис — ❌ Не будет', 'Студент']
  });
  assert.deepEqual(latest, before);
  assert.equal(buildAttendancePollReport(1, { responses: { a: { status: 'present' }, b: { status: 'absent' } } }).unansweredCount, 0);
});

test('selects the newest attendance poll for the requested group without mutating stored records', () => {
  const older = { groupId: '-1001', date: '2026-11-22', time: '15:00', pollId: 'old' };
  const newer = { groupId: '-1001', date: '2026-11-23', time: '09:00', pollId: 'new' };
  const otherGroup = { groupId: '-1002', date: '2026-11-24', time: '10:00', pollId: 'other' };
  const records = { older, newer, otherGroup };
  assert.equal(findLatestAttendancePollRecord(records, '-1001'), newer);
  assert.deepEqual(Object.keys(records), ['older', 'newer', 'otherGroup']);
  assert.equal(findLatestAttendancePollRecord(records, '-9999'), undefined);
});

test('latest poll selection compares date and time using the legacy concatenated format', () => {
  const morning = { groupId: 10, date: '2026-11-23', time: '09:00' };
  const evening = { groupId: '10', date: '2026-11-23', time: '18:00' };
  assert.equal(findLatestAttendancePollRecord({ morning, evening }, 10), evening);
});


const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('formats poll report with legacy labels and escapes Telegram HTML text', () => {
  const report = {
    subject: 'Алгебра <1>',
    date: '2026-11-23',
    time: '09:00',
    presentCount: 1,
    absentCount: 0,
    unansweredCount: 2,
    names: ['Анна & Олег — ✅ Будет', 'Студент']
  };
  assert.equal(
    formatAttendancePollReportMessage('Группа <А>', report, escapeHtml),
    '📊 <b>Ответы на последний опрос</b>\\n👥 Группа &lt;А&gt;\\n📚 Алгебра &lt;1&gt;\\n📅 2026-11-23 в 09:00\\n\\n✅ Будут: <b>1</b>\\n❌ Не будут: <b>0</b>\\n▫️ Не ответили: <b>2</b>\\n\\nАнна &amp; Олег — ✅ Будет\\nСтудент'
  );
  assert.equal(
    formatAttendancePollReportMessage('Группа', { ...report, names: [] }, escapeHtml).endsWith('Ответов пока нет.'),
    true
  );
});
