import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudentNames } from '../../.test-build/domain/student-import.js';

test('parseStudentNames normalizes numbered roster lines and removes duplicates', () => {
  assert.deepEqual(
    parseStudentNames('Список группы\n1. Иванов Иван Иванович\n2) Петров Пётр Петрович\nИванов Иван Иванович'),
    ['Иванов Иван Иванович', 'Петров Пётр Петрович']
  );
});

test('parseStudentNames ignores headings, invalid lines and excessive word counts', () => {
  assert.deepEqual(parseStudentNames('Фамилия\nИтого\n123\nОчень длинная строка из шести слов'), []);
});

test('parseStudentNames accepts unknown input safely and caps output at 100 names', () => {
  assert.deepEqual(parseStudentNames(null), []);
  const letters = index => String.fromCharCode(97 + (index % 26)) + (index >= 26 ? String.fromCharCode(97 + Math.floor(index / 26)) : '');
  const rows = Array.from({ length: 105 }, (_, index) => `Surname ${letters(index)}`).join('\n');
  assert.equal(parseStudentNames(rows).length, 100);
});
