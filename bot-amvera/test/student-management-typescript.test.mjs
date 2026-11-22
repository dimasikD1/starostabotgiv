import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTelegramStudent,
  addNamedStudent,
  removeStudentAt,
  updateStudentField,
  assignStudyGroupRole,
  clearStudyGroupRoles,
  setStudentRole,
  normalizeStudentUsername,
  normalizeStudentPhone
} from '../../.test-build/domain-user/student-management.js';

test('adds Telegram-linked students, updates existing IDs, and enforces the cap', () => {
  const group = { students: [{ name: 'Иван', telegramId: '10', username: 'old' }] };
  assert.equal(addTelegramStudent(group, { name: 'Иван Петров', telegramId: '10', username: 'new' }), 'updated');
  assert.equal(group.students.length, 1);
  assert.equal(group.students[0].username, 'new');
  assert.equal(addTelegramStudent(group, { name: 'Анна', telegramId: '11' }), 'added');
  assert.equal(addTelegramStudent({ students: ['x'] }, { name: 'y', telegramId: '2' }, 1), 'limit');
});

test('adds name-only records without case-insensitive duplicates', () => {
  const group = { students: ['Иван Иванов'] };
  assert.equal(addNamedStudent(group, 'иван иванов'), 'duplicate');
  assert.equal(addNamedStudent(group, 'Пётр Петров'), 'added');
  assert.equal(group.students[1], 'Пётр Петров');
});

test('removes a valid index and rejects invalid indices', () => {
  const group = { students: ['A', 'B'] };
  assert.equal(removeStudentAt(group, 4), undefined);
  assert.equal(removeStudentAt(group, 1), 'B');
  assert.deepEqual(group.students, ['A']);
});

test('updates contact fields for both legacy string and object records', () => {
  const group = { students: ['Иван Иванов', { name: 'Анна' }] };
  updateStudentField(group, 0, 'username', 'ivan');
  updateStudentField(group, 1, 'phone', '+37255555555');
  assert.deepEqual(group.students, [
    { name: 'Иван Иванов', username: 'ivan' },
    { name: 'Анна', phone: '+37255555555' }
  ]);
});

test('assigns group-specific roles and synchronizes user profile fields', () => {
  const group = { studyGroup: 'Группа 1' };
  const user = {};
  assignStudyGroupRole(group, user, 'zam', 42, {
    username: 'student42', chatId: -100, institutionId: 'inst_001', groupName: 'Группа 1'
  });
  assert.equal(group.zamId, '42');
  assert.equal(group._roleAssignmentsInitialized, true);
  assert.deepEqual(user, {
    role: 'zam', username: 'student42', group: 'Группа 1',
    groupChatId: '-100', institutionId: 'inst_001'
  });
});

test('clears only the requested chat roles and reports each removed assignment', () => {
  const groups = [
    { chatId: '-1', starostaId: '7', zamId: '8' },
    { chatId: '-2', starostaId: '7', zamId: '' }
  ];
  assert.equal(clearStudyGroupRoles(groups, '7', '-1'), 1);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].starostaId, '7');
  assert.equal(clearStudyGroupRoles(groups, '7'), 1);
  assert.equal(groups[1].starostaId, '');
});

test('can clear a self-assigned role without marking unrelated migration state initialized', () => {
  const groups = [{ starostaId: '7', _roleAssignmentsInitialized: false }];
  clearStudyGroupRoles(groups, '7', undefined, false);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[0]._roleAssignmentsInitialized, false);
});

test('sets the student role and only clears matching chat context', () => {
  const user = { role: 'starosta', groupChatId: '-100' };
  setStudentRole(user, '-100');
  assert.equal(user.role, 'student');
  assert.equal('groupChatId' in user, false);
});


test('normalizes student usernames with the legacy validation rules', () => {
  assert.deepEqual(normalizeStudentUsername('@student_1'), { ok: true, value: 'student_1' });
  assert.deepEqual(normalizeStudentUsername('-'), { ok: true, value: '' });
  assert.deepEqual(normalizeStudentUsername('bad username'), { ok: false });
});

test('normalizes student phone numbers with the legacy international format rules', () => {
  assert.deepEqual(normalizeStudentPhone('+372 5555 5555'), { ok: true, value: '+37255555555' });
  assert.deepEqual(normalizeStudentPhone('-'), { ok: true, value: '' });
  assert.deepEqual(normalizeStudentPhone('12345'), { ok: false });
});
