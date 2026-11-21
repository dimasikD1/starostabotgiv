import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupAccess } from '../../.test-build/domain-user/group-access.js';

function setup() {
  const chatA = { chatId: '-100', title: 'Общий чат', studyGroups: {} };
  const chatB = { chatId: '-200', title: 'Дубликат', studyGroups: {} };
  const groupA1 = { chatId: '-100', studyGroup: 'Группа 1', institutionId: 'inst', starostaId: '11', zamId: '12', students: [{name:'A'}] };
  const groupA2 = { chatId: '-100', studyGroup: 'Группа 2', institutionId: 'inst', starostaId: '21', zamId: '22', students: [] };
  const groupB1 = { chatId: '-200', studyGroup: 'Группа 1', institutionId: 'inst', starostaId: '11', students: [{name:'A'}, {name:'B'}] };
  const groupB2 = { chatId: '-200', studyGroup: 'Группа 2', institutionId: 'inst', starostaId: '31', students: [] };
  chatA.studyGroups = { 'Группа 1': groupA1, 'Группа 2': groupA2 };
  chatB.studyGroups = { 'Группа 1': groupB1, 'Группа 2': groupB2 };
  const db = { groups: { '-100': chatA, '-200': chatB }, defaultRoleSeededChatId: '-100' };
  const allStudyGroups = () => Object.values(db.groups).flatMap(chat => Object.values(chat.studyGroups || {}));
  const ensureStudyGroups = chat => Object.values(chat.studyGroups || {});
  const access = createGroupAccess({
    db,
    isOwner: id => String(id) === '99',
    isInstitutionAdmin: (id, institutionId) => String(id) === '88' && institutionId === 'inst',
    allStudyGroups,
    ensureStudyGroups
  });
  return { access, db, groupA1, groupA2, groupB1 };
}

test('group manager can manage only their appointed cohort', () => {
  const { access, groupA1, groupA2 } = setup();
  assert.equal(access.canManageGroup('11', groupA1), true);
  assert.equal(access.canManageGroup('11', groupA2), false);
  assert.equal(access.canManageGroup('12', groupA1), true);
});

test('chat-wide management requires access to every cohort in the chat', () => {
  const { access } = setup();
  assert.equal(access.canManageChat('11', '-100'), false);
  assert.equal(access.canManageChat('21', '-100'), false);
  assert.equal(access.canManageChat('88', '-100'), true);
  assert.equal(access.canManageChat('99', '-100'), true);
  assert.equal(access.canManageChat('11', '-404'), false);
});

test('managed study groups and chats are restricted to allowed groups', () => {
  const { access } = setup();
  assert.equal(access.managedStudyGroups('11').length, 2);
  assert.equal(access.managedChats('11').length, 0);
  assert.equal(access.managedChats('88').length, 2);
});

test('accessible groups deduplicate copies and prefer the primary chat', () => {
  const { access } = setup();
  const groups = access.accessibleGroups('11');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].chatId, '-100');
  assert.equal(groups[0].title, 'Группа 1');
});

test('managedGroup resolves only an allowed selected group and fills chat metadata', () => {
  const { access, groupA1 } = setup();
  assert.equal(access.managedGroup('11', '-100::Группа 1'), groupA1);
  assert.equal(groupA1.chatTitle, 'Общий чат');
  assert.equal(access.managedGroup('11', '-100::Группа 2'), null);
  assert.equal(access.managedGroup('11'), groupA1);
});
