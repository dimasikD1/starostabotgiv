import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructureId } from '../domain/structure-id-entry.mjs';

test('buildStructureId preserves prefix and removes UUID hyphens', () => {
  assert.equal(buildStructureId('faculty', () => '12345678-90ab-cdef-1234-567890abcdef'), 'faculty_1234567890');
});

test('buildStructureId takes the first ten characters after normalization', () => {
  assert.equal(buildStructureId('course', () => 'abcdefghijklm'), 'course_abcdefghij');
});
