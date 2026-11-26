import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleGroupKeyboard } from '../../.test-build/domain-user/schedule-group-keyboard.js';

test('preserves schedule group labels and callback values', () => {
  assert.deepEqual(buildScheduleGroupKeyboard('Группа 2', 'Группа 1'), [
    [{ text: 'Группа 2', callbackData: 'studygroup:2' }],
    [{ text: 'Группа 1', callbackData: 'studygroup:1' }]
  ]);
});
