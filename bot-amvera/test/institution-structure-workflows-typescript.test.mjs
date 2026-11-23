import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacultyAndSave, createDirectionAndSave, createCourseAndSave } from '../../.test-build/domain/institution-structure-workflows.js';

test('persists faculty, direction and course only after successful creation', () => {
  const institution = { id: 'inst', faculties: {} };
  let saves = 0;
  const faculty = createFacultyAndSave(institution, 'Факультет', 'f1', 'now', () => saves++);
  assert.equal(faculty.ok, true);
  const direction = createDirectionAndSave(institution.faculties.f1, 'Направление', 'd1', 'now', () => saves++);
  assert.equal(direction.ok, true);
  const course = createCourseAndSave(institution.faculties.f1.directions.d1, '1 курс', 'c1', 'now', () => saves++);
  assert.equal(course.ok, true);
  assert.equal(saves, 3);
});

test('does not persist duplicate or invalid structure entries', () => {
  const institution = { id: 'inst', faculties: { f1: { id: 'f1', name: 'Факультет', directions: {} } } };
  let saves = 0;
  const duplicate = createFacultyAndSave(institution, ' факультет ', 'f2', 'now', () => saves++);
  const invalid = createDirectionAndSave(institution.faculties.f1, '  ', 'd1', 'now', () => saves++);
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate' });
  assert.deepEqual(invalid, { ok: false, reason: 'invalid_name' });
  assert.equal(saves, 0);
});
