import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignAndPersistStudyGroupRole,
  removeAndPersistStudyGroupRoles
} from '../../.test-build/domain/role-command-workflows.js';

const names = { '1': 'Group One', '2': 'Group Two' };

test('assigns a role and persists exactly once after successful resolution', () => {
  const group = { studyGroup: 'Group One', chatId: '-100' };
  const user = {};
  let saves = 0;
  const result = assignAndPersistStudyGroupRole(
    [group], user, 'starosta', 10, '1', names,
    { username: 'student', chatId: '-100', institutionId: 'inst_001' },
    () => saves++
  );
  assert.equal(result.status, 'assigned');
  assert.equal(group.starostaId, '10');
  assert.equal(user.role, 'starosta');
  assert.equal(saves, 1);
});

test('does not persist failed role assignment', () => {
  let saves = 0;
  const result = assignAndPersistStudyGroupRole(
    [], {}, 'zam', 11, '2', names,
    { chatId: '-100', institutionId: 'inst_001' },
    () => saves++
  );
  assert.deepEqual(result, { status: 'group-not-found' });
  assert.equal(saves, 0);
});

test('removes roles within the requested chat and persists', () => {
  const groups = [
    { chatId: '-1', starostaId: '5' },
    { chatId: '-2', zamId: '5' }
  ];
  const user = { role: 'zam', groupChatId: '-1' };
  let saves = 0;
  const result = removeAndPersistStudyGroupRoles(groups, user, 5, '-1', () => saves++);
  assert.equal(result.removed, 1);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].zamId, '5');
  assert.equal(user.role, 'student');
  assert.equal(saves, 1);
});

import { setSelfAsStudentAndSave } from '../../.test-build/domain/role-command-workflows.js';

test('self-demotion clears all group roles and persists the student role once', () => {
  const groups = [
    { starostaId: '77', zamId: '' },
    { starostaId: '', zamId: '77' },
    { starostaId: '88', zamId: '' }
  ];
  const user = { role: 'starosta', groupChatId: '-100' };
  let saves = 0;
  const removed = setSelfAsStudentAndSave(groups, user, '77', () => saves++);
  assert.equal(removed, 2);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].zamId, '');
  assert.equal(groups[2].starostaId, '88');
  assert.equal(user.role, 'student');
  assert.equal(user.groupChatId, '-100');
  assert.equal(saves, 1);
});

import { setGroupMemberAsStudentAndSave } from '../../.test-build/domain/role-command-workflows.js';

test('demotes a member only in the requested chat and saves once', () => {
  const groups = [
    { chatId: '-100', starostaId: '55', zamId: '' },
    { chatId: '-200', starostaId: '', zamId: '55' }
  ];
  const user = { role: 'starosta', groupChatId: '-100' };
  let saves = 0;
  const result = setGroupMemberAsStudentAndSave(groups, user, '55', '-100', () => saves++);
  assert.equal(result.removed, 1);
  assert.equal(groups[0].starostaId, '');
  assert.equal(groups[1].zamId, '55');
  assert.equal(user.role, 'student');
  assert.equal(user.groupChatId, undefined);
  assert.equal(saves, 1);
});

test('demotes a member even when the chat has no registered group record', () => {
  const user = { role: 'zam', groupChatId: '-300' };
  let saves = 0;
  const result = setGroupMemberAsStudentAndSave(undefined, user, '66', '-300', () => saves++);
  assert.deepEqual(result, { removed: 0 });
  assert.equal(user.role, 'student');
  assert.equal(user.groupChatId, undefined);
  assert.equal(saves, 1);
});
