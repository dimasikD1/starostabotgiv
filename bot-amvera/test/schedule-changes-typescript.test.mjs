import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleSnapshot, diffScheduleSnapshots } from '../../.test-build/changes.js';

const lesson = { date: '2026-11-24', dayOffset: 2, time: '09:00–10:30', timeStart: '09:00', timeEnd: '10:30', subject: 'Математика', lessonNumber: '1', lessonType: 'лекция', teacher: 'Иванов И. И.', room: '204', group: 'БИ(ЭБ)2' };
const window = ['2026-11-23', '2026-11-30'];

test('builds a snapshot using date, start time and subject as stable identity', () => {
  const snapshot = buildScheduleSnapshot([lesson, { ...lesson, date: '', subject: 'ignored' }, { ...lesson, subject: '' }]);
  assert.equal(Object.keys(snapshot).length, 1);
  assert.equal(snapshot['2026-11-24|09:00|Математика'].room, '204');
});

test('detects added and removed lessons only inside alert window', () => {
  const previous = buildScheduleSnapshot([lesson, { ...lesson, date: '2026-12-10', subject: 'Outside' }]);
  const current = buildScheduleSnapshot([{ ...lesson, subject: 'New subject' }, { ...lesson, date: '2026-12-11', subject: 'Outside changed' }]);
  const diff = diffScheduleSnapshots(previous, current, ...window);
  assert.deepEqual(diff.added, ['➕ 2026-11-24 · 09:00 · New subject']);
  assert.deepEqual(diff.removed, ['➖ 2026-11-24 · 09:00 · Математика']);
});

test('detects room, teacher and end-time changes', () => {
  const previous = buildScheduleSnapshot([lesson]);
  const current = buildScheduleSnapshot([{ ...lesson, room: '305', teacher: 'Петров П. П.', timeEnd: '11:00' }]);
  const diff = diffScheduleSnapshots(previous, current, ...window);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 1);
  assert.match(diff.changed[0], /время окончания: 10:30 → 11:00/);
  assert.match(diff.changed[0], /аудитория: 204 → 305/);
  assert.match(diff.changed[0], /преподаватель изменён/);
});

test('does not report metadata changes outside the alert window', () => {
  const previous = buildScheduleSnapshot([{ ...lesson, date: '2026-12-10' }]);
  const current = buildScheduleSnapshot([{ ...lesson, date: '2026-12-10', room: '999' }]);
  assert.deepEqual(diffScheduleSnapshots(previous, current, ...window), { added: [], removed: [], changed: [] });
});
