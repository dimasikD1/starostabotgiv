import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getDb,
  saveDb,
  todayIso,
  dowOf,
  students,
  getUser,
  resolveUser,
  bindUser,
  attendanceFor,
  cycleStatus,
  setAllStatus,
  votePoll,
  toggleHomework,
  addAnnouncement,
  activePoll,
} from './db.mjs';

import {
  esc,
  shortName,
  statusTitle,
  mainKeyboard,
  startText,
  helpText,
  scheduleText,
  scheduleKeyboard,
  journalText,
  journalKeyboard,
  homeworkText,
  homeworkKeyboard,
  pollText,
  pollKeyboard,
  newsText,
  newsKeyboard,
  starostaText,
  studentsText,
  whoamiText,
} from './format.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadDotEnv();

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!TOKEN || !TOKEN.includes(':')) {
  console.error(
    '\n[!] Не задан токен Telegram-бота.\n' +
      '    1. Откройте @BotFather в Telegram и создайте бота (/newbot).\n' +
      '    2. Скопируйте токен вида 123456789:AA...\n' +
      '    3. Создайте файл .env рядом с index.mjs:\n' +
      '       TELEGRAM_BOT_TOKEN="123456789:AA..."\n' +
      '    4. Запустите снова: npm start\n'
  );
  process.exit(1);
}

const API = 'https://api.telegram.org';
const BOT_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'journal', description: 'Журнал посещаемости' },
  { command: 'schedule', description: 'Расписание на сегодня' },
  { command: 'homework', description: 'Домашние задания' },
  { command: 'poll', description: 'Опрос группы' },
  { command: 'news', description: 'Объявления' },
  { command: 'starosta', description: 'Контакты старост' },
  { command: 'students', description: 'Список группы и привязка' },
  { command: 'bind', description: 'Привязаться: /bind user-1' },
  { command: 'whoami', description: 'Моя привязка' },
  { command: 'post', description: 'Опубликовать объявление' },
  { command: 'help', description: 'Помощь' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncate(text, limit = 4000) {
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text;
}

async function tg(method, payload = {}) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, description: `HTTP ${res.status}` };
  }
  if (!json.ok) {
    const error = new Error(`Telegram ${method}: ${json.description || res.status}`);
    error.code = json.error_code || res.status;
    error.description = json.description || '';
    error.parameters = json.parameters;
    throw error;
  }
  return json.result;
}

async function send(chatId, text, keyboard) {
  if (!chatId) return null;
  try {
    return await tg('sendMessage', {
      chat_id: chatId,
      text: truncate(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  } catch (error) {
    if (error.code === 429) {
      await sleep(((error.parameters && error.parameters.retry_after) || 2) * 1000);
      return send(chatId, text, keyboard);
    }
    if (error.code === 400 && /parse entities/i.test(error.description)) {
      return tg('sendMessage', {
        chat_id: chatId,
        text: truncate(text),
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
    }
    console.error('[send]', error.message);
    return null;
  }
}

async function answer(callbackId, text = '', alert = false) {
  try {
    await tg('answerCallbackQuery', {
      callback_query_id: callbackId,
      text,
      show_alert: alert,
    });
  } catch (error) {
    console.error('[answer]', error.message);
  }
}

async function edit(chatId, messageId, text, keyboard) {
  if (!chatId || !messageId) return;
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: truncate(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  } catch (error) {
    if (/message is not modified/i.test(error.description || '')) return;
    if (error.code === 400 && /parse entities/i.test(error.description || '')) {
      try {
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: truncate(text),
          reply_markup: keyboard,
        });
        return;
      } catch {
        /* fallthrough */
      }
    }
    await send(chatId, text, keyboard);
  }
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function defaultPair(date) {
  const db = getDb();
  const lessons = db.schedule
    .filter((s) => s.dayOfWeek === dowOf(date))
    .sort((a, b) => a.pairNumber - b.pairNumber);
  if (!lessons.length) return 1;
  if (date !== todayIso()) return lessons[0].pairNumber;

  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const upcoming = lessons.find((s) => timeToMinutes(s.timeEnd) >= current);
  return (upcoming || lessons[lessons.length - 1]).pairNumber;
}

function defaultSubgroup(resolved) {
  const user = resolved.bound ? getUser(resolved.userId) : null;
  return user && (user.subgroup === 1 || user.subgroup === 2) ? user.subgroup : 0;
}

function boundUser(resolved) {
  if (!resolved.bound) return null;
  return getUser(resolved.userId) || null;
}

function isAdmin(user) {
  return !!user && ['starosta', 'proforg', 'curator'].includes(user.role);
}

function menuText() {
  return (
    '🏠 <b>Главное меню</b>\n\n' +
    'Выберите раздел кнопками ниже или отправьте команду.\n\n' +
    '📊 /journal · 🗓 /schedule · 📚 /homework\n' +
    '🗳 /poll · 📢 /news · ⭐ /starosta'
  );
}

function statsText() {
  const db = getDb();
  const studentCount = students().length;
  const boundCount = Object.keys(db.botUsers).length;
  const openPolls = db.polls.filter((p) => !p.isClosed).length;
  return (
    '📈 <b>Статистика группы</b>\n\n' +
    `Группа: <b>${esc(db.groupMeta.code)}</b>\n` +
    `Студентов: <b>${studentCount}</b>\n` +
    `Привязано к боту: <b>${boundCount}</b>\n` +
    `Домашних заданий: <b>${db.homework.length}</b>\n` +
    `Активных опросов: <b>${openPolls}</b>\n` +
    `Объявлений: <b>${db.announcements.length}</b>\n` +
    `Версия базы: <b>${db.meta.version}</b>`
  );
}

function broadcastText(content, authorName) {
  return (
    '📢 <b>Новое объявление</b>\n\n' +
    `${esc(content)}\n\n` +
    `<i>${esc(authorName)}</i>`
  );
}

async function broadcast(userIds, text) {
  let delivered = 0;
  for (const chatId of userIds) {
    const result = await send(chatId, text, mainKeyboard());
    if (result) delivered += 1;
  }
  return delivered;
}

async function handleMessage(message) {
  const from = message.from;
  const chatId = message.chat.id;
  const raw = (message.text || '').trim();
  const db = getDb();
  const resolved = resolveUser(from);

  if (!raw.startsWith('/')) {
    if (message.chat.type === 'private') {
      await send(chatId, 'Я понимаю команды. Отправьте /start или /help.', mainKeyboard());
    }
    return;
  }

  const parts = raw.split(/\s+/);
  const command = parts[0].split('@')[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/start':
      await send(chatId, startText(db, resolved), mainKeyboard());
      return;
    case '/help':
      await send(chatId, helpText(), mainKeyboard());
      return;
    case '/menu':
      await send(chatId, menuText(), mainKeyboard());
      return;
    case '/stats':
      await send(chatId, statsText(), mainKeyboard());
      return;

    case '/journal': {
      let date = todayIso();
      let pair = null;
      for (const arg of args) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) date = arg;
        else if (/^\d+$/.test(arg)) pair = Number(arg);
      }
      if (!pair) pair = defaultPair(date);
      const record = attendanceFor(date, pair);
      await send(chatId, journalText(db, record), journalKeyboard(db, record));
      return;
    }

    case '/schedule': {
      let dow = null;
      let subgroup = null;
      for (const arg of args) {
        if (/^[1-7]$/.test(arg)) {
          if (dow === null) dow = Number(arg);
          else subgroup = Number(arg);
        }
      }
      if (dow === null) dow = dowOf(todayIso());
      if (subgroup === null) subgroup = defaultSubgroup(resolved);
      if (![0, 1, 2].includes(subgroup)) subgroup = 0;
      await send(chatId, scheduleText(db, dow, subgroup), scheduleKeyboard(dow, subgroup));
      return;
    }

    case '/homework': {
      const user = boundUser(resolved);
      const uid = user ? user.id : null;
      await send(chatId, homeworkText(db, uid), homeworkKeyboard(db, uid));
      return;
    }

    case '/poll': {
      let poll = null;
      if (args[0] && /^\d+$/.test(args[0])) {
        poll = db.polls[Number(args[0]) - 1] || null;
      }
      if (!poll) poll = activePoll() || db.polls[0] || null;
      if (!poll) {
        await send(chatId, '📊 Опросов пока нет.', mainKeyboard());
        return;
      }
      await send(chatId, pollText(db, poll), pollKeyboard(poll));
      return;
    }

    case '/news':
      await send(chatId, newsText(db), newsKeyboard());
      return;

    case '/starosta':
      await send(chatId, starostaText(db), mainKeyboard());
      return;

    case '/students':
      await send(chatId, studentsText(db, resolved), mainKeyboard());
      return;

    case '/whoami':
      await send(chatId, whoamiText(db, resolved), mainKeyboard());
      return;

    case '/bind': {
      const id = (args[0] || '').trim();
      if (!id) {
        await send(
          chatId,
          'Укажите, кого привязать:\n<code>/bind user-1</code>\n\nСписок ID — в /students.',
          mainKeyboard()
        );
        return;
      }
      const user = bindUser(from, id);
      if (!user) {
        await send(chatId, `❌ Пользователь <code>${esc(id)}</code> не найден. Список: /students`);
        return;
      }
      await send(
        chatId,
        `✅ Готово! Теперь вы — <b>${esc(user.name)}</b> (${esc(user.roleTitle)}).`,
        mainKeyboard()
      );
      return;
    }

    case '/post': {
      const user = boundUser(resolved);
      if (!user || !isAdmin(user)) {
        await send(
          chatId,
          '⛔️ Публиковать объявления могут староста, профорг и куратор.\nСначала привяжитесь: /bind user-1'
        );
        return;
      }
      const content = args.join(' ').trim();
      if (!content) {
        await send(chatId, 'Использование: <code>/post Текст объявления</code>');
        return;
      }
      addAnnouncement(user.id, content);
      const chatIds = Object.keys(db.botUsers);
      const delivered = await broadcast(chatIds, broadcastText(content, user.name));
      await send(
        chatId,
        `✅ Объявление опубликовано.\nРазослано привязанным участникам: <b>${delivered}</b>.`,
        mainKeyboard()
      );
      return;
    }

    default:
      await send(
        chatId,
        `❓ Неизвестная команда <code>${esc(command)}</code>.\nОтправьте /help.`,
        mainKeyboard()
      );
  }
}

async function renderJournal(date, pair) {
  const db = getDb();
  const record = attendanceFor(date, pair);
  return { text: journalText(db, record), keyboard: journalKeyboard(db, record), record };
}

async function handleCallback(query) {
  const data = query.data || '';
  const from = query.from;
  const message = query.message;
  const chatId = message && message.chat ? message.chat.id : null;
  const messageId = message ? message.message_id : null;
  const db = getDb();
  const resolved = resolveUser(from);
  const [action, ...rest] = data.split(':');

  let toast = '';
  let alert = false;

  const reply = async (text, keyboard) => {
    if (!chatId) return;
    if (messageId) await edit(chatId, messageId, text, keyboard);
    else await send(chatId, text, keyboard);
  };

  try {
    switch (action) {
      case 'cmd': {
        const sub = rest[0] || 'menu';
        if (sub === 'menu') await reply(menuText(), mainKeyboard());
        else if (sub === 'help') await reply(helpText(), mainKeyboard());
        else if (sub === 'journal') {
          const date = rest[1] || todayIso();
          const pair = Number(rest[2]) || defaultPair(date);
          const view = await renderJournal(date, pair);
          await reply(view.text, view.keyboard);
        } else if (sub === 'schedule') {
          const dow = Number(rest[1]) || dowOf(todayIso());
          const subgroup = rest[2] !== undefined ? Number(rest[2]) : defaultSubgroup(resolved);
          await reply(
            scheduleText(db, dow, [0, 1, 2].includes(subgroup) ? subgroup : 0),
            scheduleKeyboard(dow, [0, 1, 2].includes(subgroup) ? subgroup : 0)
          );
        } else if (sub === 'homework') {
          const user = boundUser(resolved);
          await reply(homeworkText(db, user ? user.id : null), homeworkKeyboard(db, user ? user.id : null));
        } else if (sub === 'poll') {
          const poll = activePoll() || db.polls[0] || null;
          if (poll) await reply(pollText(db, poll), pollKeyboard(poll));
          else await reply('📊 Опросов пока нет.', mainKeyboard());
        } else if (sub === 'news') {
          await reply(newsText(db), newsKeyboard());
        } else if (sub === 'starosta') {
          await reply(starostaText(db), mainKeyboard());
        } else if (sub === 'students') {
          await reply(studentsText(db, resolved), mainKeyboard());
        } else if (sub === 'whoami') {
          await reply(whoamiText(db, resolved), mainKeyboard());
        } else if (sub === 'stats') {
          await reply(statsText(), mainKeyboard());
        } else {
          await reply(menuText(), mainKeyboard());
        }
        break;
      }

      case 'sg': {
        const dow = Number(rest[0]);
        const subgroup = Number(rest[1]);
        if (![1, 2, 3, 4, 5, 6, 7].includes(dow) || ![0, 1, 2].includes(subgroup)) {
          toast = 'Некорректный день';
          alert = true;
          break;
        }
        await reply(scheduleText(db, dow, subgroup), scheduleKeyboard(dow, subgroup));
        break;
      }

      case 'st': {
        const date = rest[0];
        const pair = Number(rest[1]);
        const userId = rest[2];
        const target = getUser(userId);
        const actor = boundUser(resolved);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !pair || !target) {
          toast = 'Некорректные данные';
          alert = true;
          break;
        }
        if (!actor) {
          toast = 'Сначала привяжитесь: /bind user-1';
          alert = true;
          break;
        }
        if (!isAdmin(actor) && actor.id !== target.id) {
          toast = 'Можно менять только свой статус';
          alert = true;
          break;
        }
        const record = attendanceFor(date, pair);
        const status = cycleStatus(record, target.id);
        toast = `${shortName(target)}: ${statusTitle(status)}`;
        const view = await renderJournal(date, pair);
        await reply(view.text, view.keyboard);
        break;
      }

      case 'all': {
        const date = rest[0];
        const pair = Number(rest[1]);
        const actor = boundUser(resolved);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !pair) {
          toast = 'Некорректные данные';
          alert = true;
          break;
        }
        if (!actor || !isAdmin(actor)) {
          toast = 'Отмечать всех может только старостат';
          alert = true;
          break;
        }
        const record = attendanceFor(date, pair);
        setAllStatus(record, 'present');
        toast = 'Все отмечены присутствующими';
        const view = await renderJournal(date, pair);
        await reply(view.text, view.keyboard);
        break;
      }

      case 'hw': {
        const taskId = rest[0];
        const user = boundUser(resolved);
        if (!user) {
          toast = 'Сначала привяжитесь: /bind user-1';
          alert = true;
          break;
        }
        const result = toggleHomework(taskId, user.id);
        if (!result) {
          toast = 'Задание не найдено';
          alert = true;
          break;
        }
        toast = `${result.task.subject}: ${result.done ? 'сдано ✅' : 'снято ⬜️'}`;
        await reply(homeworkText(db, user.id), homeworkKeyboard(db, user.id));
        break;
      }

      case 'vote': {
        const pollId = rest[0];
        const optionId = rest[1];
        const user = boundUser(resolved);
        if (!user) {
          toast = 'Сначала привяжитесь: /bind user-1';
          alert = true;
          break;
        }
        const result = votePoll(pollId, optionId, user.id);
        if (!result) {
          toast = 'Опрос закрыт или вариант не найден';
          alert = true;
          break;
        }
        toast = result.already ? 'Голос отозван' : `Голос учтён: ${result.option.text}`;
        await reply(pollText(db, result.poll), pollKeyboard(result.poll));
        break;
      }

      default:
        toast = 'Неизвестная кнопка';
        alert = true;
    }
  } catch (error) {
    console.error('[callback]', error);
    toast = 'Ошибка. Попробуйте ещё раз.';
    alert = true;
  }

  await answer(query.id, toast, alert);
}

async function handleUpdate(update) {
  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
    saveDb();
  } catch (error) {
    console.error('[update]', error);
  }
}

let offset = Number(getDb().meta.tgOffset || 0);
let running = true;

async function pollLoop() {
  while (running) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        getDb().meta.tgOffset = offset;
        await handleUpdate(update);
        saveDb();
      }
    } catch (error) {
      if (error.code === 401) {
        console.error('[!] Неверный токен бота (401 Unauthorized). Проверьте TELEGRAM_BOT_TOKEN.');
        process.exit(1);
      }
      if (error.code === 409) {
        console.error('[!] Конфликт: похоже, запущен другой экземпляр бота. Жду 10 секунд...');
        await sleep(10000);
        continue;
      }
      if (error.code === 429) {
        await sleep(((error.parameters && error.parameters.retry_after) || 3) * 1000);
        continue;
      }
      console.error('[poll]', error.message);
      await sleep(3000);
    }
  }
}

async function start() {
  try {
    await tg('deleteWebhook', { drop_pending_updates: false });
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  const me = await tg('getMe');
  console.log(`\n🤖 Бот запущен: @${me.username} (${me.first_name})`);
  console.log('   Режим: long polling, без вебхука.');
  console.log(`   База: ${path.join(__dirname, 'data', 'db.json')}`);
  console.log('   Остановка: Ctrl+C\n');

  try {
    await tg('setMyCommands', { commands: BOT_COMMANDS });
  } catch (error) {
    console.error('[commands]', error.message);
  }

  await pollLoop();
}

process.on('SIGINT', () => {
  running = false;
  console.log('\n[bot] Остановлен.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  running = false;
  process.exit(0);
});

start().catch((error) => {
  console.error('[start]', error.message || error);
  process.exit(1);
});
