import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentRosterKeyboard,
  buildStudentCardKeyboard
} from '../../.test-build/domain-user/student-roster-keyboards.js';

const getRosterPage = (_group, page, pageSize) => ({
  pages: 3,
  items: Array.from({ length: pageSize }, (_, offset) => ({
    index: page * pageSize + offset,
    name: 'Student ' + (page * pageSize + offset)
  })).slice(0, page === 2 ? 3 : pageSize)
});

test('builds the first roster page with next navigation and callback-compatible data', () => {
  const rows = buildStudentRosterKeyboard({}, 0, getRosterPage);
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[0], [{ text: '👤 1. Student 0', callbackData: 'studentcard:0' }]);
  assert.deepEqual(rows.at(-1), [
    { text: '1/3', callbackData: 'studentpage:0' },
    { text: '➡️', callbackData: 'studentpage:1' }
  ]);
});

test('builds middle and final page navigation without out-of-range arrows', () => {
  const middle = buildStudentRosterKeyboard({}, 1, getRosterPage);
  assert.deepEqual(middle.at(-1), [
    { text: '⬅️', callbackData: 'studentpage:0' },
    { text: '2/3', callbackData: 'studentpage:1' },
    { text: '➡️', callbackData: 'studentpage:2' }
  ]);
  const last = buildStudentRosterKeyboard({}, 2, getRosterPage);
  assert.equal(last.length, 4);
  assert.deepEqual(last.at(-1), [
    { text: '⬅️', callbackData: 'studentpage:1' },
    { text: '3/3', callbackData: 'studentpage:2' }
  ]);
});

test('truncates displayed names and preserves the full student index in callback data', () => {
  const rows = buildStudentRosterKeyboard({}, 0, () => ({
    pages: 1,
    items: [{ index: 14, name: 'A'.repeat(60) }]
  }));
  assert.equal(rows[0][0].text.length, '👤 15. '.length + 42);
  assert.equal(rows[0][0].callbackData, 'studentcard:14');
});

test('builds the same student-card action callbacks', () => {
  assert.deepEqual(buildStudentCardKeyboard(7), [
    [{ text: '✏️ Изменить username', callbackData: 'studentedit:username:7' }],
    [{ text: '📞 Изменить телефон', callbackData: 'studentedit:phone:7' }],
    [{ text: '⬅️ К списку', callbackData: 'studentback' }]
  ]);
});
