import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFaculty, createDirection, createCourse, hasDuplicateStructureName,
  linkStudyGroupToCourse
} from '../domain/.build/institution-structure.js';

function fixture() {
  return { id: 'inst_a', name: 'Институт', faculties: {} };
}

test('creates faculty, direction and course with legacy-compatible nested records', () => {
  const institution = fixture();
  assert.deepEqual(createFaculty(institution, 'Экономический факультет', 'fac_1', 'now'), { ok: true, id: 'fac_1' });
  const faculty = institution.faculties.fac_1;
  assert.deepEqual(createDirection(faculty, 'Бизнес-информатика', 'dir_1', 'now'), { ok: true, id: 'dir_1' });
  const direction = faculty.directions.dir_1;
  assert.deepEqual(createCourse(direction, '1 курс', 'course_1', 'now'), { ok: true, id: 'course_1' });
  assert.deepEqual(direction.courses.course_1, { id: 'course_1', name: '1 курс', groups: {}, createdAt: 'now' });
});

test('rejects empty and case-insensitive duplicate names', () => {
  const institution = fixture();
  createFaculty(institution, 'Экономический факультет', 'fac_1', 'now');
  assert.deepEqual(createFaculty(institution, ' экономический ФАКУЛЬТЕТ ', 'fac_2', 'now'), { ok: false, reason: 'duplicate' });
  assert.deepEqual(createFaculty(institution, '   ', 'fac_3', 'now'), { ok: false, reason: 'invalid_name' });
  assert.equal(hasDuplicateStructureName(institution.faculties, 'ЭКОНОМИЧЕСКИЙ ФАКУЛЬТЕТ'), true);
});

test('links a group by reference and stores structure ids on the original group', () => {
  const institution = fixture();
  createFaculty(institution, 'Факультет', 'fac_1', 'now');
  createDirection(institution.faculties.fac_1, 'Направление', 'dir_1', 'now');
  createCourse(institution.faculties.fac_1.directions.dir_1, '1 курс', 'course_1', 'now');
  const group = { chatId: '-100', institutionId: 'inst_a', studyGroup: 'Группа 1', students: ['А'] };
  const result = linkStudyGroupToCourse(institution, group, 'course_1', 'linked');
  assert.deepEqual(result, { ok: true, id: '-100::Группа 1' });
  assert.equal(group.courseId, 'course_1');
  assert.equal(institution.faculties.fac_1.directions.dir_1.courses.course_1.groups['-100::Группа 1'].chatId, '-100');
  assert.deepEqual(group.students, ['А']);
});

test('does not link a group across institutions or to a missing course', () => {
  const institution = fixture();
  const group = { chatId: '-100', institutionId: 'inst_other', studyGroup: 'Группа 1' };
  assert.deepEqual(linkStudyGroupToCourse(institution, group, 'missing', 'now'), { ok: false, reason: 'institution_mismatch' });
  group.institutionId = 'inst_a';
  assert.deepEqual(linkStudyGroupToCourse(institution, group, 'missing', 'now'), { ok: false, reason: 'course_not_found' });
  assert.equal(group.courseId, undefined);
});
