import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendHomework,
  buildHomeworkCompletionStatistics,
  createHomeworkRecord,
  latestHomework,
  getHomeworkCompletionState,
  markHomeworkCompleted,
  parseHomeworkCommand
} from '../../.test-build/domain-user/homework.js';

test('parses /hw subject and task while preserving extra separators in task', () => {
  assert.deepEqual(parseHomeworkCommand('Математика | Решить 1–10 | оформить в тетради'), {
    ok: true, subject: 'Математика', homework: 'Решить 1–10 | оформить в тетради'
  });
});

test('reports missing parts and enforces existing subject and task limits', () => {
  assert.deepEqual(parseHomeworkCommand('только предмет'), { ok: false, error: 'missing_parts' });
  assert.deepEqual(parseHomeworkCommand('x'.repeat(101) + ' | task'), { ok: false, error: 'subject_too_long' });
  assert.deepEqual(parseHomeworkCommand('Предмет | ' + 'x'.repeat(3501)), { ok: false, error: 'homework_too_long' });
});

test('creates legacy-compatible records and retains only the newest 50', () => {
  const group = { homework: [] };
  for (let i = 0; i < 51; i++) {
    appendHomework(group, createHomeworkRecord(
      { subject: 'Предмет', homework: String(i) }, String(i), '2026-11-22T00:00:00.000Z', 123
    ));
  }
  assert.equal(group.homework.length, 50);
  assert.equal(group.homework[0].id, '1');
  assert.deepEqual(group.homework[49].completedBy, {});
});

test('reports completion state for the selected group without changing stored records', () => {
  const target = { title: 'Группа 1', scheduleGroup: 'Подгруппа 1', homework: [
    { id: 'task-1', subject: 'История', homework: 'Прочитать', createdAt: '2026-11-21', authorId: '1', completedBy: {} }
  ] };
  const other = { title: 'Группа 2', scheduleGroup: 'Подгруппа 2', homework: [
    { id: 'task-2', subject: 'Физика', homework: 'Задачи', createdAt: '2026-11-22', authorId: '1', completedBy: { '99': 'then' } }
  ] };
  assert.deepEqual(getHomeworkCompletionState([target, other], 'Подгруппа 1', 'missing', '99'), {
    status: 'not_found'
  });
  assert.deepEqual(getHomeworkCompletionState([target, other], 'Подгруппа 2', 'task-2', '99'), {
    status: 'already_completed', item: other.homework[0]
  });
  assert.deepEqual(getHomeworkCompletionState([target, other], 'Подгруппа 1', 'task-1', '99'), {
    status: 'ready', item: target.homework[0]
  });
  assert.deepEqual(target.homework[0].completedBy, {});
});

test('marks completion once and finds assignments only in the selected study group', () => {
  const target = { title: 'Группа 1', scheduleGroup: 'Подгруппа 1', homework: [
    { id: 'task-1', subject: 'История', homework: 'Прочитать', createdAt: '2026-11-21', authorId: '1', completedBy: {} }
  ] };
  const other = { title: 'Группа 2', scheduleGroup: 'Подгруппа 2', homework: [
    { id: 'task-2', subject: 'Физика', homework: 'Задачи', createdAt: '2026-11-22', authorId: '1', completedBy: {} }
  ] };
  assert.equal(markHomeworkCompleted([target, other], 'Подгруппа 1', 'task-2', '99', 'now'), undefined);
  const item = markHomeworkCompleted([target, other], 'Подгруппа 1', 'task-1', '99', 'first');
  assert.equal(item.completedBy['99'], 'first');
  markHomeworkCompleted([target], 'Подгруппа 1', 'task-1', '99', 'second');
  assert.equal(item.completedBy['99'], 'first');
});

test('lists latest assignments for the requested group only', () => {
  const groups = [
    { title: 'Группа 1', scheduleGroup: 'one', homework: [
      { id: 'old', subject: 'A', homework: 'A', createdAt: '2026-11-20', authorId: '1', completedBy: {} },
      { id: 'new', subject: 'B', homework: 'B', createdAt: '2026-11-22', authorId: '1', completedBy: {} }
    ] },
    { title: 'Группа 2', scheduleGroup: 'two', homework: [
      { id: 'other', subject: 'C', homework: 'C', createdAt: '2026-11-23', authorId: '1', completedBy: {} }
    ] }
  ];
  assert.deepEqual(latestHomework(groups, 'one').map(item => item.id), ['new', 'old']);
  assert.equal(latestHomework(groups, 'one')[0].groupTitle, 'Группа 1');
});

test('builds per-assignment, weekly and all-time completion statistics', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z');
  const students = [
    { telegramId: '101', fullName: 'Анна Иванова' },
    { telegramId: '102', fullName: 'Борис Петров' },
    { telegramId: '103', fullName: 'Вера Сидорова' }
  ];
  const users = {
    '101': { fullName: 'Анна Иванова' },
    '999': { fullName: 'Гость', username: 'guest' }
  };
  const homework = [
    {
      id: 'old', subject: 'История', homework: 'Прочитать',
      createdAt: '2026-11-01T10:00:00.000Z',
      completedBy: { '101': '2026-11-02T10:00:00.000Z', '999': '2026-11-02T11:00:00.000Z' },
      attachments: [{ type: 'video', fileName: 'lesson.mp4' }]
    },
    {
      id: 'new', subject: 'Математика', homework: 'Решить задачи',
      createdAt: '2026-11-22T10:00:00.000Z',
      completedBy: { '102': '2026-11-22T11:00:00.000Z' }
    }
  ];
  const stats = buildHomeworkCompletionStatistics(
    homework, students, users,
    student => String(student && typeof student === 'object' ? student.fullName || '' : student || ''),
    now
  );
  assert.deepEqual(stats.items.map(item => item.id), ['new', 'old']);
  assert.deepEqual(stats.items[0], {
    id: 'new', subject: 'Математика', homework: 'Решить задачи',
    attachments: [], createdAt: '2026-11-22T10:00:00.000Z',
    completedCount: 1, totalStudents: 3, completionRate: 33,
    completedStudents: ['Борис Петров'],
    pendingStudents: ['Анна Иванова', 'Вера Сидорова'],
    unmatchedCompletions: []
  });
  assert.deepEqual(stats.items[1].completedStudents, ['Анна Иванова']);
  assert.deepEqual(stats.items[1].unmatchedCompletions, ['Гость']);
  assert.deepEqual(stats.items[1].attachments, [{ type: 'video', fileName: 'lesson.mp4' }]);
  assert.deepEqual(stats.week, { assignments: 1, completed: 1, possible: 3, rate: 33 });
  assert.deepEqual(stats.all, { assignments: 2, completed: 2, possible: 6 });
});

test('keeps empty roster and malformed homework inputs safe', () => {
  const stats = buildHomeworkCompletionStatistics(
    [{ id: 'x', createdAt: 'not-a-date', completedBy: null, attachments: null }],
    null, null, () => '', Date.parse('2026-11-23T12:00:00.000Z')
  );
  assert.equal(stats.items[0].completionRate, 0);
  assert.deepEqual(stats.items[0].pendingStudents, []);
  assert.deepEqual(stats.week, { assignments: 0, completed: 0, possible: 0, rate: 0 });
  assert.deepEqual(stats.all, { assignments: 1, completed: 0, possible: 0 });
});
