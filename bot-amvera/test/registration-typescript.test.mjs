import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndNormalizeFullName,
  applyStudyGroupSelection,
  shouldPromptStudyGroup,
  completeFullNameRegistration
} from '../domain/.build/registration.js';

test('validates and normalizes full names using the existing registration rules', () => {
  assert.deepEqual(validateAndNormalizeFullName('  иВАНОВ   иВАН  '), { ok: true, value: 'Иванов Иван' });
  assert.equal(validateAndNormalizeFullName('Иван').ok, false);
  assert.equal(validateAndNormalizeFullName('Иван Иван Иван Иван Иван Иван').reason, 'word_count');
  assert.equal(validateAndNormalizeFullName('Иван 123').reason, 'characters');
});

test('assigns selected group while preserving manager roles and legacy fields', () => {
  const ownerLikeManager = { role: 'starosta', group: '', groupChatId: 'old', institutionId: 'inst_old' };
  assert.deepEqual(applyStudyGroupSelection(ownerLikeManager, 'Группа 2'), {
    role: 'starosta', group: 'Группа 2', groupChatId: 'old', institutionId: 'inst_old'
  });
  assert.deepEqual(applyStudyGroupSelection({ role: 'student' }, 'Группа 1', { chatId: -123, institutionId: 'inst_2' }), {
    role: 'student', group: 'Группа 1', groupChatId: '-123', institutionId: 'inst_2'
  });
  assert.equal(applyStudyGroupSelection({ role: '' }, 'Группа', { chatId: 1 }).institutionId, 'inst_001');
});

test('prompts only unregistered non-owner users in group chats on non-command messages', () => {
  const base = { isOwner: false, updateType: 'message', chatType: 'supergroup', hasGroup: false, messageText: 'Привет' };
  assert.equal(shouldPromptStudyGroup(base), true);
  assert.equal(shouldPromptStudyGroup({ ...base, isOwner: true }), false);
  assert.equal(shouldPromptStudyGroup({ ...base, chatType: 'private' }), false);
  assert.equal(shouldPromptStudyGroup({ ...base, hasGroup: true }), false);
  assert.equal(shouldPromptStudyGroup({ ...base, messageText: '/start' }), false);
});

test('completes full-name registration only after valid input', () => {
  const user = { fullName: '', pendingFullName: true, role: 'student' };
  assert.deepEqual(completeFullNameRegistration(user, '  иВАНОВ   иВАН  '), {
    ok: true, value: 'Иванов Иван'
  });
  assert.equal(user.fullName, 'Иванов Иван');
  assert.equal(user.pendingFullName, false);
  assert.equal(user.role, 'student');
  const invalid = { fullName: '', pendingFullName: true };
  assert.equal(completeFullNameRegistration(invalid, 'Иван').ok, false);
  assert.equal(invalid.fullName, '');
  assert.equal(invalid.pendingFullName, true);
});
