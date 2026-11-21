import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getSchedule, normalizeJson, parseCards, parseDate } from '../../.test-build/ruc.js';

function moscowDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(values.year + '-' + values.month + '-' + values.day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('parseDate принимает российский и ISO форматы', () => {
  assert.equal(parseDate('21.11.2026'), '2026-11-21');
  assert.equal(parseDate('Дата: 2026-11-21'), '2026-11-21');
  assert.equal(parseDate('дата не указана'), '');
});

test('normalizeJson приводит API-ответ к строгому формату и фильтрует период', () => {
  const today = moscowDate(0);
  const outsideRange = moscowDate(20);
  const lessons = normalizeJson({
    items: [
      {
        date: today,
        start_time: '09:00',
        end_time: '10:30',
        discipline: 'Математика',
        number: 2,
        type: 'Практическое занятие',
        teacherName: 'Смирнова А. П.',
        auditory: 204,
        groupName: 'БИ(ЭБ)2-ОЗ/Бп/КД26'
      },
      { date: outsideRange, subject: 'За пределами периода' },
      { date: today, subject: '' },
      null
    ]
  }, 7, today);

  assert.equal(lessons.length, 1);
  assert.deepEqual(lessons[0], {
    date: today,
    dayOffset: 0,
    time: '09:00–10:30',
    timeStart: '09:00',
    timeEnd: '10:30',
    subject: 'Математика',
    lessonNumber: '2',
    lessonType: 'практическая',
    teacher: 'Смирнова А. П.',
    room: '204',
    group: 'БИ(ЭБ)2-ОЗ/Бп/КД26'
  });
});

test('normalizeJson безопасно отклоняет неподдерживаемую структуру', () => {
  assert.deepEqual(normalizeJson({ items: 'not-an-array' }, 7), []);
  assert.deepEqual(normalizeJson(null, 7), []);
});

test('parseCards извлекает пару и фильтрует по группе', () => {
  const today = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date());
  const html = `
    <div class="card">
      <div>${today}</div>
      <div>
        <div>1. Математика 09:00-10:30</div>
        <div>Смирнова А. П. Группа: БИ(ЭБ)2-ОЗ/Бп/КД26, аудитория 204, практическая</div>
      </div>
    </div>`;

  const lessons = parseCards(html, 'БИ(ЭБ)2-ОЗ/Бп/КД26');
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].subject, 'Математика');
  assert.equal(lessons[0].lessonNumber, '1');
  assert.equal(lessons[0].timeStart, '09:00');
  assert.equal(lessons[0].timeEnd, '10:30');
  assert.equal(lessons[0].room, '204');
  assert.equal(lessons[0].lessonType, 'практическая');
  assert.equal(parseCards(html, 'другая группа').length, 0);
});

test('getSchedule TypeScript provider requests and normalizes the configured API', async () => {
  const today = moscowDate(0);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{
      date: today,
      start_time: '11:00',
      end_time: '12:30',
      subject: 'Тестовая пара',
      teacher: 'Иванов И. И.',
      room: '101',
      group: 'Тестовая группа'
    }]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const previous = process.env.SCHEDULE_API_URL;
  process.env.SCHEDULE_API_URL = 'http://127.0.0.1:' + port + '/schedule';

  try {
    const lessons = await getSchedule('Тестовая группа', 7, today);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].subject, 'Тестовая пара');
    assert.equal(lessons[0].time, '11:00–12:30');
    assert.equal(lessons[0].teacher, 'Иванов И. И.');
  } finally {
    if (previous === undefined) delete process.env.SCHEDULE_API_URL;
    else process.env.SCHEDULE_API_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});

test('getSchedule TypeScript provider reports API errors', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(503);
    res.end('unavailable');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const previous = process.env.SCHEDULE_API_URL;
  process.env.SCHEDULE_API_URL = 'http://127.0.0.1:' + port + '/schedule';

  try {
    await assert.rejects(
      () => getSchedule('Тестовая группа', 7, moscowDate(0)),
      /Schedule API HTTP 503/
    );
  } finally {
    if (previous === undefined) delete process.env.SCHEDULE_API_URL;
    else process.env.SCHEDULE_API_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
