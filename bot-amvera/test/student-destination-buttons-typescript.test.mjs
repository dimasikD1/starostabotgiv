import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentDestinationButtons } from '../../.test-build/domain-user/student-destination-buttons.js';

test('builds one roster destination row per managed group', () => {
  assert.deepEqual(buildStudentDestinationButtons([
    { title: 'Группа А', chatId: '-1001' },
    { title: 'Группа Б', chatId: '-1002' }
  ]), [
    [{ text: '👨‍🎓 Группа А', callbackData: 'students:-1001' }],
    [{ text: '👨‍🎓 Группа Б', callbackData: 'students:-1002' }]
  ]);
});

test('truncates long group titles while preserving the original chat ID', () => {
  const title = 'Г'.repeat(60);
  const rows = buildStudentDestinationButtons([{ title, chatId: -123 }]);
  assert.equal(rows[0][0].text, '👨‍🎓 ' + 'Г'.repeat(45));
  assert.equal(rows[0][0].callbackData, 'students:-123');
});

test('returns no rows when the user has no managed groups', () => {
  assert.deepEqual(buildStudentDestinationButtons([]), []);
});
