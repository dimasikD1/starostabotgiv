import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeworkDestinationButtons } from '../domain/.build/homework-destination-buttons.js';

test('builds a destination button per group and a broadcast option for multiple groups', () => {
  assert.deepEqual(buildHomeworkDestinationButtons([
    { title: 'Группа А', chatId: -1001 },
    { title: 'Группа Б', chatId: -1002 }
  ]), [
    [{ text: '📚 Группа А', callbackData: 'hwsend:-1001' }],
    [{ text: '📚 Группа Б', callbackData: 'hwsend:-1002' }],
    [{ text: '📚 Во все группы', callbackData: 'hwsend:all' }]
  ]);
});

test('omits broadcast option for one group and caps visible title length', () => {
  const result = buildHomeworkDestinationButtons([{ title: 'А'.repeat(60), chatId: '42' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0][0].text, '📚 ' + 'А'.repeat(45));
  assert.equal(result[0][0].callbackData, 'hwsend:42');
});
