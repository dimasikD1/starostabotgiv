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
