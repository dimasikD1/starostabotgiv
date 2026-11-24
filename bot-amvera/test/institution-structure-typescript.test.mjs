import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFaculty, createDirection, createCourse, hasDuplicateStructureName,
  linkStudyGroupToCourse, unlinkStudyGroupFromStructure
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
  assert.deepEqual(result, { ok: true, id: '-100::Группа 1', facultyName: 'Факультет', directionName: 'Направление', courseName: '1 курс' });
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

test('moving a study group replaces its previous course link instead of duplicating it', () => {
  const institution = fixture();
  createFaculty(institution, 'Факультет', 'fac_1', 'now');
  createDirection(institution.faculties.fac_1, 'Направление', 'dir_1', 'now');
  createCourse(institution.faculties.fac_1.directions.dir_1, '1 курс', 'course_1', 'now');
  createCourse(institution.faculties.fac_1.directions.dir_1, '2 курс', 'course_2', 'now');
  const group = { chatId: '-100', institutionId: 'inst_a', studyGroup: 'Группа 1' };
  linkStudyGroupToCourse(institution, group, 'course_1', 'first');
  linkStudyGroupToCourse(institution, group, 'course_2', 'second');
  const courses = institution.faculties.fac_1.directions.dir_1.courses;
  assert.equal(courses.course_1.groups['-100::Группа 1'], undefined);
  assert.equal(courses.course_2.groups['-100::Группа 1'].courseId, 'course_2');
  assert.equal(group.courseId, 'course_2');
});

test('unlinks a group only from its own institution structure', () => {
  const institution = fixture();
  createFaculty(institution, 'Факультет', 'fac_1', 'now');
  createDirection(institution.faculties.fac_1, 'Направление', 'dir_1', 'now');
  createCourse(institution.faculties.fac_1.directions.dir_1, '1 курс', 'course_1', 'now');
  const group = { chatId: '-100', institutionId: 'inst_a', studyGroup: 'Группа 1', facultyId: 'fac_1', directionId: 'dir_1', courseId: 'course_1' };
  linkStudyGroupToCourse(institution, group, 'course_1', 'linked');
  assert.deepEqual(unlinkStudyGroupFromStructure({ ...institution, id: 'inst_other' }, group), { ok: false, reason: 'institution_mismatch' });
  assert.deepEqual(unlinkStudyGroupFromStructure(institution, group), { ok: true, removed: 1 });
  assert.equal(institution.faculties.fac_1.directions.dir_1.courses.course_1.groups['-100::Группа 1'], undefined);
  assert.equal(group.courseId, undefined);
});


test('parses study-group link arguments and rejects missing or invalid values', async () => {
  const { parseStudyGroupLinkArguments } = await import('../domain/.build/institution-structure.js');
  assert.deepEqual(parseStudyGroupLinkArguments([' 1 ', ' course_123 ']), { ok: true, groupNumber: '1', courseId: 'course_123' });
  assert.deepEqual(parseStudyGroupLinkArguments(['2', 'course_2']), { ok: true, groupNumber: '2', courseId: 'course_2' });
  assert.deepEqual(parseStudyGroupLinkArguments(['3', 'course_2']), { ok: false, reason: 'invalid_group' });
  assert.deepEqual(parseStudyGroupLinkArguments(['1', '  ']), { ok: false, reason: 'missing_course' });
  assert.deepEqual(parseStudyGroupLinkArguments([]), { ok: false, reason: 'invalid_group' });
});

test('parses study-group unlink arguments without requiring a course ID', async () => {
  const { parseStudyGroupUnlinkArguments } = await import('../domain/.build/institution-structure.js');
  assert.deepEqual(parseStudyGroupUnlinkArguments(['2']), { ok: true, groupNumber: '2' });
  assert.deepEqual(parseStudyGroupUnlinkArguments([' 1 ']), { ok: true, groupNumber: '1' });
  assert.deepEqual(parseStudyGroupUnlinkArguments(['course_1']), { ok: false, reason: 'invalid_group' });
});


test('formats empty and nested institution hierarchy with escaped Telegram HTML', async () => {
  const { formatInstitutionStructureMessage } = await import('../domain/.build/institution-structure.js');
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  assert.equal(formatInstitutionStructureMessage({ id: 'inst_1', name: 'Институт' }, escape),
    '🏫 <b>Институт</b>\\n\\nПока нет факультетов. Добавь первый командой /addfaculty.');
  const institution = { id: 'inst_1', name: 'Вуз <&', faculties: {
    f1: { id: 'f1', name: 'Факультет <А>', directions: {
      d1: { id: 'd1', name: 'Направление', courses: {
        c1: { id: 'c1', name: '1 курс', groups: { g1: { name: 'БИ & группа' } } }
      } }
    } }
  } };
  const result = formatInstitutionStructureMessage(institution, escape);
  assert.match(result, /Вуз &lt;&amp;/);
  assert.match(result, /Факультет &lt;А&gt;/);
  assert.match(result, /БИ &amp; группа/);
  assert.ok(result.includes('ID: <code>c1</code>'));
});

test('preserves the existing 3900-character Telegram message limit', async () => {
  const { formatInstitutionStructureMessage } = await import('../domain/.build/institution-structure.js');
  const institution = { id: 'inst_1', name: 'X', faculties: { f1: { id: 'f1', name: 'Ф'.repeat(5000) } } };
  assert.equal(formatInstitutionStructureMessage(institution, value => String(value ?? '')).length, 3900);
});
