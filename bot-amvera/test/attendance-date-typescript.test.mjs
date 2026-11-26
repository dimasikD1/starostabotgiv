import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttendanceDate } from '../utils/attendance-date-entry.mjs';

test('getAttendanceDate uses the configured time zone for calendar boundaries', () => {
  const instant = new Date('2026-01-01T00:30:00.000Z');
  assert.equal(getAttendanceDate(instant, 'Europe/Moscow'), '2026-01-01');
  assert.equal(getAttendanceDate(instant, 'America/Los_Angeles'), '2025-12-31');
});
