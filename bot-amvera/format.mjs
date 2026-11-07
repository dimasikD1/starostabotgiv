import { students, getUser, todayDow, activePoll, formatDateRu } from './db.mjs';

const ICONS = { present: '✅', absent: '❌', excused: '📝', late: '⏰' };
const STATUS_TITLES = {
  present: 'Присутствует',
  absent: 'Отсутствует',
  excused: 'Уважительная',
  late: 'Опоздал',
};

const DAYS = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};

const TYPE_TITLES = {
  lecture: 'лекция',
  practice: 'практика',
  lab: 'лабораторная',
};

export function esc(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function shortName(user) {
  if (!user) return 'Неизвестный';
  const [first, ...rest] = String(user.name).split(' ');
  const last = rest.join(' ');
  return last ? `${first} ${last[0]}.` : first;
}

export function icon(status) {
  return ICONS[status] || '✅';
}

export function statusTitle(status) {
  return STATUS_TITLES[status] || String(status);
}

export function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Журнал', callback_data: 'cmd:journal' },
        { text: '🗓 Расписание', callback_data: 'cmd:schedule' },
      ],
      [
        { text: '📚 Домашка', callback_data: 'cmd:homework' },
        { text: '📊 Опрос', callback_data: 'cmd:poll' },
      ],
      [
        { text: '📢 Объявления', callback_data: 'cmd:news' },
        { text: '⭐ Староста', callback_data: 'cmd:starosta' },
      ],
    ],
  };
}

export function startText(db, resolved) {
  const group = db.groupMeta;
  const bound = resolved.bound
    ? `<b>${esc(resolved.name)}</b>${getUser(resolved.userId)?.roleTitle ? ` — ${esc(getUser(resolved.userId).roleTitle)}` : ''}`
    : 'гость (не привязан к списку группы)';
  const hint = resolved.bound
    ? 'Вы привязаны к группе — можно голосовать и отмечать домашку.'
    : 'Привяжитесь к списку группы: <code>/bind user-1</code> или <code>/students</code>.';
  return (
    `👋 <b>Бот «Староста 24»</b>\n\n` +
    `Группа: <b>${esc(group.code)}</b>\n` +
    `Курс: ${group.course}, ${esc(group.faculty)}\n` +
    `Вы: ${bound}\n\n` +
    `${hint}\n\n` +
    `<b>Команды:</b>\n` +
    `/journal — журнал посещаемости\n` +
    `/schedule — расписание на сегодня\n` +
    `/schedule 2 — другой день недели\n` +
    `/homework — домашние задания\n` +
    `/poll — активный опрос\n` +
    `/news — объявления\n` +
    `/starosta — контакты старост\n` +
    `/post текст — отправить объявление\n` +
    `/students — список группы\n` +
    `/bind user-N — привязаться к себе\n` +
    `/whoami — кто я для бота\n` +
    `/help — помощь`
  );
}

export function helpText() {
  return (
    `ℹ️ <b>Как пользоваться ботом</b>\n\n` +
    `• <b>/journal</b> — посещаемость. Нажимайте на имя, чтобы переключить статус: ✅ присутствует → ❌ отсутствует → 📝 уважительная → ⏰ опоздал.\n` +
    `• <b>/schedule [1-7]</b> — расписание. Фильтр по подгруппе — кнопками под сообщением.\n` +
    `• <b>/homework</b> — нажмите на задание, чтобы отметить себя как сдавшего.\n` +
    `• <b>/poll</b> — голосование, результаты обновляются сразу.\n` +
    `• <b>/post текст</b> — объявление в канал группы (доступно старосте, профоргу и куратору).\n` +
    `• <b>/bind user-N</b> — привязка Telegram к студенту из списка.\n\n` +
    `Данные хранятся в <code>data/db.json</code> и переживают перезапуск.`
  );
}

export function scheduleText(db, dow, subgroup = 0) {
  const day = DAYS[dow] || DAYS[todayDow()];
  const lessons = db.schedule
    .filter((s) => s.dayOfWeek === dow)
    .filter((s) => subgroup === 0 || s.subgroup === null || s.subgroup === subgroup)
    .sort((a, b) => a.pairNumber - b.pairNumber);

  const subLabel = subgroup ? ` · ${subgroup} подгруппа` : '';
  if (!lessons.length) {
    return `🗓 <b>${day}</b>${esc(subLabel)}\n\nЗанятий нет. Отдыхайте! 🎉`;
  }

  const rows = lessons.map((s) => {
    const sub = s.subgroup ? ` · <i>${s.subgroup} п/гр</i>` : '';
    return (
      `🕐 <b>${s.timeStart}–${s.timeEnd}</b> (${s.pairNumber} пара)\n` +
      `📖 <b>${esc(s.subject)}</b> — ${TYPE_TITLES[s.type] || esc(s.type)}${sub}\n` +
      `👨‍🏫 ${esc(s.teacher)} · ауд. ${esc(s.auditorium)}`
    );
  });

  return `🗓 <b>${day}</b>${esc(subLabel)}\n\n${rows.join('\n\n')}\n\n<i>Всего пар: ${lessons.length}</i>`;
}

export function scheduleKeyboard(dow, subgroup) {
  return {
    inline_keyboard: [
      [
        { text: subgroup === 0 ? '• Все' : 'Все', callback_data: `sg:${dow}:0` },
        { text: subgroup === 1 ? '• 1 п/гр' : '1 п/гр', callback_data: `sg:${dow}:1` },
        { text: subgroup === 2 ? '• 2 п/гр' : '2 п/гр', callback_data: `sg:${dow}:2` },
      ],
      [
        { text: '◀️', callback_data: `sg:${dow === 1 ? 7 : dow - 1}:${subgroup}` },
        { text: '🏠 Меню', callback_data: 'cmd:menu' },
        { text: '▶️', callback_data: `sg:${dow === 7 ? 1 : dow + 1}:${subgroup}` },
      ],
    ],
  };
}

export function journalText(db, record) {
  const all = students();
  const counts = { present: 0, absent: 0, excused: 0, late: 0 };
  const lines = all.map((u) => {
    const status = record.records[u.id] || 'present';
    counts[status] += 1;
    const sub = u.subgroup ? ` <i>(${u.subgroup} п/гр)</i>` : '';
    return `${icon(status)} ${esc(u.name)}${sub} — ${STATUS_TITLES[status]}`;
  });
  const date = formatDateRu(record.date);
  return (
    `📊 <b>Журнал посещаемости</b>\n` +
    `${esc(record.subject)} · ${record.pairNumber} пара\n` +
    `📅 ${esc(date)}\n\n` +
    `${lines.join('\n')}\n\n` +
    `✅ ${counts.present} · ❌ ${counts.absent} · 📝 ${counts.excused} · ⏰ ${counts.late}\n\n` +
    `<i>Нажмите на имя, чтобы изменить статус.</i>`
  );
}

export function journalKeyboard(db, record) {
  const rows = [];
  const all = students();
  for (let i = 0; i < all.length; i += 2) {
    const row = all.slice(i, i + 2).map((u) => ({
      text: `${icon(record.records[u.id] || 'present')} ${shortName(u)}`,
      callback_data: `st:${record.date}:${record.pairNumber}:${u.id}`,
    }));
    rows.push(row);
  }
  rows.push([
    { text: '✅ Все присутствуют', callback_data: `all:${record.date}:${record.pairNumber}` },
    { text: '🔄 Обновить', callback_data: `cmd:journal:${record.date}:${record.pairNumber}` },
  ]);
  rows.push([{ text: '🏠 Меню', callback_data: 'cmd:menu' }]);
  return { inline_keyboard: rows };
}

export function homeworkText(db, userId) {
  const items = db.homework.slice().sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (!items.length) return '📚 Домашних заданий пока нет.';
  const lines = items.map((h) => {
    const done = userId ? h.completedByUserIds.includes(userId) : false;
    const deadline = formatDateRu(h.deadline);
    const left = daysLeft(h.deadline);
    const priority =
      h.priority === 'exam' ? '🔥 экзаменационное' : h.priority === 'important' ? '⚠️ важное' : 'обычное';
    return (
      `${done ? '✅' : '⬜️'} <b>${esc(h.subject)}</b> — ${priority}\n` +
      `${esc(h.title)}\n` +
      `📅 до ${esc(deadline)} (${left})\n` +
      `Сдали: ${h.completedByUserIds.length}/${db.users.length}`
    );
  });
  return (
    `📚 <b>Домашние задания</b>\n\n${lines.join('\n\n')}\n\n` +
    `<i>${userId ? 'Нажмите на задание, чтобы отметить себя.' : 'Привяжитесь через /bind, чтобы отмечаться.'}</i>`
  );
}

export function homeworkKeyboard(db, userId) {
  const rows = db.homework.slice().map((h) => {
    const done = userId ? h.completedByUserIds.includes(userId) : false;
    return [{ text: `${done ? '✅' : '⬜️'} ${h.subject}`, callback_data: `hw:${h.id}` }];
  });
  rows.push([{ text: '🏠 Меню', callback_data: 'cmd:menu' }]);
  return { inline_keyboard: rows };
}

export function pollText(db, poll) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votedUserIds.length, 0);
  const lines = poll.options.map((o) => {
    const percent = totalVotes ? Math.round((o.votedUserIds.length / totalVotes) * 100) : 0;
    const bar = '█'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));
    return `<b>${esc(o.text)}</b>\n${bar} ${percent}% (${o.votedUserIds.length})`;
  });
  return (
    `📊 <b>Опрос группы</b>\n\n${esc(poll.question)}\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `Проголосовало уникальных: ${uniqueVoters(poll)} · ${poll.isClosed ? 'опрос закрыт' : 'опрос открыт'}`
  );
}

export function pollKeyboard(poll) {
  const rows = poll.options.map((o) => [
    { text: `${esc(o.text)} (${o.votedUserIds.length})`, callback_data: `vote:${poll.id}:${o.id}` },
  ]);
  rows.push([
    { text: '🔄 Обновить', callback_data: 'cmd:poll' },
    { text: '🏠 Меню', callback_data: 'cmd:menu' },
  ]);
  return { inline_keyboard: rows };
}

export function newsText(db) {
  const items = db.announcements.slice(0, 6);
  if (!items.length) return '📢 Объявлений пока нет.';
  const lines = items.map((a) => {
    const author = getUser(a.authorId);
    return (
      `<b>${esc(a.title)}</b>${a.pinned ? ' 📌' : ''}\n` +
      `${esc(a.content)}\n` +
      `<i>${esc(author?.name || 'Неизвестный')} · ${esc(a.timestamp)}</i>`
    );
  });
  return `📢 <b>Объявления группы</b>\n\n${lines.join('\n\n')}`;
}

export function newsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Обновить', callback_data: 'cmd:news' }],
      [{ text: '🏠 Меню', callback_data: 'cmd:menu' }],
    ],
  };
}

export function starostaText(db) {
  const leaders = db.users.filter((u) => u.role === 'starosta' || u.role === 'proforg');
  const lines = leaders.map(
    (u) =>
      `👤 <b>${esc(u.name)}</b> — ${esc(u.roleTitle)}\n` +
      `📱 ${esc(u.phone)}\n` +
      `✈️ ${esc(u.telegram)}` +
      (u.subgroup ? `\n🎓 ${u.subgroup} подгруппа` : ''),
  );
  const curator = db.users.find((u) => u.role === 'curator');
  const curatorLine = curator
    ? `\n\n👨‍🏫 <b>Куратор:</b> ${esc(curator.name)}\n📱 ${esc(curator.phone)}\n✈️ ${esc(curator.telegram)}`
    : '';
  return `⭐ <b>Старостат группы ${esc(db.groupMeta.code)}</b>\n\n${lines.join('\n\n')}${curatorLine}`;
}

export function studentsText(db, resolved) {
  const lines = db.users.map((u) => {
    const mark = resolved?.userId === u.id ? ' 👈' : '';
    const sub = u.subgroup ? ` (${u.subgroup} п/гр)` : '';
    return `<code>${u.id}</code> — ${esc(u.name)}${sub}${mark}`;
  });
  return (
    `👥 <b>Список группы ${esc(db.groupMeta.code)}</b>\n\n${lines.join('\n')}\n\n` +
    `Привязка: <code>/bind user-1</code>`
  );
}

export function whoamiText(db, resolved) {
  const user = resolved.bound ? getUser(resolved.userId) : null;
  if (!user) {
    return (
      `Вы не привязаны к списку группы.\n` +
      `Ваш Telegram ID: <code>${resolved.userId}</code>\n\n` +
      `Выберите себя в /students и выполните <code>/bind user-N</code>.`
    );
  }
  return (
    `👤 <b>${esc(user.name)}</b>\n` +
    `Роль: ${esc(user.roleTitle)}\n` +
    `Группа: ${esc(db.groupMeta.code)}${user.subgroup ? `, ${user.subgroup} п/гр` : ''}\n` +
    `Телефон: ${esc(user.phone)}\n` +
    `Telegram: ${esc(user.telegram)}`
  );
}

export function pollOrEmpty(db) {
  const poll = activePoll();
  if (!poll) return { text: '📊 Активных опросов нет.', keyboard: mainKeyboard() };
  return { text: pollText(db, poll), keyboard: pollKeyboard(poll) };
}

function uniqueVoters(poll) {
  const set = new Set();
  poll.options.forEach((o) => o.votedUserIds.forEach((id) => set.add(id)));
  return set.size;
}

function daysLeft(dateStr) {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const deadline = new Date(`${dateStr}T00:00:00Z`).getTime();
  const diff = Math.round((deadline - today) / 86400000);
  if (diff < 0) return `просрочено на ${Math.abs(diff)} дн.`;
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  return `осталось ${diff} дн.`;
}
