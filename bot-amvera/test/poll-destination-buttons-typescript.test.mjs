import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPollDestinationButtons } from '../domain/.build/poll-destination-buttons.js';

test('builds poll destination buttons and broadcast option for multiple groups', () => {
  assert.deepEqual(buildPollDestinationButtons([
    { title: 'Группа А', chatId: -1001 },
    { title: 'Группа Б', chatId: -1002 }
  ]), [
    [{ text: '📢 Группа А', callbackData: 'pollsend:-1001' }],
    [{ text: '📢 Группа Б', callbackData: 'pollsend:-1002' }],
    [{ text: '📢 Во все группы', callbackData: 'pollsend:all' }]
  ]);
});

test('omits broadcast option for one group and caps visible title length', () => {
  const result = buildPollDestinationButtons([{ title: 'Б'.repeat(60), chatId: '77' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0][0].text, '📢 ' + 'Б'.repeat(45));
  assert.equal(result[0][0].callbackData, 'pollsend:77');
});
