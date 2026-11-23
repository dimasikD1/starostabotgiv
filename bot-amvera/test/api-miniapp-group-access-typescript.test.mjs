import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMiniAppGroupAccess } from '../../.test-build/api/miniapp-group-access.js';

test('returns the selected group when the user has manager access', () => {
  const group = { id: 'group-1', title: 'Первая группа' };
  const result = resolveMiniAppGroupAccess(123, 'group-1', {
    getManagedGroup: (userId, groupId) => userId === 123 && groupId === 'group-1' ? group : null,
    canManageGroup: (userId, selected) => userId === 123 && selected === group
  });
  assert.deepEqual(result, { kind: 'authorized', group });
});

test('denies access when the group cannot be resolved', () => {
  const result = resolveMiniAppGroupAccess(123, 'missing', {
    getManagedGroup: () => null,
    canManageGroup: () => true
  });
  assert.deepEqual(result, {
    kind: 'forbidden',
    message: 'Нет доступа к выбранной группе. Обнови список групп.'
  });
});

test('denies access when the resolved group is not manageable', () => {
  const group = { id: 'group-2' };
  const result = resolveMiniAppGroupAccess('123', 'group-2', {
    getManagedGroup: () => group,
    canManageGroup: () => false
  });
  assert.equal(result.kind, 'forbidden');
});
