import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInstitutionAndSave,
  deleteInstitutionAndSave,
  addInstitutionAdminAndSave,
  removeInstitutionAdminAndSave
} from '../domain/.build/institution-workflows.js';

test('persists institution creation only when creation succeeds', () => {
  const institutions = {};
  let saves = 0;
  assert.equal(createInstitutionAndSave(institutions, { id: 'inst_a', name: 'Институт' }, () => saves++).ok, true);
  assert.deepEqual(createInstitutionAndSave(institutions, { id: 'inst_a', name: 'Дубликат' }, () => saves++), { ok: false, reason: 'duplicate_id' });
  assert.equal(saves, 1);
});

test('persists institution deletion only when deletion succeeds', () => {
  const institutions = {
    inst_default: { id: 'inst_default', name: 'Основное' },
    inst_used: { id: 'inst_used', name: 'Используется' },
    inst_free: { id: 'inst_free', name: 'Свободно' }
  };
  const groups = { '-100': { institutionId: 'inst_used' } };
  let saves = 0;
  assert.deepEqual(deleteInstitutionAndSave(institutions, 'inst_default', groups, ['inst_default'], () => saves++), { ok: false, reason: 'protected' });
  assert.deepEqual(deleteInstitutionAndSave(institutions, 'inst_used', groups, ['inst_default'], () => saves++), { ok: false, reason: 'has_groups' });
  assert.equal(deleteInstitutionAndSave(institutions, 'inst_free', groups, ['inst_default'], () => saves++).status, 'deleted');
  assert.equal(saves, 1);
});

test('persists institution admin changes only when membership changes', () => {
  const institution = { id: 'inst_a', adminIds: [] };
  let saves = 0;
  assert.deepEqual(addInstitutionAdminAndSave(institution, '123', ['900'], () => saves++), { ok: true, status: 'added' });
  assert.deepEqual(addInstitutionAdminAndSave(institution, '123', ['900'], () => saves++), { ok: true, status: 'already_exists' });
  assert.deepEqual(addInstitutionAdminAndSave(institution, '900', ['900'], () => saves++), { ok: false, reason: 'platform_owner' });
  assert.deepEqual(removeInstitutionAdminAndSave(institution, '456', () => saves++), { ok: true, status: 'not_found' });
  assert.deepEqual(removeInstitutionAdminAndSave(institution, '123', () => saves++), { ok: true, status: 'removed' });
  assert.equal(saves, 2);
});
