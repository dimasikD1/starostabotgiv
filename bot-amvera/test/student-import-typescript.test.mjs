import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStudentNames, formatStudentImportPreview } from '../../.test-build/domain/student-import.js';

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


test('formats the student import preview with escaped HTML and the legacy text layout', () => {
  assert.equal(
    formatStudentImportPreview('Группа <1> & "А"', ['Иванов Иван', 'Петров <Пётр>']),
    '📝 <b>Проверь список студентов</b>\n👥 Группа: <b>Группа &lt;1&gt; & "А"</b>\n👨‍🎓 Найдено: <b>2</b>\n\nИванов Иван\nПетров &lt;Пётр&gt;\n\nПосле подтверждения текущий список группы будет заменён этим списком.'
  );
});

test('formats numbered student import previews with stable one-based numbering', () => {
  assert.equal(
    formatStudentImportPreview('Группа 2', ['Иванов Иван', 'Петров Пётр'], true),
    '📝 <b>Проверь список студентов</b>\n👥 Группа: <b>Группа 2</b>\n👨‍🎓 Найдено: <b>2</b>\n\n1. Иванов Иван\n2. Петров Пётр\n\nПосле подтверждения текущий список группы будет заменён этим списком.'
  );
});
