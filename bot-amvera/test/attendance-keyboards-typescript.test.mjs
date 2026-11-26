import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceButtons, buildAttendanceStatusButtons } from '../../.test-build/domain/attendance-keyboards.js';

test('attendance keyboard preserves statuses, callback data, and student numbering', () => {
  const rows = buildAttendanceButtons({ students: [{ id: 1 }, { id: 2 }, { id: 3 }], attendance: { '1': { '2026-11-26': 'present' }, '2': { '2026-11-26': 'absent' } } }, 0, '2026-11-26', student => student.id);
  assert.deepEqual(rows.slice(0, 3), [
    [{ text: '✅ Был 1', callbackData: 'attmark:0:present' }, { text: '▫️ Нет 1', callbackData: 'attmark:0:absent' }],
    [{ text: '▫️ Был 2', callbackData: 'attmark:1:present' }, { text: '❌ Нет 2', callbackData: 'attmark:1:absent' }],
    [{ text: '▫️ Был 3', callbackData: 'attmark:2:present' }, { text: '▫️ Нет 3', callbackData: 'attmark:2:absent' }]
  ]);
  assert.deepEqual(rows.at(-1), [{ text: '1/1', callbackData: 'attsummary' }]);
});

test('attendance keyboard clamps pages and preserves navigation callbacks', () => {
  const students = Array.from({ length: 12 }, (_, id) => ({ id }));
  const rows = buildAttendanceButtons({ students }, 99, '2026-11-26', student => student.id);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0].callbackData, 'attmark:10:present');
  assert.deepEqual(rows.at(-1), [{ text: '⬅️', callbackData: 'attpage:0' }, { text: '2/2', callbackData: 'attsummary' }]);
});

test('attendance status keyboard preserves present, absent, clear, and back actions', () => {
  assert.deepEqual(buildAttendanceStatusButtons(4), [
    [{ text: '✅ Был', callbackData: 'attmark:4:present' }, { text: '❌ Не был', callbackData: 'attmark:4:absent' }],
    [{ text: '↩️ Снять отметку', callbackData: 'attmark:4:clear' }],
    [{ text: '⬅️ К списку', callbackData: 'attback' }]
  ]);
});
