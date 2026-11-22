import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleView } from '../../.test-build/schedule-view.js';

const groups = ['БИ(ЭБ)1-ОЗ/Бп/КД26', 'БИ(ЭБ)2-ОЗ/Бп/КД26'];
const lessons = [
  { date: '2026-11-24', dayOffset: 1, timeStart: '10:00', subject: 'Вторая', time: '', teacher: '', room: '', group: groups[0] },
  { date: '2026-11-24', dayOffset: 1, timeStart: '08:30', subject: 'Первая', time: '', teacher: '', room: '', group: groups[0] },
  { date: '2026-11-25', dayOffset: 2, timeStart: '09:00', subject: 'Завтра+', time: '', teacher: '', room: '', group: groups[0] }
];

test('rejects a missing or unknown selected group', () => {
  assert.deepEqual(buildScheduleView('', groups, lessons), { ok: false, reason: 'invalid-group' });
  assert.deepEqual(buildScheduleView('unknown', groups, lessons), { ok: false, reason: 'invalid-group' });
});

test('keeps all lessons and sorts by date and start time', () => {
  const result = buildScheduleView(groups[0], groups, lessons);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.group, groups[0]);
    assert.deepEqual(result.lessons.map(x => x.subject), ['Первая', 'Вторая', 'Завтра+']);
  }
});

test('filters the requested day offset without changing the source list', () => {
  const result = buildScheduleView(groups[0], groups, lessons, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lessons.map(x => x.subject), ['Первая', 'Вторая']);
  assert.equal(lessons.length, 3);
});

test('returns an empty list when the requested day has no lessons', () => {
  const result = buildScheduleView(groups[0], groups, lessons, 6);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lessons, []);
});
