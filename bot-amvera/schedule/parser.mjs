import * as cheerio from 'cheerio';

const clean = v => String(v || '').replace(/\s+/g, ' ').trim();

export function parseScheduleHtml(html, requestedGroup = '') {
  const $ = cheerio.load(html);
  const result = [];

  $('table').each((_n, table) => {
    const rows = $(table).find('tr');
    if (!rows.length) return;

    const headers = [];
    rows.first().find('th,td').each((_i, cell) => {
      headers.push(clean($(cell).text()).toLowerCase());
    });

    const index = names => headers.findIndex(h => names.some(n => h.includes(n)));
    const dateI = index(['дата', 'день']);
    const timeI = index(['время', 'пара']);
    const subjectI = index(['дисциплина', 'предмет', 'занятие']);
    const teacherI = index(['преподаватель', 'препод']);
    const roomI = index(['аудитория', 'кабинет']);
    const groupI = index(['группа']);

    rows.slice(1).each((_i, row) => {
      const cells = [];
      $(row).find('td,th').each((_j, cell) => cells.push(clean($(cell).text())));
      if (!cells.length) return;

      const get = i => i >= 0 ? cells[i] || '' : '';
      const group = get(groupI);
      if (requestedGroup && group && !group.toLowerCase().includes(requestedGroup.toLowerCase())) return;

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
