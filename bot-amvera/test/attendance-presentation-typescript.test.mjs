import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDailyAttendance, formatSingleLessonAttendance } from '../../.test-build/domain/attendance-presentation.js';

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const options = {
  today: '2026-11-23',
  getStudentKey: student => student.id,
  getStudentName: student => student.name,
  escapeHtml
};

test('daily attendance preserves present, absent and unmarked sections and source order', () => {
  const result = formatDailyAttendance({
    title: 'Группа <БИ>',
    students: [{ id: 1, name: 'Анна' }, { id: 2, name: 'Борис' }, { id: 3, name: 'Вера' }],
    attendance: { '1': { '2026-11-23': 'present' }, '2': { '2026-11-23': 'absent' } }
  }, options);
  assert.match(result, /Посещаемость за 2026-11-23/);
  assert.match(result, /Группа &lt;БИ&gt;/);
  assert.match(result, /Были \(1\)[\\s\\S]*1\\. Анна/);
  assert.match(result, /Не были \(1\)[\\s\\S]*1\\. Борис/);
  assert.match(result, /Не отмечены \(1\)[\\s\\S]*1\\. Вера/);
});

test('daily attendance handles an empty roster', () => {
  assert.equal(
    formatDailyAttendance({ students: [] }, options),
    '📋 <b>Посещаемость</b>\\n\\nСписок группы пуст. Добавь студентов командой /student.'
  );
});

test('lesson attendance includes date, time, room and escaped subject', () => {
  const result = formatSingleLessonAttendance({
    students: [{ id: 7, name: 'Иван' }],
    lessonAttendance: { 'lesson-key': { '7': 'present' } }
  }, {
    date: '2026-11-23', timeStart: '09:00', timeEnd: '10:30',
    subject: 'Математика <1>', room: '204'
  }, 'lesson-key', options);
  assert.match(result, /2026-11-23 · 09:00–10:30/);
  assert.match(result, /Математика &lt;1&gt;/);
  assert.match(result, /Аудитория: 204/);
  assert.match(result, /Были \(1\)/);
});

test('lesson attendance omits empty optional room and unmarked section', () => {
  const result = formatSingleLessonAttendance({
    students: [{ id: 7, name: 'Иван' }],
    lessonAttendance: { 'lesson-key': { '7': 'absent' } }
  }, { date: '2026-11-23', subject: 'Физика' }, 'lesson-key', options);
  assert.doesNotMatch(result, /Аудитория:/);
  assert.doesNotMatch(result, /Не отмечены/);
  assert.match(result, /Время не указано/);
});
