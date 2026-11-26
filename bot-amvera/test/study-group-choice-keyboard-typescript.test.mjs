import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyGroupChoiceKeyboard } from '../../.test-build/domain-user/study-group-choice-keyboard.js';

test('builds the two configured choices with existing callback identifiers', () => {
  assert.deepEqual(buildStudyGroupChoiceKeyboard('Group 2', 'Group 1'), [
    [{ text: 'Group 2', callbackData: 'studygroup:2' }],
    [{ text: 'Group 1', callbackData: 'studygroup:1' }]
  ]);
});
