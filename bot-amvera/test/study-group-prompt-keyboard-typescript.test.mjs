import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyGroupPromptKeyboard } from '../../.test-build/domain-user/study-group-prompt-keyboard.js';

test('preserves both study-group callbacks and the contact link', () => {
  assert.deepEqual(buildStudyGroupPromptKeyboard('Группа 2', 'Группа 1'), [
    [{ text: 'Группа 2', callbackData: 'studygroup:2' }],
    [{ text: 'Группа 1', callbackData: 'studygroup:1' }],
    [{ text: '❓ Не знаю свою группу — написать', url: 'https://t.me/givenchytg' }]
  ]);
});

test('allows group labels to come from configured study groups', () => {
  const rows = buildStudyGroupPromptKeyboard('А', 'Б', 'https://t.me/contact');
  assert.equal(rows[0][0].text, 'А');
  assert.equal(rows[1][0].text, 'Б');
  assert.equal(rows[2][0].url, 'https://t.me/contact');
});
