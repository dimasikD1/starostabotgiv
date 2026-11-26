import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceLessonChoices } from '../../.test-build/domain/attendance-lesson-choices.js';

test('lesson picker keeps numbering, time, fallback labels, truncation, and callback indexes', () => {
  assert.deepEqual(buildAttendanceLessonChoices([
    { timeStart: '09:00', timeEnd: '10:30', subject: 'Математика' },
    { subject: 'Очень длинное название дисциплины, которое обрезается' },
    {}
  ]), [
    [{ text: '1. 09:00–10:30 — Математика', callbackData: 'attlesson:0' }],
    [{ text: '2. Время не указано — Очень длинное название дисциплины, ', callbackData: 'attlesson:1' }],
    [{ text: '3. Время не указано — Пара', callbackData: 'attlesson:2' }]
  ]);
});
