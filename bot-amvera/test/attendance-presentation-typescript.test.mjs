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

test('daily attendance preserves legacy student-key/date storage and source order', () => {
  const result = formatDailyAttendance({
    title: 'Группа <БИ>',
    students: [{ id: 1, name: 'Анна' }, { id: 2, name: 'Борис' }, { id: 3, name: 'Вера' }],
    attendance: {
      '1': { '2026-11-23': 'present' },
      '2': { '2026-11-23': 'absent' }
    }
  }, options);
  assert.ok(result.includes('Посещаемость за 2026-11-23'));
  assert.ok(result.includes('Группа &lt;БИ&gt;'));
  assert.ok(result.includes('Были (1)\n1. Анна'));
  assert.ok(result.includes('Не были (1)\n1. Борис'));
  assert.ok(result.includes('Не отмечены (1)\n1. Вера'));
});

test('daily attendance handles an empty roster', () => {
  assert.equal(
    formatDailyAttendance({ students: [] }, options),
    '📋 <b>Посещаемость</b>\n\nСписок группы пуст. Добавь студентов командой /student.'
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
  assert.ok(result.includes('2026-11-23 · 09:00–10:30'));
  assert.ok(result.includes('Математика &lt;1&gt;'));
  assert.ok(result.includes('Аудитория: 204'));
  assert.ok(result.includes('Были (1)'));
});

test('lesson attendance omits empty optional room and unmarked section', () => {
  const result = formatSingleLessonAttendance({
    students: [{ id: 7, name: 'Иван' }],
    lessonAttendance: { 'lesson-key': { '7': 'absent' } }
  }, { date: '2026-11-23', subject: 'Физика' }, 'lesson-key', options);
  assert.ok(!result.includes('Аудитория:'));
  assert.ok(!result.includes('Не отмечены'));
  assert.ok(result.includes('Время не указано'));
});
