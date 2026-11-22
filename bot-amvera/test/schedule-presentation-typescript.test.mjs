import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSchedule, nextWeekDateRange, buildWeeklyScheduleText } from '../../.test-build/presentation.js';

const lesson = { date: '2026-11-23', dayOffset: 1, time: '09:00–10:30', timeStart: '09:00', timeEnd: '10:30', subject: 'Математика', lessonNumber: '1', lessonType: 'лекция', teacher: 'Иванов И. И.', room: '204', group: 'БИ(ЭБ)2' };

test('formats lesson number, time, type, teacher and room', () => {
  const text = formatSchedule([lesson], 'БИ(ЭБ)2');
  assert.match(text, /1\\. 09:00–10:30 — Математика \\(лекция\\)/);
  assert.match(text, /Иванов И\\. И\\./);
  assert.ok(text.includes('Аудитория: 204'));
});

test('uses the legacy time field and empty schedule message', () => {
  assert.match(formatSchedule([{ ...lesson, timeStart: '', timeEnd: '', time: '12:15', lessonNumber: '' }], 'Группа'), /12:15 — Математика/);
  assert.equal(formatSchedule([], 'Группа'), 'На ближайшие дни занятий для группы «Группа» не найдено.');
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
