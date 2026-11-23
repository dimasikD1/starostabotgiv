import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttachedGroupsMessage } from '../domain/.build/attached-groups.js';

test('formats attached groups in their existing order with one-based numbering', () => {
  assert.equal(
    buildAttachedGroupsMessage([{ title: 'Группа А' }, { title: 'Группа Б' }]),
    '👥 Прикреплённые группы:\n\n1. Группа А\n2. Группа Б'
  );
});

test('returns the existing empty-state guidance', () => {
  assert.equal(
    buildAttachedGroupsMessage([]),
    'Нет прикреплённых групп. Добавь бота в группу и выполни /attach.'
  );
});

test('uses a safe fallback when a group has no title', () => {
  assert.equal(
    buildAttachedGroupsMessage([{}]),
    '👥 Прикреплённые группы:\n\n1. Группа без названия'
  );
});
