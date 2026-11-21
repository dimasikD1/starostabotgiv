import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceLessonKey, classifyAttendance } from '../../.test-build/domain-user/attendance-core.js';

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
