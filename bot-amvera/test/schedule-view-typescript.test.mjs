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

test('filters the explicit Monday–Sunday range and excludes the following week', () => {
  const withNextWeek = [
    ...lessons,
    { date: '2026-11-29', dayOffset: 6, timeStart: '12:00', subject: 'Последнее занятие недели', time: '', teacher: '', room: '', group: groups[0] },
    { date: '2026-11-30', dayOffset: 7, timeStart: '08:30', subject: 'Следующая неделя', time: '', teacher: '', room: '', group: groups[0] }
  ];
  const result = buildScheduleView(groups[0], groups, withNextWeek, 0, {
    start: '2026-11-23', end: '2026-11-29'
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.lessons.map(item => item.subject), [
      'Первая', 'Вторая', 'Завтра+', 'Последнее занятие недели'
    ]);
    assert.ok(result.lessons.every(item => item.date >= '2026-11-23' && item.date <= '2026-11-29'));
  }
});

test('returns an empty list when the requested day has no lessons', () => {
  const result = buildScheduleView(groups[0], groups, lessons, 6);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lessons, []);
});

import { resolveScheduleGroupName } from '../../.test-build/schedule-view.js';

test('resolves only an exact configured schedule group name', () => {
  assert.deepEqual(resolveScheduleGroupName('  ' + groups[1] + '  ', groups), { ok: true, group: groups[1] });
  assert.deepEqual(resolveScheduleGroupName('', groups), { ok: false, reason: 'missing' });
  assert.deepEqual(resolveScheduleGroupName('БИ(ЭБ)2', groups), { ok: false, reason: 'unknown' });
});
