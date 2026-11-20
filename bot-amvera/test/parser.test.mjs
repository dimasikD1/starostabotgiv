import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleHtml } from '../schedule/parser.mjs';

const html = `
<table>
  <tr><th>Дата</th><th>Время</th><th>Дисциплина</th><th>Преподаватель</th><th>Аудитория</th><th>Группа</th></tr>
  <tr><td>20.11.2026</td><td>09:00–10:30</td><td>Математика</td><td>Смирнова А. П.</td><td>204</td><td>БИ(ЭБ)2-ОЗ/Бп/КД26</td></tr>
  <tr><td>20.11.2026</td><td>10:40–12:10</td><td>Информатика</td><td>Кузнецов И. В.</td><td>315</td><td>БИ(ЭБ)1-ОЗ/Бп/КД26</td></tr>
</table>`;

test('parseScheduleHtml извлекает строки расписания', () => {
  const rows = parseScheduleHtml(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    date: '20.11.2026',
    time: '09:00–10:30',
    subject: 'Математика',
    teacher: 'Смирнова А. П.',
    room: '204',
    group: 'БИ(ЭБ)2-ОЗ/Бп/КД26'
  });
});

test('parseScheduleHtml фильтрует по учебной группе', () => {
  const rows = parseScheduleHtml(html, 'БИ(ЭБ)1-ОЗ/Бп/КД26');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, 'Информатика');
});

test('parseScheduleHtml пропускает строки без предмета', () => {
  const rows = parseScheduleHtml(`
    <table>
      <tr><th>Дата</th><th>Дисциплина</th></tr>
      <tr><td>20.11.2026</td><td>   </td></tr>
    </table>`);
  assert.deepEqual(rows, []);
});
