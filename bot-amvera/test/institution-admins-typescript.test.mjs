import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInstitutionAdminId, addInstitutionAdmin, removeInstitutionAdmin, listInstitutionAdmins, checkInstitutionAccess
} from '../domain/.build/institution-admins.js';

test('recognizes institution admins and platform owners', () => {
  const institution = { id: 'inst_a', adminIds: ['123', 456] };
  assert.equal(isInstitutionAdminId(institution, 123), true);
  assert.equal(isInstitutionAdminId(institution, '456'), true);
  assert.equal(isInstitutionAdminId(institution, '789'), false);
  assert.equal(isInstitutionAdminId(undefined, '789', true), true);
  assert.equal(isInstitutionAdminId(undefined, '789'), false);
});

test('adds admins once and never adds platform owners as institution admins', () => {
  const institution = { id: 'inst_a' };
  assert.deepEqual(addInstitutionAdmin(institution, '123', ['900']), { ok: true, status: 'added' });
  assert.deepEqual(addInstitutionAdmin(institution, 123, ['900']), { ok: true, status: 'already_exists' });
  assert.deepEqual(addInstitutionAdmin(institution, '900', ['900']), { ok: false, reason: 'platform_owner' });
  assert.deepEqual(addInstitutionAdmin(institution, 'not-an-id'), { ok: false, reason: 'invalid_user_id' });
  assert.deepEqual(institution.adminIds, ['123']);
});

test('removes only the selected admin and lists normalized Telegram IDs', () => {
  const institution = { id: 'inst_a', adminIds: ['123', 456, '789'] };
  assert.deepEqual(removeInstitutionAdmin(institution, 456), { ok: true, status: 'removed' });
  assert.deepEqual(removeInstitutionAdmin(institution, '456'), { ok: true, status: 'not_found' });
  assert.deepEqual(listInstitutionAdmins(institution), ['123', '789']);
  assert.deepEqual(removeInstitutionAdmin(institution, 'bad'), { ok: false, reason: 'invalid_user_id' });
});

test('enforces tenant-scoped admin access and preserves platform owner access', () => {
  const institution = { id: 'inst_a', adminIds: ['123'], status: 'active' };
  assert.deepEqual(checkInstitutionAccess(institution, '123', ['900']), { allowed: true, role: 'institution_admin' });
  assert.deepEqual(checkInstitutionAccess(institution, '456', ['900']), { allowed: false, reason: 'forbidden' });
  assert.deepEqual(checkInstitutionAccess({ ...institution, status: 'inactive' }, '123', ['900']), { allowed: false, reason: 'institution_inactive' });
  assert.deepEqual(checkInstitutionAccess(undefined, '123', ['900']), { allowed: false, reason: 'institution_not_found' });
  assert.deepEqual(checkInstitutionAccess(undefined, '900', ['900']), { allowed: true, role: 'platform_owner' });
});
