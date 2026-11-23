/** Parse a pasted student roster into a normalized, de-duplicated list of names. */
export function parseStudentNames(raw: unknown): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (let line of String(raw ?? '').split(/\r?\n/)) {
    line = line
      .replace(/\t+/g, ' ')
      .replace(/^\s*(?:№\s*)?\d+[.)]?[\s.)-]*/, '')
      .replace(/^\s*[-•*]\s*/, '')
      .trim();
    line = line.split(/\s{3,}/)[0].trim().replace(/\s+/g, ' ').replace(/\s+\d+\s*$/, '').trim();
    const words = line.split(' ').filter(Boolean);

    if (
      line.length < 5 ||
      words.length < 2 ||
      words.length > 5 ||
      !/^[a-zа-яё .-]+$/i.test(line) ||
      /^(список|группа|фамилия|имя|отчество|студенты|итого|всего)$/i.test(words[0])
    ) continue;

    const name = words.map(word => word[0].toLocaleUpperCase('ru-RU') + word.slice(1)).join(' ');
    const key = name.toLocaleLowerCase('ru-RU');
    if (!seen.has(key)) {
      seen.add(key);
      output.push(name);
    }
  }

  return output.slice(0, 100);
}

/** Build the Telegram HTML preview for a parsed roster before replacement. */
export function formatStudentImportPreview(groupTitle: string, names: string[], numbered = false): string {
  const escape = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const preview = names.map((name, index) => (numbered ? String(index + 1) + '. ' : '') + escape(name)).join('\n');
  return '📝 <b>Проверь список студентов</b>\n👥 Группа: <b>' + escape(groupTitle) +
    '</b>\n👨‍🎓 Найдено: <b>' + names.length + '</b>\n\n' + preview +
    '\n\nПосле подтверждения текущий список группы будет заменён этим списком.';
}
