import fs from 'node:fs';
import path from 'node:path';
import { Telegraf, Markup } from 'telegraf';
import { getSchedule } from './schedule/ruc.mjs';

const DATA_DIR = process.env.DATA_DIR || '/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return { users: {}, groups: {} }; }
}
const db = readUsers();
db.users ||= {};
db.groups ||= {};

function saveDb() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не задан.');
  process.exit(1);
}

const bot = new Telegraf(token);

const menu = Markup.keyboard([
  ['📅 Сегодня', '📅 Завтра'],
  ['🗓 Неделя', '👥 Моя группа'],
  ['📊 Создать опрос', '👥 Группы'],
  ['🔄 Обновить', 'ℹ️ Помощь']
]).resize();

function user(id) {
  const key = String(id);
  db.users[key] ||= { group: '', pendingPoll: null };
  return db.users[key];
}

function format(items, group) {
  if (!items.length) return 'На ближайшие дни занятий для группы «' + group + '» не найдено.';
  const out = [];
  let current = '';
  for (const x of items) {
    if (x.date !== current) {
      current = x.date;
      out.push('\n📅 ' + (x.date || 'Дата не указана'));
    }
    let line = '• ' + (x.time ? x.time + ' — ' : '') + (x.subject || 'Занятие');
    if (x.teacher) line += '\n   👨‍🏫 ' + x.teacher;
    if (x.room) line += '\n   🚪 ' + x.room;
    out.push(line);
  }
  return out.join('\n').trim();
}

async function show(ctx, days, offset) {
  const u = user(ctx.from.id);
  if (!u.group) return ctx.reply('Сначала укажи группу. Пример: /group ИСП-21', menu);
  await ctx.reply('⏳ Загружаю расписание…');
  try {
    let items = await getSchedule(u.group, days);
    if (offset) items = items.filter(x => Number(x.dayOffset) === offset);
    await ctx.reply(format(items, u.group), menu);
  } catch (e) {
    console.error('[schedule]', e);
    await ctx.reply('❌ Не удалось получить расписание с сайта. Проверь источник или SCHEDULE_API_URL.', menu);
  }
}

function isPrivate(ctx) {
  return ctx.chat?.type === 'private';
}

async function isGroupAdmin(ctx) {
  if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type)) return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

function registerGroup(ctx) {
  const id = String(ctx.chat.id);
  db.groups[id] = {
    chatId: ctx.chat.id,
    title: ctx.chat.title || 'Группа без названия',
    addedBy: ctx.from.id,
    addedAt: new Date().toISOString()
  };
  saveDb();
}

function removeGroup(ctx) {
  delete db.groups[String(ctx.chat.id)];
  saveDb();
}

function groupButtons() {
  const groups = Object.values(db.groups);
  const buttons = groups.map(g => [
    Markup.button.callback('📢 ' + String(g.title).slice(0, 45), 'pollsend:' + String(g.chatId))
  ]);
  if (groups.length > 1) buttons.push([Markup.button.callback('📢 Во все группы', 'pollsend:all')]);
  return buttons;
}

async function startPoll(ctx) {
  if (!isPrivate(ctx)) {
    return ctx.reply('🔒 Создание опроса выполняется в личных сообщениях с ботом.');
  }

  const text = ctx.message?.text?.replace(/^\/poll(?:@\S+)?/i, '').trim() || '';
  if (!text) {
    return ctx.reply(
      '📊 Создание опроса\n\n' +
      'Формат:\n/poll Вопрос | Вариант 1 | Вариант 2 | Вариант 3\n\n' +
      'Пример:\n/poll Кто будет на собрании? | Буду | Не буду | Пока не знаю'
    );
  }

  const parts = text.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 3) {
    return ctx.reply('❌ Нужно минимум: вопрос + 2 варианта. Разделяй их символом |');
  }

  const question = parts.shift();
  const options = parts.slice(0, 10);
  if (question.length > 300) return ctx.reply('❌ Вопрос слишком длинный (максимум 300 символов).');
  if (options.some(x => x.length > 100)) return ctx.reply('❌ Один из вариантов длиннее 100 символов.');
  if (options.length < 2) return ctx.reply('❌ Нужно минимум два варианта ответа.');

  const u = user(ctx.from.id);
  u.pendingPoll = { question, options };
  saveDb();

  const groups = Object.values(db.groups);
  if (!groups.length) {
    return ctx.reply(
      '❌ Нет прикреплённых групп.\n\n' +
      'Добавь бота в нужную группу, сделай себя администратором и выполни там /attach.'
    );
  }

  await ctx.reply(
    '📊 Опрос создан. Выбери, куда его отправить:',
    Markup.inlineKeyboard(groupButtons())
  );
}

bot.start(async ctx => {
  user(ctx.from.id);
  saveDb();
  await ctx.reply(
    '👋 Привет! Я бот расписания.\n\n' +
    'Укажи группу командой /group ИСП-21.\n\n' +
    '📊 Опросы создаются в личке: /poll Вопрос | Да | Нет',
    menu
  );
});

bot.help(ctx => ctx.reply(
  'Команды:\n' +
  '/group — выбрать учебную группу\n' +
  '/schedule — сегодня\n' +
  '/tomorrow — завтра\n' +
  '/week — неделя\n' +
  '/poll — создать опрос в личке\n' +
  '/groups — список прикреплённых групп\n\n' +
  'В учебной группе администратор может выполнить /attach, чтобы прикрепить её к боту для отправки опросов.'
, menu));

bot.command('group', async ctx => {
  const value = ctx.message.text.replace(/^\/group(?:@\S+)?/i, '').trim();
  if (!value) return ctx.reply('Пример: /group ИСП-21');
  user(ctx.from.id).group = value;
  saveDb();
  await ctx.reply('✅ Группа сохранена: «' + value + '»', menu);
});

bot.command('attach', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('Эту команду нужно выполнить внутри группы, которую хочешь прикрепить.');
  }
  if (!(await isGroupAdmin(ctx))) {
    return ctx.reply('❌ Прикреплять группу может только её администратор.');
  }
  registerGroup(ctx);
  await ctx.reply(
    '✅ Группа прикреплена.\n\n' +
    'Теперь администратор может открыть личку с ботом и использовать /poll, чтобы отправлять опросы сюда.'
  );
});

bot.command('detach', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return;
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Откреплять группу может только её администратор.');
  removeGroup(ctx);
  await ctx.reply('✅ Группа откреплена от рассылки опросов.');
});

bot.command('groups', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список прикреплённых групп доступен в личных сообщениях.');
  const groups = Object.values(db.groups);
  if (!groups.length) return ctx.reply('Нет прикреплённых групп. Добавь бота в группу и выполни /attach.');
  await ctx.reply(
    '👥 Прикреплённые группы:\n\n' +
    groups.map((g, i) => (i + 1) + '. ' + g.title).join('\n')
  );
});

bot.command('poll', startPoll);
bot.hears('📊 Создать опрос', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание опроса выполняется в личных сообщениях.');
  return ctx.reply('Напиши опрос командой:\n/poll Вопрос | Вариант 1 | Вариант 2 | Вариант 3');
});

bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery?.data || '';
  if (!data.startsWith('pollsend:')) return;

  if (!isPrivate(ctx)) {
    await ctx.answerCbQuery('Опросы отправляются только из личных сообщений.');
    return;
  }

  const u = user(ctx.from.id);
  if (!u.pendingPoll) {
    await ctx.answerCbQuery('Опрос уже отправлен или устарел.');
    return;
  }

  const target = data.slice('pollsend:'.length);
  const groups = Object.values(db.groups);
  const targets = target === 'all'
    ? groups
    : groups.filter(g => String(g.chatId) === target);

  if (!targets.length) {
    await ctx.answerCbQuery('Группа не найдена.');
    return;
  }

  let sent = 0;
  for (const g of targets) {
    try {
      await ctx.telegram.sendPoll(
        g.chatId,
        u.pendingPoll.question,
        u.pendingPoll.options,
        {
          is_anonymous: true,
          allows_multiple_answers: false
        }
      );
      sent++;
    } catch (e) {
      console.error('[poll]', g.title, e);
    }
  }

  u.pendingPoll = null;
  saveDb();
  await ctx.answerCbQuery(sent ? 'Опрос отправлен.' : 'Не удалось отправить опрос.');
  await ctx.editMessageText(
    sent
      ? '✅ Опрос отправлен в ' + sent + ' группу(ы).'
      : '❌ Не удалось отправить опрос. Проверь, что бот всё ещё находится в группе и может отправлять сообщения.'
  );
});

bot.command('schedule', ctx => show(ctx, 1, 0));
bot.command('tomorrow', ctx => show(ctx, 2, 1));
bot.command('week', ctx => show(ctx, Number(process.env.SCHEDULE_DAYS || 7), 0));

bot.hears('📅 Сегодня', ctx => show(ctx, 1, 0));
bot.hears('📅 Завтра', ctx => show(ctx, 2, 1));
bot.hears('🗓 Неделя', ctx => show(ctx, Number(process.env.SCHEDULE_DAYS || 7), 0));
bot.hears('👥 Моя группа', ctx => {
  const g = user(ctx.from.id).group;
  return ctx.reply(g ? '👥 Твоя группа: «' + g + '»' : 'Группа ещё не выбрана. Используй /group.', menu);
});
bot.hears('👥 Группы', ctx => {
  const groups = Object.values(db.groups);
  return ctx.reply(
    groups.length ? '👥 Прикреплено групп: ' + groups.length + '\n' + groups.map(g => '• ' + g.title).join('\n')
      : 'Нет прикреплённых групп.',
    menu
  );
});
bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Укажи группу через /group ИСП-21. Опросы создаются в личке через /poll.', menu));

bot.catch(e => console.error('[bot]', e));

async function main() {
  await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  const me = await bot.telegram.getMe();
  console.log('Бот запущен: @' + me.username);
  await bot.launch({ dropPendingUpdates: false });
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main().catch(e => {
  console.error(e);
  process.exit(1);
});
