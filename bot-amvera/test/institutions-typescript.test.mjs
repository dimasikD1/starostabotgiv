import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listInstitutions, hasInstitutionName, createInstitution,
  renameInstitution, setInstitutionActive, deleteInstitution
} from '../domain/.build/institutions.js';

test('creates institutions with normalized name and legacy-compatible structure', () => {
  const db = {};
  assert.deepEqual(createInstitution(db, { id: 'inst_demo', name: '  Новый институт  ', createdAt: 'now' }), { ok: true, status: 'created', id: 'inst_demo' });
  assert.equal(db.inst_demo.name, 'Новый институт');
  assert.deepEqual(db.inst_demo.faculties, {});
  assert.equal(db.inst_demo.status, 'active');
  assert.deepEqual(createInstitution(db, { id: 'inst_demo', name: 'Другой' }), { ok: false, reason: 'duplicate_id' });
  assert.deepEqual(createInstitution(db, { id: 'inst_other', name: 'новый институт' }), { ok: false, reason: 'duplicate_name' });
  assert.deepEqual(createInstitution(db, { id: 'bad id', name: 'X' }), { ok: false, reason: 'invalid_id' });
  assert.deepEqual(createInstitution(db, { id: 'inst_x', name: ' ' }), { ok: false, reason: 'invalid_name' });
});

test('lists institutions and safely renames without duplicate names', () => {
  const db = { inst_b: { id: 'inst_b', name: 'Бета' }, inst_a: { id: 'inst_a', name: 'Альфа' } };
  assert.deepEqual(listInstitutions(db).map(x => x.id), ['inst_a', 'inst_b']);
  assert.equal(hasInstitutionName(db, ' альфа '), true);
  assert.deepEqual(renameInstitution(db, 'inst_a', 'Новое имя'), { ok: true, status: 'renamed', id: 'inst_a' });
  assert.deepEqual(renameInstitution(db, 'inst_a', 'Бета'), { ok: false, reason: 'duplicate_name' });
  assert.deepEqual(renameInstitution(db, 'missing', 'X'), { ok: false, reason: 'not_found' });
});

test('activates and deactivates an institution without deleting its data', () => {
  const db = { inst_a: { id: 'inst_a', name: 'А', faculties: { fac: { id: 'fac' } } } };
  assert.deepEqual(setInstitutionActive(db, 'inst_a', false), { ok: true, status: 'deactivated', id: 'inst_a' });
  assert.equal(db.inst_a.faculties.fac.id, 'fac');
  assert.deepEqual(setInstitutionActive(db, 'inst_a', true), { ok: true, status: 'activated', id: 'inst_a' });
});

test('deletes only unreferenced, unprotected institutions', () => {
  const db = { inst_default: { id: 'inst_default', name: 'Основное' }, inst_used: { id: 'inst_used', name: 'Используется' }, inst_free: { id: 'inst_free', name: 'Свободно' } };
  const groups = { '-100': { studyGroups: [{ institutionId: 'inst_used' }] } };
  assert.deepEqual(deleteInstitution(db, 'inst_default', groups, ['inst_default']), { ok: false, reason: 'protected' });
  assert.deepEqual(deleteInstitution(db, 'inst_used', groups), { ok: false, reason: 'has_groups' });
  assert.deepEqual(deleteInstitution(db, 'inst_free', groups), { ok: true, status: 'deleted', id: 'inst_free' });
  assert.equal(db.inst_free, undefined);
});
