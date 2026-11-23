import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimeZone, formatDateInTimeZone, getTimeZoneParts } from '../../.test-build/utils/time-zone.js';

test('resolveTimeZone uses the default for empty values', () => {
  assert.equal(resolveTimeZone(undefined), 'Europe/Moscow');
  assert.equal(resolveTimeZone('   '), 'Europe/Moscow');
});

test('resolveTimeZone accepts a valid IANA zone and trims whitespace', () => {
  assert.equal(resolveTimeZone('  Europe/Tallinn  '), 'Europe/Tallinn');
});

test('resolveTimeZone falls back and reports an invalid zone', () => {
  const warnings = [];
  const result = resolveTimeZone('Not/A_Real_Zone', 'Europe/Moscow', (message) => warnings.push(message));
  assert.equal(result, 'Europe/Moscow');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Not\/A_Real_Zone/);
});

test('formatDateInTimeZone uses the requested local calendar date', () => {
  const instant = new Date('2026-11-23T21:30:00.000Z');
  assert.equal(formatDateInTimeZone(instant, 'Europe/Moscow'), '11/24/2026');
  assert.equal(formatDateInTimeZone(instant, 'Europe/Tallinn'), '11/23/2026');
});

test('getTimeZoneParts preserves the attendance scheduler field shape', () => {
  const instant = new Date('2026-11-23T08:05:00.000Z');
  assert.deepEqual(getTimeZoneParts(instant, 'Europe/Moscow'), {
    month: '11', day: '23', year: '2026', hour: '11', minute: '05'
  });
});
