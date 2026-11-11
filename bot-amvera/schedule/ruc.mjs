import { parseScheduleHtml } from './parser.mjs';

const DEFAULT_URL = 'https://new-schedule.ruc.su/schedule';

function withGroup(raw, group) {
  const url = new URL(raw);
  if (group) url.searchParams.set('group', group);
  return url.toString();
}

function normalizeJson(data, days) {
  const raw = Array.isArray(data) ? data : (data.items || data.schedule || data.data || []);
  if (!Array.isArray(raw)) return [];

  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return raw.map(item => {
    const date = String(item.date || item.day || item.start || '').slice(0, 10);
    const d = new Date(date + 'T00:00:00');
    const dayOffset = Math.round((d - base) / 86400000);
    return {
      date,
      dayOffset,
      time: item.time || item.startTime || '',
      subject: item.subject || item.name || item.discipline || item.title || '',
      teacher: item.teacher || item.teacherName || item.lecturer || '',
      room: item.room || item.auditory || item.classroom || '',
      group: item.group || item.groupName || ''
    };
  }).filter(x => x.date && x.subject && x.dayOffset >= 0 && x.dayOffset < days);
}

export async function getSchedule(group, days = 7) {
  const api = (process.env.SCHEDULE_API_URL || '').trim();
  const site = (process.env.SCHEDULE_SITE_URL || DEFAULT_URL).trim();
  const timeout = Number(process.env.SCHEDULE_TIMEOUT || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = withGroup(api || site, group);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: api ? 'application/json' : 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; StarostaBot/1.0)'
      }
    });
    if (!response.ok) throw new Error('Schedule HTTP ' + response.status);

    if (api) return normalizeJson(await response.json(), days);

    const html = await response.text();
    const items = parseScheduleHtml(html, group);
    if (!items.length) throw new Error('Schedule HTML does not contain a readable table');

    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return items.map(x => {
      const parts = String(x.date || '').split('.');
      let date = x.date;
      if (parts.length === 3) date = parts.reverse().join('-');
      const d = new Date(date + 'T00:00:00');
      return { ...x, date, dayOffset: Math.round((d - base) / 86400000) };
    }).filter(x => x.dayOffset >= 0 && x.dayOffset < days);
  } finally {
    clearTimeout(timer);
  }
}
