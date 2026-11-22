import * as cheerio from 'cheerio';

export interface ParsedScheduleRow {
  date: string;
  time: string;
  subject: string;
  teacher: string;
  room: string;
  group: string;
}

const clean = (value: unknown): string => String(value || '').replace(/\\s+/g, ' ').trim();

/** Parse the legacy table-based schedule format, preserving its original output shape. */
export function parseScheduleHtml(html: string, requestedGroup = ''): ParsedScheduleRow[] {
  const $ = cheerio.load(html);
  const result: ParsedScheduleRow[] = [];

  $('table').each((_n, table) => {
    const rows = $(table).find('tr');
    if (!rows.length) return;

    const headers: string[] = [];
    rows.first().find('th,td').each((_i, cell) => {
      { headers.push(clean($(cell).text()).toLowerCase()); }
    });

    const index = (names: string[]): number => headers.findIndex(header =>
      names.some(name => header.includes(name))
    );
    const dateI = index(['дата', 'день']);
    const timeI = index(['время', 'пара']);
    const subjectI = index(['дисциплина', 'предмет', 'занятие']);
    const teacherI = index(['преподаватель', 'препод']);
    const roomI = index(['аудитория', 'кабинет']);
    const groupI = index(['группа']);

    rows.slice(1).each((_i, row) => {
      const cells: string[] = [];
      $(row).find('td,th').each((_j, cell) => { cells.push(clean($(cell).text())); });
      if (!cells.length) return;

      const get = (i: number): string => i >= 0 ? cells[i] || '' : '';
      const group = get(groupI);
      if (requestedGroup && group &&
          !group.toLowerCase().includes(requestedGroup.toLowerCase())) return;

      const subject = get(subjectI);
      if (!subject) return;

      result.push({
        date: get(dateI),
        time: get(timeI),
        subject,
        teacher: get(teacherI),
        room: get(roomI),
        group
      });
    });
  });

  return result;
}
