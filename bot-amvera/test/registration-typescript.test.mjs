import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndNormalizeFullName,
  applyStudyGroupSelection,
  shouldPromptStudyGroup,
  getSavedStudyGroup,
  completeFullNameRegistration,
  parseStudyGroupSelection
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

test('recognizes saved study-group choices in legacy profile fields', () => {
  const groups = { '1': 'БИ(ЭБ)1-ОЗ/Бп/КД26', '2': 'БИ(ЭБ)2-ОЗ/Бп/КД26' };
  assert.equal(getSavedStudyGroup({ group: groups['2'] }, groups), groups['2']);
  assert.equal(getSavedStudyGroup({ studyGroup: groups['1'] }, groups), groups['1']);
  assert.equal(getSavedStudyGroup({ study_group: groups['2'] }, groups), groups['2']);
  assert.equal(getSavedStudyGroup({ groupName: groups['1'] }, groups), groups['1']);
  assert.equal(getSavedStudyGroup({ group: '1' }, groups), groups['1']);
  assert.equal(getSavedStudyGroup({ studyGroupName: '2' }, groups), groups['2']);
  assert.equal(getSavedStudyGroup({ group: 'unknown' }, groups), undefined);
  assert.equal(getSavedStudyGroup({}, groups), undefined);
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

test('parses only configured study group numbers or exact names', () => {
  const groups = { '1': 'БИ(ЭБ)1-ОЗ/Бп/КД26', '2': 'БИ(ЭБ)2-ОЗ/Бп/КД26' };
  assert.equal(parseStudyGroupSelection('1', groups), groups['1']);
  assert.equal(parseStudyGroupSelection(' 2 ', groups), groups['2']);
  assert.equal(parseStudyGroupSelection(groups['1'], groups), groups['1']);
  assert.equal(parseStudyGroupSelection('БИ(ЭБ)3', groups), undefined);
  assert.equal(parseStudyGroupSelection('', groups), undefined);
});


test('resolves configured group selection with linked institution and pending verification state', async () => {
  const { resolveStudyGroupRegistration } = await import('../domain/.build/registration.js');
  const sourceUser = {
    role: 'student',
    pendingVerificationChatId: '-100123',
    pendingVerificationChatTitle: 'Учебная группа'
  };
  const result = resolveStudyGroupRegistration({
    user: sourceUser,
    groupKey: '2',
    groups: { '1': 'Группа 1', '2': 'Группа 2' },
    linkedGroups: [
      { studyGroup: 'Группа 2', chatId: -100456, institutionId: 'inst_2' }
    ]
  });
  assert.ok(result);
  assert.equal(result.selectedGroup, 'Группа 2');
  assert.equal(result.user.group, 'Группа 2');
  assert.equal(result.user.groupChatId, '-100456');
  assert.equal(result.user.institutionId, 'inst_2');
  assert.equal(result.verificationChatId, '-100123');
  assert.equal(result.requiresVerification, true);
  assert.equal(sourceUser.group, undefined);
  assert.equal(sourceUser.pendingVerificationChatTitle, 'Учебная группа');
});

test('resolves ordinary group selection without linked chat or verification', async () => {
  const { resolveStudyGroupRegistration } = await import('../domain/.build/registration.js');
  const result = resolveStudyGroupRegistration({
    user: { role: '', pendingVerificationChatId: '' },
    groupKey: '1',
    groups: { '1': 'Группа 1' },
    linkedGroups: []
  });
  assert.ok(result);
  assert.equal(result.user.role, 'student');
  assert.equal(result.user.group, 'Группа 1');
  assert.equal(result.user.institutionId, undefined);
  assert.equal(result.requiresVerification, false);
  assert.equal(result.verificationChatId, '');
});

test('rejects unknown study group registration keys', async () => {
  const { resolveStudyGroupRegistration } = await import('../domain/.build/registration.js');
  assert.equal(resolveStudyGroupRegistration({
    user: {},
    groupKey: '9',
    groups: { '1': 'Группа 1' },
    linkedGroups: []
  }), undefined);
});
