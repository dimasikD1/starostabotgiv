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

import {
  linkStudyGroupToCourseAndSave,
  unlinkStudyGroupFromStructureAndSave
} from '../../.test-build/domain/institution-structure-workflows.js';

function linkedFixture() {
  const institution = {
    id: 'inst',
    faculties: {
      f1: {
        id: 'f1', name: 'Факультет',
        directions: {
          d1: {
            id: 'd1', name: 'Направление',
            courses: { c1: { id: 'c1', name: '1 курс', groups: {} } }
          }
        }
      }
    }
  };
  const group = {
    institutionId: 'inst', chatId: '-100123', studyGroup: 'БИ(ЭБ)1-ОЗ/Бп/КД26',
    students: [{ id: 'student-1' }], attendance: { lesson1: { student: 'present' } },
    starostaId: '1001', scheduleGroup: 'schedule-source'
  };
  return { institution, group };
}

test('links a study group and persists only after a successful link', () => {
  const { institution, group } = linkedFixture();
  let saves = 0;
  const result = linkStudyGroupToCourseAndSave(institution, group, 'c1', 'now', () => saves++);
  assert.equal(result.ok, true);
  assert.equal(saves, 1);
  assert.equal(institution.faculties.f1.directions.d1.courses.c1.groups['-100123::БИ(ЭБ)1-ОЗ/Бп/КД26'].studyGroup, group.studyGroup);
  assert.equal(group.courseId, 'c1');
  assert.equal(group.students.length, 1);
  assert.deepEqual(group.attendance, { lesson1: { student: 'present' } });
  assert.equal(group.starostaId, '1001');
});

test('does not persist when course linking fails', () => {
  const { institution, group } = linkedFixture();
  let saves = 0;
  const result = linkStudyGroupToCourseAndSave(institution, group, 'missing', 'now', () => saves++);
  assert.deepEqual(result, { ok: false, reason: 'course_not_found' });
  assert.equal(saves, 0);
});

test('unlinks only the structure reference and preserves student data', () => {
  const { institution, group } = linkedFixture();
  linkStudyGroupToCourseAndSave(institution, group, 'c1', 'now', () => {});
  let saves = 0;
  const result = unlinkStudyGroupFromStructureAndSave(institution, group, () => saves++);
  assert.deepEqual(result, { ok: true, removed: 1 });
  assert.equal(saves, 1);
  assert.equal(group.courseId, undefined);
  assert.equal(group.facultyId, undefined);
  assert.equal(group.directionId, undefined);
  assert.equal(group.students.length, 1);
  assert.deepEqual(group.attendance, { lesson1: { student: 'present' } });
  assert.equal(group.starostaId, '1001');
  assert.equal(group.scheduleGroup, 'schedule-source');
});
