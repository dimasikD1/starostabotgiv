import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSchedule, nextWeekDateRange, nextMondayDateRange, currentMondayDateRange, buildWeeklyScheduleText } from '../../.test-build/presentation.js';

const lesson = { date: '2026-11-23', dayOffset: 1, time: '09:00–10:30', timeStart: '09:00', timeEnd: '10:30', subject: 'Математика', lessonNumber: '1', lessonType: 'лекция', teacher: 'Иванов И. И.', room: '204', group: 'БИ(ЭБ)2' };

test('formats lesson number, time, type, teacher and room', () => {
  const text = formatSchedule([lesson], 'БИ(ЭБ)2');
  assert.ok(text.includes('• 1. 09:00–10:30 — Математика (лекция)'));
  assert.ok(text.includes('Иванов И. И.'));
  assert.ok(text.includes('Аудитория: 204'));
});

test('uses the legacy time field and empty schedule message', () => {
  assert.match(formatSchedule([{ ...lesson, timeStart: '', timeEnd: '', time: '12:15', lessonNumber: '' }], 'Группа'), /12:15 — Математика/);
  assert.equal(formatSchedule([], 'Группа'), 'На ближайшие дни занятий для группы «Группа» не найдено.');
});

test('calculates the Monday–Sunday week containing a date, including Sunday', () => {
  assert.deepEqual(currentMondayDateRange('2026-11-23'), { start: '2026-11-23', end: '2026-11-29' });
  assert.deepEqual(currentMondayDateRange('2026-11-25'), { start: '2026-11-23', end: '2026-11-29' });
  assert.deepEqual(currentMondayDateRange('2026-11-29'), { start: '2026-11-23', end: '2026-11-29' });
  assert.deepEqual(currentMondayDateRange('2026-11-30'), { start: '2026-11-30', end: '2026-12-06' });
});

test('calculates the next Monday publication range from weekdays and Sunday', () => {
  assert.deepEqual(nextMondayDateRange('2026-11-23'), { start: '2026-11-30', end: '2026-12-06' });
  assert.deepEqual(nextMondayDateRange('2026-11-28'), { start: '2026-11-30', end: '2026-12-06' });
  assert.deepEqual(nextMondayDateRange('2026-11-29'), { start: '2026-11-30', end: '2026-12-06' });
});

test('calculates next Monday through Sunday from a Sunday date', () => {
  assert.deepEqual(nextWeekDateRange('2026-11-22'), { start: '2026-11-23', end: '2026-11-29' });
});

test('combines identical weekly schedules for both groups', async () => {
  const result = await buildWeeklyScheduleText({ groups: ['Группа 1', 'Группа 2'], range: { start: '2026-11-23', end: '2026-11-29' }, loadSchedule: async () => [lesson] });
  assert.match(result.text, /Обе учебные группы — расписание совпадает/);
  assert.equal(result.lessonCount, 2);
});

test('keeps groups separate when schedules differ or a source fails', async () => {
  const result = await buildWeeklyScheduleText({ groups: ['Группа 1', 'Группа 2'], range: { start: '2026-11-23', end: '2026-11-29' }, loadSchedule: async group => { if (group === 'Группа 2') throw new Error('offline'); return [lesson]; }, logger: { error() {} } });
  assert.match(result.text, /Группа 1/);
  assert.match(result.text, /Группа 2/);
  assert.match(result.text, /Не удалось загрузить расписание/);
});
