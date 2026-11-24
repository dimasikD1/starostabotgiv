import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGrantCommandInput, parseAdminTargetId } from '../../.test-build/domain/admin-command-input.js';

test('parses valid grant arguments and default duration', () => {
  assert.deepEqual(parseGrantCommandInput('/grant 123456789', 30), { targetId: '123456789', forever: false, days: 30 });
  assert.deepEqual(parseGrantCommandInput('/grant@starostagivbot 123456789 45', 30), { targetId: '123456789', forever: false, days: 45 });
  assert.deepEqual(parseGrantCommandInput('/grant 123456789 ПОЖИЗНЕННО', 30), { targetId: '123456789', forever: true, days: null });
});

test('rejects invalid grant targets and durations', () => {
  for (const value of ['', '/grant', '/grant abc 30', '/grant 123 0', '/grant 123 3651', '/grant 123 1.5', null]) {
    assert.equal(parseGrantCommandInput(value, 30), null);
  }
});

test('parses revoke and subinfo target IDs with optional bot mentions', () => {
  assert.equal(parseAdminTargetId('/revoke 123456789', 'revoke'), '123456789');
  assert.equal(parseAdminTargetId('/subinfo@starostagivbot 987654321', 'subinfo'), '987654321');
  assert.equal(parseAdminTargetId('/revoke abc', 'revoke'), null);
  assert.equal(parseAdminTargetId('/subinfo', 'subinfo'), null);
  assert.equal(parseAdminTargetId(null, 'revoke'), null);
});


test('extracts institution admin command arguments with optional bot mention', async () => {
  const { parseInstitutionAdminCommandInput } = await import('../../.test-build/domain/admin-command-input.js');
  assert.deepEqual(parseInstitutionAdminCommandInput('/setinstadmin inst_001 123456', 'setinstadmin'), {
    institutionId: 'inst_001', userId: '123456'
  });
  assert.deepEqual(parseInstitutionAdminCommandInput('/removeinstadmin@starostagivbot inst_002 987654', 'removeinstadmin'), {
    institutionId: 'inst_002', userId: '987654'
  });
  assert.deepEqual(parseInstitutionAdminCommandInput('/setinstadmin inst_001', 'setinstadmin'), {
    institutionId: 'inst_001', userId: ''
  });
  assert.deepEqual(parseInstitutionAdminCommandInput(null, 'removeinstadmin'), {
    institutionId: '', userId: ''
  });
});
