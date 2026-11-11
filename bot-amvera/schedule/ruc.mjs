import * as cheerio from 'cheerio';

const DEFAULT_URL = 'https://schedule.ruc.su/';
const DEFAULT_NEW_URL = 'https://new-schedule.ruc.su/schedule';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function isoToday(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function parseDate(value) {
  const s = clean(value);
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : '';
}

function parseCards(html, requestedGroup) {
  const $ = cheerio.load(html);
  const result = [];

  $('.card').each((_i, card) => {
    const children = $(card).children();
    if (!children.length) return;

    const date = parseDate($(children[0]).text());
    if (!date) return;

    children.slice(1).each((_j, pair) => {
      const title = clean($(pair).children().first().text());
      const raw = $(pair).html() || '';
      const text = clean(raw.replace(/<[^>]+>/g, ' '));
      if (!title) return;

      const timeMatch = title.match(/(\d{1,2})\s*[.]?\s*(\d{1,2})/);
      let subject = title.replace(/^\d+\s*[.]?\s*/, '').trim();
      let teacher = '';
      let room = '';

      const groupMatch = text.match(/Группа\s*[:\-]?\s*([^,;]+)/i);
      const roomMatch = text.match(/(?:аудитория|кабинет|ауд\.?)\s*[:\-]?\s*(\S+)/i);

      if (groupMatch && requestedGroup &&
          !groupMatch[1].toLowerCase().includes(requestedGroup.toLowerCase())) {
        return;
      }

      const beforeGroup = clean(text.split(/Группа/i)[0] || '');
      const commaParts = beforeGroup.split(',').map(clean).filter(Boolean);

      if (commaParts.length >= 2) {
        teacher = commaParts[0];
        room = commaParts[1];
      } else if (commaParts.length === 1) {
        teacher = commaParts[0];
      }

      if (roomMatch) room = roomMatch[1];

      result.push({
        date,
        dayOffset: Math.round(
          (new Date(date + 'T00:00:00') -
            new Date(isoToday(0) + 'T00:00:00')) / 86400000
        ),
        time: timeMatch ? timeMatch[0] : '',
        subject,
        teacher,
        room,
        group: groupMatch ? clean(groupMatch[1]) : requestedGroup
      });
    });
  });

  return result;
}

async function requestHtml(url, method = 'GET', data = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json',
        'user-agent': 'Mozilla/5.0 (compatible; StarostaBot/1.0)',
        ...(method === 'POST'
          ? { 'content-type': 'application/x-www-form-urlencoded' }
          : {})
      },
      body: method === 'POST'
        ? new URLSearchParams(data).toString()
        : undefined
    });

    if (!response.ok) {
      throw new Error(`Schedule HTTP ${response.status} from ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getLegacySchedule(group, days, timeout) {
  const baseUrl =
    (process.env.SCHEDULE_SITE_URL || DEFAULT_URL).trim().replace(/\/$/, '') + '/';

  const wantedBranch = (process.env.SCHEDULE_BRANCH || '').trim();
  const wantedKit = (process.env.SCHEDULE_KIT || '').trim();

  const firstHtml = await requestHtml(baseUrl, 'GET', {}, timeout);
  const $ = cheerio.load(firstHtml);
  const branchSelect = $('select[name="branch"]').first();

  if (!branchSelect.length) {
    throw new Error('Не найден список филиалов на schedule.ruc.su');
  }

  const branches = branchSelect.find('option').map((_i, el) => ({
    value: $(el).attr('value') || '',
    text: clean($(el).text())
  })).get().filter(x => x.value);

  let candidates = branches;

  if (wantedBranch) {
    candidates = branches.filter(x =>
      x.text.toLowerCase().includes(wantedBranch.toLowerCase()) ||
      x.value.toLowerCase() === wantedBranch.toLowerCase()
    );

    if (!candidates.length) {
      throw new Error('Филиал не найден: ' + wantedBranch);
    }
  }

  for (const branch of candidates) {
    const branchHtml = await requestHtml(
      baseUrl,
      'POST',
      { branch: branch.value },
      timeout
    );

    const branch$ = cheerio.load(branchHtml);
    const kitSelect = branch$('select[name="year"]').first();
    if (!kitSelect.length) continue;

    const kits = kitSelect.find('option').map((_i, el) => ({
      value: $(el).attr('value') || '',
      text: clean($(el).text())
    })).get().filter(x => x.value);

    const kitCandidates = wantedKit
      ? kits.filter(x =>
          x.text.toLowerCase().includes(wantedKit.toLowerCase()) ||
          x.value.toLowerCase() === wantedKit.toLowerCase()
        )
      : kits;

    for (const kit of kitCandidates) {
      const groupsHtml = await requestHtml(
        baseUrl,
        'POST',
        { branch: branch.value, year: kit.value },
        timeout
      );

      const groups$ = cheerio.load(groupsHtml);
      const groupSelect = groups$('select[name="group"]').first();
      if (!groupSelect.length) continue;

      const groups = groupSelect.find('option').map((_i, el) => ({
        value: $(el).attr('value') || '',
        text: clean($(el).text())
      })).get().filter(x => x.value);

      const match =
        groups.find(x => x.text.toLowerCase() === group.toLowerCase()) ||
        groups.find(x => x.text.toLowerCase().includes(group.toLowerCase()));

      if (!match) continue;

      const today = isoToday(0);
      const html = await requestHtml(
        baseUrl,
        'POST',
        {
          branch: branch.value,
          year: kit.value,
          group: match.value,
          'search-date': 'search-date',
          'scheduler-date': today,
          'date-search': today
        },
        timeout
      );

      const items = parseCards(html, group);

      return items.filter(
        x => x.dayOffset >= 0 && x.dayOffset < days
      );
    }
  }

  throw new Error(
    `Группа «${group}» не найдена на schedule.ruc.su. Можно задать SCHEDULE_BRANCH и SCHEDULE_KIT.`
  );
}

async function getNewSite(group, days, timeout) {
  const url = (process.env.SCHEDULE_SITE_URL || DEFAULT_NEW_URL).trim();
  const response = await requestHtml(url, 'GET', {}, timeout);
  const $ = cheerio.load(response);
  const text = clean($.text());

  if (!text || /Расписания нет/i.test(text)) return [];

  const items = [];

  $('table').each((_n, table) => {
    $(table).find('tr').each((_i, row) => {
      const cells = $(row).find('th,td')
        .map((_j, cell) => clean($(cell).text()))
        .get();

      if (cells.length < 2) return;

      const line = cells.join(' | ');
      if (group && !line.toLowerCase().includes(group.toLowerCase())) return;

      const date = parseDate(line);
      if (!date) return;

      items.push({
        date,
        dayOffset: Math.round(
          (new Date(date + 'T00:00:00') -
            new Date(isoToday(0) + 'T00:00:00')) / 86400000
        ),
        time: '',
        subject: line,
        teacher: '',
        room: '',
        group
      });
    });
  });

  return items.filter(x => x.dayOffset >= 0 && x.dayOffset < days);
}

function normalizeJson(data, days) {
  const raw = Array.isArray(data)
    ? data
    : (data?.items || data?.schedule || data?.data || []);

  if (!Array.isArray(raw)) return [];

  const base = new Date();
  base.setHours(0, 0, 0, 0);

  return raw.map(item => {
    const date = String(
      item.date || item.day || item.start || ''
    ).slice(0, 10);

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
  }).filter(
    x => x.date && x.subject && x.dayOffset >= 0 && x.dayOffset < days
  );
}

export async function getSchedule(group, days = 7) {
  const timeout = Number(process.env.SCHEDULE_TIMEOUT || 20000);
  const api = (process.env.SCHEDULE_API_URL || '').trim();

  if (api) {
    // Поддерживаем как готовый URL, так и шаблон:
    // https://api-schedule.ruc.su/api/v1/get_schedule/group/{branchId}/{groupId}/no
    // UUID можно задать через SCHEDULE_BRANCH_ID и SCHEDULE_GROUP_ID.
    const branchId = (process.env.SCHEDULE_BRANCH_ID || '').trim();
    const groupId = (process.env.SCHEDULE_GROUP_ID || '').trim();

    let apiUrl = api
      .replaceAll('{branchId}', branchId)
      .replaceAll('{groupId}', groupId)
      .replaceAll('{group}', groupId || group);

    const url = new URL(apiUrl);

    // Если URL старого формата содержит {group}, но UUID не задан,
    // оставляем совместимость с прежним API через ?group=...
    if (!api.includes('{branchId}') && !api.includes('{groupId}') &&
        !api.includes('{group}') && !api.includes('/get_schedule/')) {
      url.searchParams.set('group', group);
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        accept: 'application/json, text/plain, */*',
        origin: 'https://new-schedule.ruc.su',
        referer: 'https://new-schedule.ruc.su/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Schedule API HTTP ' + response.status + ' from ' + url);
    }

    return normalizeJson(await response.json(), days);
  }

  try {
    return await getLegacySchedule(group, days, timeout);
  } catch (legacyError) {
    console.error('[schedule] legacy source failed:', legacyError.message);

    if ((process.env.SCHEDULE_FALLBACK_NEW || 'true').toLowerCase() === 'true') {
      return await getNewSite(group, days, timeout);
    }

    throw legacyError;
  }
}
