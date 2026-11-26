import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceButtons, buildAttendanceStatusButtons, buildLessonAttendanceButtons, buildLessonAttendancePageButtons } from '../../.test-build/domain/attendance-keyboards.js';

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


test('per-lesson attendance keyboard preserves callbacks, statuses, and page navigation', () => {
  const rows = buildLessonAttendanceButtons({
    items: [{ id: 'a' }, { id: 'b' }],
    page: 1,
    pageCount: 3,
    startIndex: 10
  }, { a: 'present', b: 'absent' }, student => student.id);
  assert.deepEqual(rows, [
    [{ text: '✅ Был 11', callbackData: 'attpairmark:10:present' }, { text: '▫️ Нет 11', callbackData: 'attpairmark:10:absent' }],
    [{ text: '▫️ Был 12', callbackData: 'attpairmark:11:present' }, { text: '❌ Нет 12', callbackData: 'attpairmark:11:absent' }],
    [{ text: '⬅️', callbackData: 'attpairpage:0' }, { text: '2/3', callbackData: 'attpairpage:1' }, { text: '➡️', callbackData: 'attpairpage:2' }],
    [{ text: '↩️ К списку пар', callbackData: 'attpairback' }]
  ]);
});

test('composed lesson attendance pagination preserves clamping and status controls', () => {
  const students = Array.from({ length: 12 }, (_, id) => ({ id }));
  const rows = buildLessonAttendancePageButtons(students, 99, { 10: 'present', 11: 'absent' }, student => student.id);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], [
    { text: '✅ Был 11', callbackData: 'attpairmark:10:present' },
    { text: '▫️ Нет 11', callbackData: 'attpairmark:10:absent' }
  ]);
  assert.deepEqual(rows[1], [
    { text: '▫️ Был 12', callbackData: 'attpairmark:11:present' },
    { text: '❌ Нет 12', callbackData: 'attpairmark:11:absent' }
  ]);
  assert.deepEqual(rows[2], [
    { text: '⬅️', callbackData: 'attpairpage:0' },
    { text: '2/2', callbackData: 'attpairpage:1' }
  ]);
  assert.deepEqual(rows[3], [{ text: '↩️ К списку пар', callbackData: 'attpairback' }]);
});
