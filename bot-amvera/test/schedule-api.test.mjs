import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getSchedule } from '../schedule/ruc.mjs';

function moscowDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(values.year + '-' + values.month + '-' + values.day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('getSchedule нормализует JSON API и отбрасывает занятия вне периода', async t => {
  const today = moscowDate(0);
  const farAway = moscowDate(30);
  const payload = [
    {
      date: today,
      startTime: '09:00',
      endTime: '10:30',
      subject: 'Математика',
      teacher: 'Смирнова А. П.',
      room: '204',
      group: 'БИ(ЭБ)2-ОЗ/Бп/КД26'
    },
    {
      date: farAway,
      startTime: '09:00',
      endTime: '10:30',
      subject: 'Лишняя пара',
      group: 'БИ(ЭБ)2-ОЗ/Бп/КД26'
    }
  ];

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const previous = process.env.SCHEDULE_API_URL;
  process.env.SCHEDULE_API_URL = 'http://127.0.0.1:' + port + '/schedule';
  try {
    const items = await getSchedule('БИ(ЭБ)2-ОЗ/Бп/КД26', 7);
    assert.equal(items.length, 1);
    assert.equal(items[0].date, today);
    assert.equal(items[0].subject, 'Математика');
    assert.equal(items[0].timeStart, '09:00');
    assert.equal(items[0].timeEnd, '10:30');
    assert.equal(items[0].room, '204');
    assert.equal(items[0].dayOffset, 0);
  } finally {
    if (previous === undefined) delete process.env.SCHEDULE_API_URL;
    else process.env.SCHEDULE_API_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});

test('getSchedule сообщает об ошибке источника', async t => {
  const server = http.createServer((_req, res) => {
    res.writeHead(503);
    res.end('unavailable');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const previous = process.env.SCHEDULE_API_URL;
  process.env.SCHEDULE_API_URL = 'http://127.0.0.1:' + port + '/schedule';
  try {
    await assert.rejects(() => getSchedule('Группа', 7), /Schedule API HTTP 503/);
  } finally {
    if (previous === undefined) delete process.env.SCHEDULE_API_URL;
    else process.env.SCHEDULE_API_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
