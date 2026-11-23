import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniAppGroupData } from '../../.test-build/domain/miniapp-data.js';

test('composes Mini App group data while preserving sorting, counts, names and history', () => {
  const students = [
    { telegramId: '1', fullName: 'Анна Иванова' },
    { telegramId: '2', fullName: 'Борис Петров' },
    { telegramId: '3', fullName: 'Вера Сидорова' }
  ];
  const scheduleItems = [
    { date: '2026-11-24', timeStart: '11:00', subject: 'История' },
    { date: '2026-11-23', timeStart: '10:00', subject: 'Математика' },
    { date: '2026-11-23', timeStart: '08:30', subject: 'Физика' }
  ];
  const result = buildMiniAppGroupData({
    scheduleItems,
    students,
    lessonAttendance: {
      '2026-11-23|10:00||Математика': { '1': 'present', '2': 'absent' }
    },
    today: '2026-11-23',
    getLessonKey: lesson => [lesson.date, lesson.timeStart, '', lesson.subject].join('|'),
    getStudentKey: student => student.telegramId,
    getStudentName: student => student.fullName,
    homework: [{ id: 'hw1', subject: 'Математика', homework: 'Задачи', createdAt: '2026-11-22T10:00:00.000Z', completedBy: { '1': '2026-11-22T11:00:00.000Z' } }],
    users: {},
    announcements: ['old', 'middle', 'new'],
    nowMs: Date.parse('2026-11-23T12:00:00.000Z')
  });
  assert.deepEqual(result.lessons.map(lesson => lesson.subject), ['Физика', 'Математика']);
  assert.deepEqual(result.scheduleLessons.map(lesson => lesson.subject), ['Физика', 'Математика', 'История']);
  assert.deepEqual(result.students.map(student => student.name), students.map(student => student.fullName));
  assert.equal(result.lessons[1].present, 1);
  assert.equal(result.lessons[1].absent, 1);
  assert.equal(result.lessons[1].unmarked, 1);
  assert.deepEqual(result.announcements, ['new', 'middle', 'old']);
  assert.equal(result.homework[0].completedCount, 1);
  assert.equal(result.homeworkStats.week.assignments, 1);
  assert.equal(result.attendanceHistory.recent.length, 1);
});

test('returns stable empty sections for empty group data', () => {
  const result = buildMiniAppGroupData({
    scheduleItems: [], students: [], lessonAttendance: {}, today: '2026-11-23',
    getLessonKey: () => '', getStudentKey: () => '', getStudentName: () => '',
    homework: [], users: {}, announcements: [], nowMs: Date.parse('2026-11-23T12:00:00.000Z')
  });
  assert.deepEqual(result.lessons, []);
  assert.deepEqual(result.scheduleLessons, []);
  assert.deepEqual(result.students, []);
  assert.deepEqual(result.announcements, []);
  assert.deepEqual(result.homework, []);
  assert.equal(result.homeworkStats.week.assignments, 0);
  assert.equal(result.attendanceHistory.recent.length, 0);
});
