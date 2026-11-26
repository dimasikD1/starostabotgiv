import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLessonsForDate } from '../schedule/.build/lessons-for-date.js';

test('selects only matching-date lessons with subjects and sorts by start time', () => {
  const later = { date: '2026-11-27', subject: 'Biology', timeStart: '12:00' };
  const earlier = { date: '2026-11-27', subject: 'Math', timeStart: '08:30' };
  const otherDay = { date: '2026-11-28', subject: 'History', timeStart: '09:00' };
  const emptySubject = { date: '2026-11-27', subject: '', timeStart: '07:00' };
  assert.deepEqual(selectLessonsForDate([later, otherDay, emptySubject, earlier], '2026-11-27'), [earlier, later]);
});

test('returns an empty list when no lessons match', () => {
  assert.deepEqual(selectLessonsForDate([], '2026-11-27'), []);
});
