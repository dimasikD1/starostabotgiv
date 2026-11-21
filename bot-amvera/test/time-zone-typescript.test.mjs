import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimeZone } from '../../.test-build/utils/time-zone.js';

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
