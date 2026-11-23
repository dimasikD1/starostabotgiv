import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManualAttendanceMarkInput, buildAttendanceLessonKey, classifyAttendance, setLessonAttendanceStatus, paginateAttendanceStudents, getAttendanceLessonAt, buildMiniAppAttendanceLessons } from '../../.test-build/domain-user/attendance-core.js';

test('builds the lesson key from date, start/end time and subject', () => {
  assert.equal(
    buildAttendanceLessonKey({date:'2026-11-23',timeStart:'09:00',timeEnd:'10:30',subject:'Математика'},'2026-11-22'),
    '2026-11-23|09:00|10:30|Математика'
  );
});

test('uses legacy time field when timeStart is absent', () => {
  assert.equal(
    buildAttendanceLessonKey({date:'2026-11-23',time:'11:00',subject:'История'},'2026-11-22'),
    '2026-11-23|11:00||История'
  );
});

test('uses fallback date and default subject for incomplete lessons', () => {
  assert.equal(buildAttendanceLessonKey({},'2026-11-22'),'2026-11-22|||Занятие');
});

test('preserves legacy fallback behavior for empty values', () => {
  assert.equal(
    buildAttendanceLessonKey({date:'',timeStart:'',time:'12:15',timeEnd:null,subject:''},'2026-11-22'),
    '2026-11-22|12:15||Занятие'
  );
});

test('classifies present, absent and unknown statuses in original student order', () => {
  const students = [
    {name:'Аня',status:'present'},
    {name:'Борис',status:'absent'},
    {name:'Вера',status:'pending'},
    {name:'Глеб'}
  ];
  const buckets = classifyAttendance(
    students,
    student => student.status,
    student => student.name
  );
  assert.deepEqual(buckets, {
    present: ['Аня'],
    absent: ['Борис'],
    unmarked: ['Вера','Глеб']
  });
});

test('classifies every student as unmarked when the journal has no records', () => {
  const students = ['А','Б'];
  assert.deepEqual(
    classifyAttendance(students, () => undefined, student => student),
    {present:[],absent:[],unmarked:['А','Б']}
  );
});

test('writes a status only to the selected lesson and student', () => {
  const group = { lessonAttendance: { other: { '7': 'absent' } } };
  assert.equal(setLessonAttendanceStatus(group, 'lesson-a', '7', 'present'), true);
  assert.deepEqual(group.lessonAttendance, {
    other: { '7': 'absent' },
    'lesson-a': { '7': 'present' }
  });
});

test("clears only the selected student mark and preserves other marks", () => {
  const group = { lessonAttendance: { lesson: { '7': 'present', '8': 'absent' } } };
  assert.equal(setLessonAttendanceStatus(group, 'lesson', '7', 'unmarked'), true);
  assert.deepEqual(group.lessonAttendance.lesson, { '8': 'absent' });
});

test('rejects empty keys without creating journal entries', () => {
  const group = {};
  assert.equal(setLessonAttendanceStatus(group, '', '7', 'present'), false);
  assert.equal(setLessonAttendanceStatus(group, 'lesson', ' ', 'absent'), false);
  assert.equal(group.lessonAttendance, undefined);
});

test('paginates students and clamps page indexes', () => {
  const students = Array.from({length: 23}, (_, index) => index + 1);
  assert.deepEqual(paginateAttendanceStudents(students, 1), {
    items: [11,12,13,14,15,16,17,18,19,20],
    page: 1,
    pageCount: 3,
    startIndex: 10,
    pageSize: 10
  });
  assert.equal(paginateAttendanceStudents(students, 99).page, 2);
  assert.equal(paginateAttendanceStudents(students, -5).page, 0);
});

test('uses a safe page size and returns one empty page for an empty group', () => {
  assert.deepEqual(paginateAttendanceStudents([], 0, 0), {
    items: [],
    page: 0,
    pageCount: 1,
    startIndex: 0,
    pageSize: 1
  });
});

test('resolves only valid integer lesson indexes', () => {
  const lessons = ['first', 'second'];
  assert.equal(getAttendanceLessonAt(lessons, 1), 'second');
  assert.equal(getAttendanceLessonAt(lessons, -1), undefined);
  assert.equal(getAttendanceLessonAt(lessons, 1.5), undefined);
});


test('builds today and full schedule lessons with attendance counts and legacy ordering', () => {
  const schedule = [
    {date:'2026-11-24',timeStart:'11:00',subject:'История',room:'О-2'},
    {date:'2026-11-23',timeStart:'10:00',subject:'Математика',teacher:'Преподаватель'},
    {date:'2026-11-23',timeStart:'08:30',subject:'Физика'},
    {date:'2026-11-23',timeStart:'09:00',subject:''},
    {date:'',timeStart:'07:00',subject:'Без даты'}
  ];
  const students = [{id:1},{id:2},{id:3}];
  const result = buildMiniAppAttendanceLessons(
    schedule, students,
    {'2026-11-23|10:00||Математика':{'1':'present','2':'absent'}},
    '2026-11-23',
    lesson => [lesson.date,lesson.timeStart,'',lesson.subject || 'Занятие'].join('|'),
    student => String(student.id)
  );
  assert.deepEqual(result.todayLessons.map(x => x.subject), ['Физика','Математика']);
  assert.deepEqual(result.scheduleLessons.map(x => x.subject), ['Физика','Математика','История']);
  assert.deepEqual(result.scheduleLessons[1], {
    key:'2026-11-23|10:00||Математика',date:'2026-11-23',timeStart:'10:00',timeEnd:'',
    subject:'Математика',room:'',teacher:'Преподаватель',present:1,absent:1,unmarked:1
  });
});

test('returns empty Mini App lesson lists for an empty schedule', () => {
  assert.deepEqual(
    buildMiniAppAttendanceLessons([], [], {}, '2026-11-23', () => '', () => ''),
    {todayLessons:[],scheduleLessons:[]}
  );
});


test('parses /mark student index and status with optional bot mention', () => {
  assert.deepEqual(parseManualAttendanceMarkInput('/mark 2 present'), { studentIndex: 1, status: 'present' });
  assert.deepEqual(parseManualAttendanceMarkInput('/mark@starostagivbot 3 absent'), { studentIndex: 2, status: 'absent' });
});

test('rejects incomplete or invalid /mark arguments', () => {
  for (const value of ['/mark', '/mark 0 present', '/mark -1 absent', '/mark 2 late', '/mark abc present']) {
    assert.equal(parseManualAttendanceMarkInput(value), undefined);
  }
});

test('preserves legacy behavior of ignoring extra /mark arguments', () => {
  assert.deepEqual(parseManualAttendanceMarkInput('/mark 1 present extra'), { studentIndex: 0, status: 'present' });
});
