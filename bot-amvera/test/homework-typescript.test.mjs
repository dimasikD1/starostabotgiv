import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendHomework,
  createHomeworkRecord,
  latestHomework,
  markHomeworkCompleted,
  parseHomeworkCommand
} from '../../.test-build/domain-homework/homework.js';

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
