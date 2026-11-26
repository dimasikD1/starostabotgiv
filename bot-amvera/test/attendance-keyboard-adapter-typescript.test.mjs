import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyAttendanceKeyboard,
  buildAttendanceStatusKeyboard,
  buildAttendanceLessonPicker,
  buildPerLessonAttendanceKeyboard
} from '../../.test-build/domain-user/attendance-keyboard-adapter.js';

const key = student => student.telegramId;

test('builds daily attendance pages with status and navigation callbacks', () => {
  const group = {
    students: [{ telegramId: '1' }, { telegramId: '2' }],
    attendance: { '1': { '2026-11-27': 'present' }, '2': { '2026-11-27': 'absent' } }
  };
  assert.deepEqual(buildDailyAttendanceKeyboard(group, 0, '2026-11-27', key), [
    [
      { text: '✅ Был 1', callbackData: 'attmark:0:present' },
      { text: '▫️ Нет 1', callbackData: 'attmark:0:absent' }
    ],
    [
      { text: '▫️ Был 2', callbackData: 'attmark:1:present' },
      { text: '❌ Нет 2', callbackData: 'attmark:1:absent' }
    ],
    [{ text: '1/1', callbackData: 'attsummary' }]
  ]);
});

test('preserves status actions and lesson picker callback payloads', () => {
  assert.deepEqual(buildAttendanceStatusKeyboard(4), [
    [{ text: '✅ Был', callbackData: 'attmark:4:present' }, { text: '❌ Не был', callbackData: 'attmark:4:absent' }],
    [{ text: '↩️ Снять отметку', callbackData: 'attmark:4:clear' }],
    [{ text: '⬅️ К списку', callbackData: 'attback' }]
  ]);
  assert.deepEqual(buildAttendanceLessonPicker([{ timeStart: '09:00', timeEnd: '10:30', subject: 'Математика' }]), [
    [{ text: '1. 09:00–10:30 — Математика', callbackData: 'attlesson:0' }]
  ]);
});

test('builds per-lesson attendance buttons from the selected page and status record', () => {
  const rows = buildPerLessonAttendanceKeyboard([{ telegramId: '7' }], 0, { '7': 'present' }, key);
  assert.deepEqual(rows, [
    [
      { text: '✅ Был 1', callbackData: 'attpairmark:0:present' },
      { text: '▫️ Нет 1', callbackData: 'attpairmark:0:absent' }
    ],
    [
      { text: '1/1', callbackData: 'attpairpage:0' }
    ],
    [{ text: '↩️ К списку пар', callbackData: 'attpairback' }]
  ]);
});
