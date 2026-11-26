import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeworkMessage } from '../domain/.build/homework-message.js';

test('formats homework safely and creates completion buttons only for unfinished records', () => {
  const result = buildHomeworkMessage([
    { id: 'hw1', subject: '<Математика>', groupTitle: 'БИ-1', homework: 'Задача & пример', createdAt: '2026-11-27', completedBy: {} },
    { id: 'hw2', subject: 'История', groupTitle: 'БИ-1', homework: 'Прочитать', completedBy: { '42': true } }
  ], '42');
  assert.match(result.text, /&lt;Математика&gt;/);
  assert.match(result.text, /Задача &amp; пример/);
  assert.match(result.text, /✅ Выполнение отмечено/);
  assert.deepEqual(result.buttons, [[{ text: '✅ Выполнено: <Математика>', callbackData: 'hwcomplete:hw1' }]]);
});

test('formats empty homework list without buttons', () => {
  assert.deepEqual(buildHomeworkMessage([], 7), { text: '📚 <b>Домашние задания</b>\n\n', buttons: [] });
});
