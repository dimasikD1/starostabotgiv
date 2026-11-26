import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentImportPreviewKeyboard } from '../../.test-build/domain-user/student-import-preview-keyboard.js';

test('provides the existing confirm and cancel callback rows', () => {
  assert.deepEqual(buildStudentImportPreviewKeyboard(), [
    [{ text: '✅ Подтвердить', callbackData: 'studentimport:confirm' }],
    [{ text: '❌ Отменить', callbackData: 'studentimport:cancel' }]
  ]);
});
