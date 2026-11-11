import fs from 'node:fs';
import path from 'node:path';
import { Telegraf, Markup } from 'telegraf';
import { getSchedule } from './schedule/ruc.mjs';

const DATA_DIR = process.env.DATA_DIR || '/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}
const users = readUsers();
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token) { console.error('TELEGRAM_BOT_TOKEN не задан.'); process.exit(1); }

const bot = new Telegraf(token);
const menu = Markup.keyboard([
  ['📅 Сегодня', '📅 Завтра'],
  ['🗓 Неделя', '👥 Моя группа'],
  ['🔄 Обновить', 'ℹ️ Помощь']
]).resize();

function user(id) {
  const key = String(id);
  if (!users[key]) users[key] = { group: '' };
  return users[key];
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
    await ctx.reply('❌ Не удалось получить расписание с сайта. Проверь доступность источника или настрой SCHEDULE_API_URL.', menu);
  }
}

bot.start(async ctx => {
  user(ctx.from.id); saveUsers();
  await ctx.reply('👋 Привет! Я бот расписания.\n\nУкажи группу командой /group ИСП-21.', menu);
});
bot.help(ctx => ctx.reply('Команды:\n/group — выбрать группу\n/schedule — сегодня\n/tomorrow — завтра\n/week — неделя\n/help — помощь', menu));
bot.command('group', async ctx => {
  const value = ctx.message.text.replace(/^\/group(?:@\S+)?/i, '').trim();
  if (!value) return ctx.reply('Пример: /group ИСП-21');
  user(ctx.from.id).group = value;
  saveUsers();
  await ctx.reply('✅ Группа сохранена: «' + value + '»', menu);
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
bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Укажи группу через /group ИСП-21, затем смотри расписание кнопками.', menu));
bot.catch(e => console.error('[bot]', e));

async function main() {
  await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  const me = await bot.telegram.getMe();
  console.log('Бот запущен: @' + me.username);
  await bot.launch({ dropPendingUpdates: false });
}
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
main().catch(e => { console.error(e); process.exit(1); });
