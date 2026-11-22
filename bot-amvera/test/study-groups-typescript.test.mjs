import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureStudyGroups } from '../domain/.build/study-groups.js';

const options = {
  defaultInstitutionId: 'inst_default',
  names: ['БИ-1', 'БИ-2'],
  starostas: { 'БИ-1': '101', 'БИ-2': '202' },
  zams: { 'БИ-1': '111', 'БИ-2': '222' },
  now: () => '2026-11-22T00:00:00.000Z'
};

test('migrates legacy chat data into the first study group and initializes both groups', () => {
  const chat = {
    chatId: '-1001', title: 'Учебный чат', students: [{ name: 'А' }],
    attendance: { today: ['101'] }, starostaId: '303'
  };
  const db = { groups: { '-1001': chat } };
  const result = ensureStudyGroups(db, chat, options);
  assert.equal(result.changed, true);
  assert.equal(result.institutionId, 'inst_default');
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups[0].students, [{ name: 'А' }]);
  assert.deepEqual(result.groups[0].attendance, { today: ['101'] });
  assert.equal(result.groups[0].starostaId, '303');
  assert.equal(result.groups[1].starostaId, '202');
  assert.equal(result.groups[0].chatId, '-1001');
  assert.equal(db.institutions?.inst_default?.status, 'active');
});

test('does not copy platform default roles into another institution', () => {
  const chat = {
    chatId: '-2002', title: 'Другой вуз', institutionId: 'inst_other',
    studyGroups: { 'БИ-1': { starostaId: '101', zamId: '111' } }
  };
  const db = { groups: { '-2002': chat }, defaultRoleSeededChatId: '-1001' };
  const result = ensureStudyGroups(db, chat, options);
  assert.equal(result.groups[0].starostaId, undefined);
  assert.equal(result.groups[0].zamId, undefined);
  assert.equal(result.groups[0].institutionId, 'inst_other');
});

test('preserves explicit roles and is idempotent after migration', () => {
  const chat = {
    chatId: '-1001', institutionId: 'inst_default',
    studyGroups: { 'БИ-1': { starostaId: '999', students: [{ name: 'Б' }] } },
    _studyGroupsMigratedV1: true, _institutionMigrationV1: true, _groupRoleScopeV1: true
  };
  const db = { groups: { '-1001': chat }, defaultRoleSeededChatId: '-1001',
    institutions: { inst_default: { id: 'inst_default' } } };
  const result = ensureStudyGroups(db, chat, options);
  assert.equal(result.groups[0].starostaId, '999');
  assert.deepEqual(result.groups[0].students, [{ name: 'Б' }]);
  assert.equal(result.changed, false);
});
