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
  normalizeStudentPhone,
  assignStudyGroupRoleByNumber,
  removeGroupRolesAndSetStudent,
  getStudentRosterPage,
  getStudentCard,
  replaceStudentRoster,
  confirmStudentRosterImport
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


test('assigns a role only to the numbered study group in the current chat', () => {
  const groups = [
    { studyGroup: 'Группа 1', chatId: '-100', starostaId: '' },
    { studyGroup: 'Группа 2', chatId: '-100', starostaId: '' }
  ];
  const user = {};
  const result = assignStudyGroupRoleByNumber(
    groups, user, 'zam', 42, '2',
    { '1': 'Группа 1', '2': 'Группа 2' },
    { username: 'student42', chatId: '-100', institutionId: 'inst_001' }
  );
  assert.equal(result.status, 'assigned');
  assert.equal(groups[0].zamId, undefined);
  assert.equal(groups[1].zamId, '42');
  assert.equal(user.group, 'Группа 2');
});

test('rejects assigning a deputy role to the current group starosta', () => {
  const groups = [{ studyGroup: 'Группа 1', starostaId: '42' }];
  const result = assignStudyGroupRoleByNumber(
    groups, {}, 'zam', 42, '1', { '1': 'Группа 1' },
    { chatId: '-100', institutionId: 'inst_001' }
  );
  assert.deepEqual(result, { status: 'target-is-starosta' });
});

test('reports missing numbered groups without modifying users', () => {
  const user = {};
  const result = assignStudyGroupRoleByNumber(
    [], user, 'starosta', 42, '2', { '1': 'Группа 1' },
    { chatId: '-100', institutionId: 'inst_001' }
  );
  assert.deepEqual(result, { status: 'group-not-found' });
  assert.deepEqual(user, {});
});


test('removes roles globally and synchronizes an existing profile to student', () => {
  const groups = [
    { chatId: '-1', starostaId: '7', zamId: '' },
    { chatId: '-2', starostaId: '', zamId: '7' }
  ];
  const user = { role: 'zam', groupChatId: '-2' };
  const result = removeGroupRolesAndSetStudent(groups, user, '7');
  assert.equal(result.removed, 2);
  assert.equal(user.role, 'student');
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].zamId, '');
});

test('removes roles only from the requested chat and preserves another chat assignment', () => {
  const groups = [
    { chatId: '-1', starostaId: '7', zamId: '' },
    { chatId: '-2', starostaId: '', zamId: '7' }
  ];
  const user = { role: 'zam', groupChatId: '-1' };
  const result = removeGroupRolesAndSetStudent(groups, user, '7', '-1');
  assert.equal(result.removed, 1);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].zamId, '7');
  assert.equal(user.role, 'student');
  assert.equal('groupChatId' in user, false);
});


test('builds paginated roster entries with stable indexes and clamps page bounds', () => {
  const group = { students: ['A', { name: 'B' }, 'C'] };
  assert.deepEqual(getStudentRosterPage(group, 1, 2), {
    items: [{ index: 2, name: 'C' }], page: 1, pages: 2, total: 3
  });
  assert.deepEqual(getStudentRosterPage(group, 99, 2), {
    items: [{ index: 2, name: 'C' }], page: 1, pages: 2, total: 3
  });
});

test('reads student contact cards from both legacy and object records', () => {
  const group = { students: ['Иван Иванов', {
    name: 'Анна', username: 'anna_1', phone: '+37255555555', telegramId: '42'
  }] };
  assert.deepEqual(getStudentCard(group, 0), {
    index: 0, name: 'Иван Иванов', username: '', phone: '', telegramId: ''
  });
  assert.deepEqual(getStudentCard(group, 1), {
    index: 1, name: 'Анна', username: 'anna_1', phone: '+37255555555', telegramId: '42'
  });
  assert.equal(getStudentCard(group, 2), undefined);
});


test('replaces a reviewed roster, initializes attendance, and syncs user copy', () => {
  const group = { students: ['old'], attendance: undefined };
  const user = {};
  const result = replaceStudentRoster(group, user, ['Иван', 'Анна']);
  assert.deepEqual(result, { count: 2, truncated: false });
  assert.deepEqual(group.students, ['Иван', 'Анна']);
  assert.deepEqual(group.attendance, {});
  assert.deepEqual(user.students, ['Иван', 'Анна']);
  assert.notEqual(user.students, group.students);
});

test('caps imported roster at 100 without mutating the supplied names', () => {
  const names = Array.from({ length: 105 }, (_, i) => 'Student ' + i);
  const group = {};
  const user = {};
  const result = replaceStudentRoster(group, user, names);
  assert.deepEqual(result, { count: 100, truncated: true });
  assert.equal(group.students.length, 100);
  assert.equal(names.length, 105);
});

test('confirms reviewed import and clears only the import workflow fields', () => {
  const group = { students: ['old'] };
  const user = {
    pendingStudentImport: false,
    pendingStudentImportChatId: '-100',
    pendingStudentImportReview: ['New A'],
    fullName: 'Preserve Me'
  };
  const result = confirmStudentRosterImport(group, user, ['New A', 'New B']);
  assert.deepEqual(result, { count: 2, truncated: false });
  assert.deepEqual(group.students, ['New A', 'New B']);
  assert.deepEqual(user.students, ['New A', 'New B']);
  assert.equal('pendingStudentImport' in user, false);
  assert.equal('pendingStudentImportChatId' in user, false);
  assert.equal('pendingStudentImportReview' in user, false);
  assert.equal(user.fullName, 'Preserve Me');
});

import {
  addTelegramStudentAndSave,
  addNamedStudentAndSave,
  removeStudentAtAndSave
} from '../../.test-build/domain/student-roster-workflows.js';

test('persists Telegram student additions and updates, but not a full roster', () => {
  const group = { students: [{ name: 'Иван', telegramId: '10' }] };
  let saves = 0;
  assert.equal(addTelegramStudentAndSave(group, { name: 'Иван Петров', telegramId: '10' }, () => saves++), 'updated');
  assert.equal(addTelegramStudentAndSave(group, { name: 'Анна', telegramId: '11' }, () => saves++), 'added');
  assert.equal(addTelegramStudentAndSave({ students: ['x'] }, { name: 'Пётр', telegramId: '12' }, () => saves++), 'added');
  assert.equal(addTelegramStudentAndSave({ students: ['x'] }, { name: 'Елена', telegramId: '13' }, () => saves++), 'limit');
  assert.equal(saves, 3);
});

test('persists named student additions only when inserted', () => {
  const group = { students: ['Иван Иванов'] };
  let saves = 0;
  assert.equal(addNamedStudentAndSave(group, 'иван иванов', () => saves++), 'duplicate');
  assert.equal(addNamedStudentAndSave(group, 'Пётр Петров', () => saves++), 'added');
  assert.equal(addNamedStudentAndSave({ students: Array(100).fill('x') }, 'Новый', () => saves++), 'limit');
  assert.equal(saves, 1);
});

test('persists student deletion only for a valid index', () => {
  const group = { students: ['Иван', 'Пётр'] };
  let saves = 0;
  assert.equal(removeStudentAtAndSave(group, 5, () => saves++), undefined);
  assert.equal(removeStudentAtAndSave(group, 0, () => saves++), 'Иван');
  assert.deepEqual(group.students, ['Пётр']);
  assert.equal(saves, 1);
});
