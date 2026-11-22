import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMiniAppProfileName } from '../../.test-build/api/input-validation.js';

test('normalizes a valid profile full name without changing the existing casing rule', () => {
  assert.deepEqual(validateMiniAppProfileName('  иВАНОВ   иВАН  пЕТРОВИЧ '), {
    ok: true,
    value: 'ИВАНОВ ИВАН ПЕТРОВИЧ'
  });
});

test('rejects profile names shorter than five or longer than one hundred characters', () => {
  assert.equal(validateMiniAppProfileName('Иван').reason, 'length');
  assert.equal(validateMiniAppProfileName('А'.repeat(101) + ' Б').reason, 'length');
});

test('rejects names with one word or unsupported characters', () => {
  assert.equal(validateMiniAppProfileName('Иванов').reason, 'format');
  assert.equal(validateMiniAppProfileName('Иванов 123').reason, 'format');
  assert.equal(validateMiniAppProfileName('Иванов <Иван>').reason, 'format');
});

test('accepts supported punctuation and Unicode letters', () => {
  assert.equal(validateMiniAppProfileName('Анна-Мария О’Коннор').ok, true);
  assert.equal(validateMiniAppProfileName('Émile Zola').ok, true);
});
