import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
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

const SUBSCRIPTION_STARS = Math.max(1, Number(process.env.SUBSCRIPTION_STARS || 100));
const SUBSCRIPTION_RUB = Math.max(1, Number(process.env.SUBSCRIPTION_RUB || 199));
const SUBSCRIPTION_DAYS = 30;
const YOOKASSA_SHOP_ID = (process.env.YOOKASSA_SHOP_ID || '').trim();
const YOOKASSA_SECRET_KEY = (process.env.YOOKASSA_SECRET_KEY || '').trim();
const YOOKASSA_RETURN_URL = (process.env.YOOKASSA_RETURN_URL || '').trim();
const SUBSCRIPTION_SECONDS = SUBSCRIPTION_DAYS * 24 * 60 * 60;

// Telegram user ID владельца, которому подписка не требуется.
// Значение задаётся в переменных окружения сервера.
const OWNER_TELEGRAM_ID = (process.env.OWNER_TELEGRAM_ID || '').trim();

function isOwner(userId) {
  return Boolean(OWNER_TELEGRAM_ID) && String(userId) === OWNER_TELEGRAM_ID;
}

function subscriptionUntil(u) {
  return Number(u.subscriptionUntil || 0);
}

function hasActiveSubscription(u) {
  return subscriptionUntil(u) > Date.now();
}

function subscriptionText(u, owner = false) {
  if (owner) return '👑 <b>Бесплатный доступ владельца</b>\\n\\nПодписка для твоего аккаунта не требуется.';
  if (!hasActiveSubscription(u)) {
    return '🔒 <b>Подписка не активна</b>\\n\\n' +
      'Для использования бота нужна подписка на 30 дней.\\n' +
      'Стоимость: <b>' + SUBSCRIPTION_STARS + ' ⭐</b>.\\n\\n' +
      'Нажми «💳 Подписка», чтобы оформить её.';
  }
  const date = new Date(subscriptionUntil(u)).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return '✅ <b>Подписка активна</b>\\n\\nДействует до: <b>' + date + ' МСК</b>';
}

function subscriptionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⭐ Оплатить Stars — ' + SUBSCRIPTION_STARS, 'subscribe')],
    [Markup.button.callback('💳 Оплатить картой — ' + SUBSCRIPTION_RUB + ' ₽', 'subscribe_card')]
  ]);
}

function yookassaConfigured() {
  return Boolean(YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY && YOOKASSA_RETURN_URL);
}

async function createYooKassaPayment(userId) {
  if (!yookassaConfigured()) throw new Error('ЮKassa не настроена: проверь YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY и YOOKASSA_RETURN_URL.');

  const idempotenceKey = crypto.randomUUID();
  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY).toString('base64'),
      'Idempotence-Key': idempotenceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: { value: SUBSCRIPTION_RUB.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: YOOKASSA_RETURN_URL },
      description: 'Подписка на бота на 30 дней',
      metadata: { telegram_user_id: String(userId), product: 'bot_subscription_30d' }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.confirmation?.confirmation_url) {
    throw new Error('ЮKassa: ' + (data.description || data.message || ('HTTP ' + response.status)));
  }
  return data;
}

function subscriptionMiddleware(ctx, next) {
  const text = ctx.message?.text || '';
  const command = text.split(/\s+/)[0].replace(/^\//, '').replace(/@.*$/, '').toLowerCase();

  // Платёжные обновления Telegram должны проходить до paywall.
  // successful_payment приходит как message с полем successful_payment,
  // поэтому проверка только ctx.updateType === 'successful_payment' не срабатывает.
  if (
    ctx.updateType === 'pre_checkout_query' ||
    ctx.message?.successful_payment ||
    (ctx.updateType === 'callback_query' && ['subscribe', 'subscribe_card'].includes(ctx.callbackQuery?.data))
  ) return next();

  const allowed = new Set(['start', 'help', 'subscribe', 'subscription', 'terms', 'paysupport']);
  if (allowed.has(command)) return next();

  if (!ctx.from) return next();
  if (isOwner(ctx.from.id)) return next();

  const u = normalizeUser(user(ctx.from.id));
  if (hasActiveSubscription(u)) return next();

  return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...subscriptionKeyboard() });
}

bot.use(subscriptionMiddleware);

const menu = Markup.keyboard([
  ['📅 Сегодня', '📅 Завтра'],
  ['🗓 Неделя', '👥 Моя группа'],
  ['📊 Создать опрос', '📚 Создать ДЗ'],
  ['👨‍🎓 Список студентов', '📋 Посещаемость'],
  ['👥 Группы'],
  ['💳 Подписка'],
  ['🔄 Обновить', 'ℹ️ Помощь']
]).resize();

function user(id) {
  const key = String(id);
  db.users[key] ||= { group: '', role: 'student', pendingPoll: null, pendingHomework: null, students: [], attendance: {} };
  return db.users[key];
}

function normalizeUser(u) {
  u.role ||= 'student';
  u.students ||= [];
  u.attendance ||= {};
  u.subscriptionUntil ||= 0;
  u.paymentHistory ||= [];
  u.pendingYooKassaPaymentId ||= '';
  return u;
}

function roleLabel(role) {
  return role === 'starosta' ? '👑 Староста' : '👨‍🎓 Студент';
}

function formatAttendance(u) {
  const all = [];
  for (const [student, dates] of Object.entries(u.attendance || {})) {
    for (const [date, status] of Object.entries(dates || {})) {
      all.push({ student, date, status });
    }
  }
  if (!all.length) return '📋 <b>Посещаемость</b>\\n\\nПока нет отметок.';
  const present = all.filter(x => x.status === 'present').length;
  const absent = all.filter(x => x.status === 'absent').length;
  return '📋 <b>Посещаемость</b>\\n\\n' +
    '👨‍🎓 Студентов: ' + u.students.length + '\\n' +
    '✅ Присутствий: ' + present + '\\n' +
    '❌ Отсутствий: ' + absent + '\\n' +
    '📊 Отметок: ' + all.length + '\\n\\n' +
    all.slice(-20).reverse().map(x => (x.status === 'present' ? '✅ ' : '❌ ') + x.date + ' — ' + escapeHtml(x.student)).join('\\n');
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attendanceButtons(u) {
  const buttons = [];
  for (let i = 0; i < u.students.length; i++) {
    buttons.push([Markup.button.callback('👨‍🎓 ' + String(u.students[i]).slice(0, 35), 'attstudent:' + i)]);
  }
  return buttons;
}

function attendanceStatusButtons(index) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Был', 'attmark:' + index + ':present'),
      Markup.button.callback('❌ Не был', 'attmark:' + index + ':absent')
    ]
  ]);
}

function studentButtons() {
  const groups = Object.values(db.groups);
  return groups.map(g => [Markup.button.callback('👨‍🎓 ' + String(g.title).slice(0, 45), 'students:' + String(g.chatId))]);
}

function groupButtons() {
  const groups = Object.values(db.groups);
  const buttons = groups.map(g => [
    Markup.button.callback('📢 ' + String(g.title).slice(0, 45), 'pollsend:' + String(g.chatId))
  ]);
  if (groups.length > 1) buttons.push([Markup.button.callback('📢 Во все группы', 'pollsend:all')]);
  return buttons;
}

function homeworkButtons() {
  const groups = Object.values(db.groups);
  const buttons = groups.map(g => [
    Markup.button.callback('📚 ' + String(g.title).slice(0, 45), 'hwsend:' + String(g.chatId))
  ]);
  if (groups.length > 1) buttons.push([Markup.button.callback('📚 Во все группы', 'hwsend:all')]);
  return buttons;
}

async function startHomework(ctx) {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание ДЗ выполняется в личных сообщениях с ботом.');

  const text = ctx.message?.text?.replace(/^\/(?:дз|homework)(?:@\S+)?/i, '').trim() || '';
  if (!text) {
    return ctx.reply(
      '📚 Создание домашнего задания\n\n' +
      'Формат:\n/hw Предмет | Домашнее задание\n\n' +
      'Пример:\n/hw Математика | Решить задачи 1–10 на странице 25'
    );
  }

  const parts = text.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return ctx.reply('❌ Укажи предмет и задание через |\nПример: /hw Математика | Решить задачи 1–10');

  const subject = parts.shift();
  const homework = parts.join(' | ');
  if (subject.length > 100) return ctx.reply('❌ Название предмета слишком длинное.');
  if (homework.length > 3500) return ctx.reply('❌ Текст ДЗ слишком длинный (максимум 3500 символов).');

  const u = user(ctx.from.id);
  u.pendingHomework = { subject, homework };
  saveDb();

  const groups = Object.values(db.groups);
  if (!groups.length) {
    return ctx.reply('❌ Нет прикреплённых групп. Добавь бота в нужную группу, сделай себя администратором и выполни там /attach.');
  }

  await ctx.reply('📚 ДЗ создано. Выбери, в какую группу его отправить:', Markup.inlineKeyboard(homeworkButtons()));
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
  if (parts.length < 3) return ctx.reply('❌ Нужно минимум: вопрос + 2 варианта. Разделяй их символом |');

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

  await ctx.reply('📊 Опрос создан. Выбери, куда его отправить:', Markup.inlineKeyboard(groupButtons()));
}

bot.command('subscribe', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Оформить подписку можно только в личных сообщениях с ботом.');
  if (isOwner(ctx.from.id)) return ctx.reply('👑 У тебя бесплатный доступ владельца. Оплата не требуется.', menu);
  const u = normalizeUser(user(ctx.from.id));
  if (hasActiveSubscription(u)) return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...menu });

  await ctx.reply(
    '💳 <b>Подписка на бота</b>\\n\\n' +
    'Доступ ко всем функциям на 30 дней.\\n' +
    'Стоимость: <b>' + SUBSCRIPTION_STARS + ' ⭐</b>.\\n\\n' +
    'Оплата проходит прямо через Telegram Stars.',
    { parse_mode: 'HTML', ...subscriptionKeyboard() }
  );
});

bot.command('subscription', ctx => {
  const u = normalizeUser(user(ctx.from.id));
  return ctx.reply(subscriptionText(u, isOwner(ctx.from.id)), { parse_mode: 'HTML', ...menu });
});

bot.command('terms', ctx => ctx.reply(
  '📄 <b>Условия использования</b>\\n\\n' +
  'Подписка предоставляет доступ к функциям бота на оплаченный период. ' +
  'Оплата производится в Telegram Stars. Возвраты и вопросы по оплате рассматриваются через /paysupport.',
  { parse_mode: 'HTML' }
));

bot.command('paysupport', ctx => ctx.reply(
  '🆘 <b>Поддержка по оплате</b>\\n\\n' +
  'Если оплата прошла, но доступ не появился, отправь сюда скриншот платежа и свой Telegram ID.',
  { parse_mode: 'HTML' }
));

bot.on('callback_query', async ctx => {
  if (ctx.callbackQuery?.data === 'yookassa_check') {
    await ctx.answerCbQuery('Проверяю платёж…');
    const u = normalizeUser(user(ctx.from.id));
    if (!u.pendingYooKassaPaymentId) {
      await ctx.reply('ℹ️ Ожидаемый платёж не найден. Нажми «💳 Подписка» и создай новый платёж.');
      return;
    }
    try {
      const payment = await getYooKassaPayment(u.pendingYooKassaPaymentId);
      console.log('[yookassa:check]', payment.id, payment.status, payment.paid);
      if (payment.status === 'succeeded' && payment.paid) {
        const activated = await processYooKassaPayment(payment);
        if (activated) {
          await ctx.reply('✅ Платёж подтверждён. Подписка активирована на 30 дней.', menu);
        } else {
          await ctx.reply('⚠️ Платёж найден, но не прошёл проверку суммы/назначения. Проверь настройки ЮKassa.');
        }
      } else if (payment.status === 'pending') {
        await ctx.reply('⏳ Платёж ещё не завершён. Если ты уже оплатил, подожди несколько секунд и нажми «🔄 Проверить оплату» ещё раз.');
      } else {
        await ctx.reply('❌ Платёж имеет статус: ' + payment.status + '. Создай новый платёж.');
      }
    } catch (e) {
      console.error('[yookassa:check]', e);
      await ctx.reply('❌ Не удалось проверить платёж: ' + e.message);
    }
    return;
  }

  if (ctx.callbackQuery?.data === 'subscribe_card') {
    if (isOwner(ctx.from.id)) {
      await ctx.answerCbQuery('Для владельца доступ бесплатный.');
      return;
    }
    if (!isPrivate(ctx)) {
      await ctx.answerCbQuery('Оплата картой доступна в личке.');
      return;
    }
    await ctx.answerCbQuery();
    try {
      const payment = await createYooKassaPayment(ctx.from.id);
      const u = normalizeUser(user(ctx.from.id));
      u.pendingYooKassaPaymentId = payment.id;
      saveDb();
      await ctx.reply(
        '💳 <b>Оплата банковской картой</b>\\n\\n' +
        'Сумма: <b>' + SUBSCRIPTION_RUB + ' ₽</b>\\n' +
        'Срок: <b>30 дней</b>\\n\\n' +
        'После оплаты нажми «🔄 Проверить оплату».',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
          [Markup.button.url('💳 Перейти к оплате', payment.confirmation.confirmation_url)],
          [Markup.button.callback('🔄 Проверить оплату', 'yookassa_check')]
        ]) }
      );
    } catch (e) {
      console.error('[yookassa:create]', e);
      await ctx.reply('❌ Не удалось создать оплату картой. Проверь настройки ЮKassa на сервере.');
    }
    return;
  }
  if (ctx.callbackQuery?.data === 'subscribe') {
    if (isOwner(ctx.from.id)) {
      await ctx.answerCbQuery('Для владельца доступ бесплатный.');
      return;
    }
    if (!isPrivate(ctx)) {
      await ctx.answerCbQuery('Оформление подписки доступно в личке.');
      return;
    }
    await ctx.answerCbQuery();
    await ctx.telegram.sendInvoice(ctx.from.id, {
      title: 'Подписка на бота',
      description: 'Доступ ко всем функциям бота на 30 дней',
      payload: 'bot_subscription_30d',
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Подписка на 30 дней', amount: SUBSCRIPTION_STARS }],
      subscription_period: SUBSCRIPTION_SECONDS,
      start_parameter: 'bot-subscription'
    });
    return;
  }
  return next();
});

bot.on('pre_checkout_query', async ctx => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async ctx => {
  const payment = ctx.message.successful_payment;
  if (payment.invoice_payload !== 'bot_subscription_30d') return;

  const u = normalizeUser(user(ctx.from.id));
  const expiration = Number(payment.subscription_expiration_date || 0);
  const base = Math.max(Date.now(), subscriptionUntil(u));
  u.subscriptionUntil = expiration > 0 ? expiration * 1000 : base + SUBSCRIPTION_SECONDS * 1000;
  u.subscriptionChargeId = payment.telegram_payment_charge_id || '';
  saveDb();

  await ctx.reply(
    '🎉 <b>Подписка активирована!</b>\\n\\n' +
    'Доступ действует до: <b>' +
    new Date(u.subscriptionUntil).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }) +
    ' МСК</b>.\\n\\n' +
    'Теперь можешь пользоваться ботом.',
    { parse_mode: 'HTML', ...menu }
  );
});

async function getYooKassaPayment(paymentId) {
  if (!yookassaConfigured()) throw new Error('ЮKassa не настроена.');
  const response = await fetch('https://api.yookassa.ru/v3/payments/' + encodeURIComponent(paymentId), {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY).toString('base64'),
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('ЮKassa GET: ' + (data.description || data.message || ('HTTP ' + response.status)));
  }
  return data;
}

async function processYooKassaPayment(payment) {
  if (!payment || payment.status !== 'succeeded' || !payment.paid) return false;
  if (payment.metadata?.product !== 'bot_subscription_30d') return false;

  const userId = String(payment.metadata?.telegram_user_id || '');
  if (!userId) return false;
  const u = normalizeUser(user(userId));

  if (u.paymentHistory.some(x => x.id === payment.id)) return true;

  const expected = SUBSCRIPTION_RUB.toFixed(2);
  const actual = Number(payment.amount?.value || 0).toFixed(2);
  if (actual !== expected || payment.amount?.currency !== 'RUB') {
    console.error('[yookassa] Сумма платежа не совпадает:', payment.id, actual, payment.amount);
    return false;
  }

  const base = Math.max(Date.now(), subscriptionUntil(u));
  u.subscriptionUntil = base + SUBSCRIPTION_SECONDS * 1000;
  u.paymentHistory.push({
    id: payment.id,
    method: 'yookassa',
    amount: actual,
    currency: 'RUB',
    paidAt: new Date().toISOString()
  });
  u.pendingYooKassaPaymentId = '';
  saveDb();

  try {
    await bot.telegram.sendMessage(
      Number(userId),
      '🎉 <b>Оплата получена!</b>\\n\\n' +
      '💳 Способ: банковская карта (ЮKassa)\\n' +
      '💰 Сумма: <b>' + actual + ' ₽</b>\\n' +
      '📅 Подписка действует до: <b>' +
      new Date(u.subscriptionUntil).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }) +
      ' МСК</b>.',
      { parse_mode: 'HTML', ...menu }
    );
  } catch (e) {
    console.error('[yookassa:notify]', e);
  }
  return true;
}

async function handleYooKassaWebhook(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const event = JSON.parse(body || '{}');
      if (event.event === 'payment.succeeded') {
        await processYooKassaPayment(event.object);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OK');
    } catch (e) {
      console.error('[yookassa:webhook]', e);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
    }
  });
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
  '/hw — создать ДЗ и отправить в группу\n' +
  '/groups — список прикреплённых групп\n' +
  '/students — список студентов\n' +
  '/student — добавить студента\n' +
  '/role или /roles — показать свою роль\n' +
  '/delstudent — удалить студента\n\n' +
  'В учебной группе администратор может выполнить /attach, чтобы прикрепить её к боту для отправки опросов.',
  menu
));

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
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Прикреплять группу может только её администратор.');
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

bot.command('students', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список студентов доступен в личных сообщениях.');
  const u = user(ctx.from.id);
  if (!u.students?.length) {
    return ctx.reply('👨‍🎓 Список студентов пока пуст.\n\nДобавь студентов командой:\n/student Иван Иванов\n\nМожно добавить несколько человек по одному.');
  }
  await ctx.reply('👨‍🎓 Список студентов:\n\n' + u.students.map((s, i) => (i + 1) + '. ' + s).join('\n'));
});

bot.command('student', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Добавление студентов выполняется в личных сообщениях.');
  const value = ctx.message.text.replace(/^\/student(?:@\S+)?/i, '').trim();
  if (!value) return ctx.reply('Пример: /student Иван Иванов');
  const u = user(ctx.from.id);
  u.students ||= [];
  if (u.students.includes(value)) return ctx.reply('ℹ️ Этот студент уже есть в списке.');
  if (u.students.length >= 100) return ctx.reply('❌ Максимум 100 студентов.');
  u.students.push(value);
  saveDb();
  await ctx.reply('✅ Студент добавлен: ' + value);
});

bot.command('delstudent', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Управление списком студентов доступно в личных сообщениях.');
  const value = ctx.message.text.replace(/^\/delstudent(?:@\S+)?/i, '').trim();
  const u = user(ctx.from.id);
  const index = Number(value) - 1;
  if (!value || !Number.isInteger(index) || index < 0 || index >= (u.students?.length || 0)) return ctx.reply('Пример: /delstudent 3');
  const removed = u.students.splice(index, 1)[0];
  saveDb();
  await ctx.reply('🗑 Удалён: ' + removed);
});

bot.hears('👨‍🎓 Список студентов', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список студентов доступен в личных сообщениях.');
  return ctx.reply('👨‍🎓 Чтобы посмотреть список, используй /students.\n\nДобавить: /student Имя Фамилия\nУдалить: /delstudent номер');
});

async function showRole(ctx) {
  if (!isPrivate(ctx)) return ctx.reply('📩 Роль настраивается в личных сообщениях или через администратора группы.');
  const value = (ctx.message?.text || '').replace(/^\/(?:role|roles)(?:@\S+)?/i, '').trim().toLowerCase();
  const u = normalizeUser(user(ctx.from.id));
  if (!value) {
    return ctx.reply('👤 Твоя роль: ' + roleLabel(u.role) + '\n\n👑 Назначить старостой тебя может только администратор группы.');
  }
  if (value !== 'student') return ctx.reply('❌ Самостоятельно назначить себя старостой нельзя. Это делает администратор группы.');
  u.role = 'student';
  saveDb();
  await ctx.reply('✅ Роль установлена: 👨‍🎓 Студент', menu);
}

bot.command('role', showRole);
bot.command('roles', showRole);


bot.command('setstarosta', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Эту команду нужно выполнить в группе.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Назначать старосту может только администратор группы.');
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply('Ответь командой /setstarosta на сообщение нужного человека.');
  const u = normalizeUser(user(target.id));
  u.role = 'starosta';
  u.group = ctx.chat.title || u.group;
  db.groups[String(ctx.chat.id)] ||= { chatId: ctx.chat.id, title: ctx.chat.title || 'Группа без названия' };
  db.groups[String(ctx.chat.id)].starostaId = target.id;
  saveDb();
  await ctx.reply('👑 ' + (target.first_name || 'Пользователь') + ' назначен старостой.');
});

bot.command('setstudent', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Эту команду нужно выполнить в группе.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Менять роль может только администратор группы.');
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply('Ответь командой /setstudent на сообщение нужного человека.');
  const u = normalizeUser(user(target.id));
  u.role = 'student';
  saveDb();
  await ctx.reply('👨‍🎓 ' + (target.first_name || 'Пользователь') + ' теперь отмечен как студент.');
});

bot.command('attendance', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Посещаемость доступна в личных сообщениях.');
  const u = normalizeUser(user(ctx.from.id));
  if (u.role === 'starosta' && u.students.length) {
    return ctx.reply('📋 Выбери студента для отметки посещаемости:', Markup.inlineKeyboard(attendanceButtons(u)));
  }
  await ctx.reply(formatAttendance(u), { parse_mode: 'HTML', ...menu });
});

bot.command('mark', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Отметки посещаемости делаются в личных сообщениях.');
  const u = normalizeUser(user(ctx.from.id));
  if (u.role !== 'starosta') return ctx.reply('❌ Только староста может отмечать посещаемость.');
  const parts = ctx.message.text.replace(/^\/mark(?:@\S+)?/i, '').trim().split(/\s+/);
  const index = Number(parts[0]) - 1;
  const status = parts[1] === 'absent' ? 'absent' : parts[1] === 'present' ? 'present' : '';
  if (!Number.isInteger(index) || index < 0 || index >= u.students.length || !status) {
    return ctx.reply('Пример: /mark 3 present\\nили: /mark 3 absent');
  }
  const today = new Date().toISOString().slice(0, 10);
  u.attendance[u.students[index]] ||= {};
  u.attendance[u.students[index]][today] = status;
  saveDb();
  await ctx.reply((status === 'present' ? '✅' : '❌') + ' ' + u.students[index] + ' — отметка сохранена за ' + today);
});

bot.command('groups', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список прикреплённых групп доступен в личных сообщениях.');
  const groups = Object.values(db.groups);
  if (!groups.length) return ctx.reply('Нет прикреплённых групп. Добавь бота в группу и выполни /attach.');
  await ctx.reply('👥 Прикреплённые группы:\n\n' + groups.map((g, i) => (i + 1) + '. ' + g.title).join('\n'));
});

bot.command('poll', startPoll);
bot.command('students', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список студентов доступен в личных сообщениях.');
  const u = user(ctx.from.id);
  if (!u.students?.length) return ctx.reply('👨‍🎓 Список студентов пуст. Добавить: /student Иван Иванов');
  await ctx.reply('👨‍🎓 Список студентов:\n\n' + u.students.map((s,i)=>(i+1)+'. '+s).join('\n'));
});
bot.command('hw', startHomework);
bot.command('homework', startHomework);
bot.hears('📚 Создать ДЗ', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание ДЗ выполняется в личных сообщениях.');
  return ctx.reply('Напиши ДЗ командой:\n/hw Предмет | Домашнее задание');
});
bot.hears('📊 Создать опрос', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание опроса выполняется в личных сообщениях.');
  return ctx.reply('Напиши опрос командой:\n/poll Вопрос | Вариант 1 | Вариант 2 | Вариант 3');
});

bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery?.data || '';
  if (!data.startsWith('pollsend:') && !data.startsWith('hwsend:') && !data.startsWith('students:') && !data.startsWith('attstudent:') && !data.startsWith('attmark:')) return;

  const isAttendanceStudent = data.startsWith('attstudent:');
  const isAttendanceMark = data.startsWith('attmark:');
  if (isAttendanceStudent || isAttendanceMark) {
    if (!isPrivate(ctx)) { await ctx.answerCbQuery('Только в личке.'); return; }
    const u = normalizeUser(user(ctx.from.id));
    if (u.role !== 'starosta') { await ctx.answerCbQuery('Только староста.'); return; }
    if (isAttendanceStudent) {
      const index = Number(data.slice('attstudent:'.length));
      if (!Number.isInteger(index) || !u.students[index]) { await ctx.answerCbQuery('Студент не найден.'); return; }
      await ctx.answerCbQuery('Выберите статус');
      await ctx.editMessageText('📋 Отметить посещаемость:\\n\\n👨‍🎓 ' + u.students[index], attendanceStatusButtons(index));
      return;
    }
    const parts = data.slice('attmark:'.length).split(':');
    const index = Number(parts[0]);
    const status = parts[1];
    if (!u.students[index] || !['present','absent'].includes(status)) { await ctx.answerCbQuery('Ошибка.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    u.attendance[u.students[index]] ||= {};
    u.attendance[u.students[index]][today] = status;
    saveDb();
    await ctx.answerCbQuery('Сохранено');
    await ctx.editMessageText((status === 'present' ? '✅' : '❌') + ' ' + u.students[index] + ' — ' + today);
    return;
  }

  const isStudentList = data.startsWith('students:');
  const isHomework = data.startsWith('hwsend:');
  if (isStudentList) {
    if (!isPrivate(ctx)) { await ctx.answerCbQuery('Только в личке.'); return; }
    const groupId = data.slice('students:'.length);
    const g = db.groups[groupId];
    if (!g) { await ctx.answerCbQuery('Группа не найдена.'); return; }
    const u = user(ctx.from.id);
    if (!u.students?.length) { await ctx.answerCbQuery('Список пуст.'); return; }
    await ctx.answerCbQuery('Готово');
    await ctx.editMessageText('👨‍🎓 Список студентов для «' + g.title + '»:\n\n' + u.students.map((s,i)=>(i+1)+'. '+s).join('\n'));
    return;
  }

  if (!isPrivate(ctx)) {
    await ctx.answerCbQuery('Опросы отправляются только из личных сообщений.');
    return;
  }

  const u = user(ctx.from.id);
  if (isHomework ? !u.pendingHomework : !u.pendingPoll) {
    await ctx.answerCbQuery(isHomework ? 'ДЗ уже отправлено или устарело.' : 'Опрос уже отправлен или устарел.');
    return;
  }

  const target = data.slice(isHomework ? 'hwsend:'.length : 'pollsend:'.length);
  const groups = Object.values(db.groups);
  const targets = target === 'all' ? groups : groups.filter(g => String(g.chatId) === target);

  if (!targets.length) {
    await ctx.answerCbQuery('Группа не найдена.');
    return;
  }

  let sent = 0;
  for (const g of targets) {
    try {
      if (isHomework) {
        await ctx.telegram.sendMessage(g.chatId, '📚 <b>Домашнее задание</b>\n\n<b>' + escapeHtml(u.pendingHomework.subject) + '</b>\n' + escapeHtml(u.pendingHomework.homework), { parse_mode: 'HTML' });
      } else {
        await ctx.telegram.sendPoll(g.chatId, u.pendingPoll.question, u.pendingPoll.options, {
          is_anonymous: false,
          allows_multiple_answers: false
        });
      }
      sent++;
    } catch (e) {
      console.error(isHomework ? '[homework]' : '[poll]', g.title, e);
    }
  }

  if (isHomework) u.pendingHomework = null;
  else u.pendingPoll = null;
  saveDb();
  const kind = isHomework ? 'ДЗ' : 'Опрос';
  await ctx.answerCbQuery(sent ? kind + ' отправлено.' : 'Не удалось отправить.');
  await ctx.editMessageText(
    sent
      ? '✅ ' + kind + ' отправлено в ' + sent + ' группу(ы).'
      : '❌ Не удалось отправить. Проверь, что бот всё ещё находится в группе и может отправлять сообщения.'
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
    groups.length ? '👥 Прикреплено групп: ' + groups.length + '\n' + groups.map(g => '• ' + g.title).join('\n') : 'Нет прикреплённых групп.',
    menu
  );
});
bot.hears('📋 Посещаемость', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Посещаемость доступна в личных сообщениях.');
  const u = normalizeUser(user(ctx.from.id));
  if (u.role === 'starosta' && u.students.length) return ctx.reply('📋 Выбери студента для отметки:', Markup.inlineKeyboard(attendanceButtons(u)));
  return ctx.reply(formatAttendance(u), { parse_mode: 'HTML', ...menu });
});
bot.hears('💳 Подписка', ctx => {
  const u = normalizeUser(user(ctx.from.id));
  if (isOwner(ctx.from.id)) return ctx.reply(subscriptionText(u, true), { parse_mode: 'HTML', ...menu });
  return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...subscriptionKeyboard() });
});

bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Укажи группу через /group ИСП-21. Опросы создаются через /poll, а ДЗ — через /дз. Перед отправкой бот даст выбрать группу.', menu));

bot.catch(e => console.error('[bot]', e));

const port = Number(process.env.PORT || 80);
const healthServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/yookassa/webhook') {
    return handleYooKassaWebhook(req, res);
  }
  if (req.method === 'GET' && req.url === '/payment-return') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оплата</title><body style="font-family:Arial,sans-serif;text-align:center;padding:40px"><h2>✅ Спасибо за оплату</h2><p>Платёж передан в обработку.</p><p>Вернитесь в Telegram и откройте бота — подписка активируется автоматически.</p></body></html>');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('OK');
});

async function main() {
  healthServer.listen(port, '0.0.0.0', () => {
    console.log('[health] HTTP сервер слушает 0.0.0.0:' + port);
  });

  await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  const me = await bot.telegram.getMe();
  console.log('Бот запущен: @' + me.username);

  // Обновляем список команд в меню Telegram.
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'help', description: 'Помощь' },
    { command: 'subscribe', description: 'Оформить подписку' },
    { command: 'subscription', description: 'Статус подписки' },
    { command: 'terms', description: 'Условия использования' },
    { command: 'paysupport', description: 'Поддержка по оплате' },
    { command: 'group', description: 'Выбрать учебную группу' },
    { command: 'schedule', description: 'Расписание на сегодня' },
    { command: 'tomorrow', description: 'Расписание на завтра' },
    { command: 'week', description: 'Расписание на неделю' },
    { command: 'role', description: 'Показать свою роль' },
    { command: 'roles', description: 'Показать свою роль' },
    { command: 'students', description: 'Список студентов' },
    { command: 'student', description: 'Добавить студента' },
    { command: 'delstudent', description: 'Удалить студента' },
    { command: 'attendance', description: 'Посещаемость' },
    { command: 'mark', description: 'Отметить посещаемость' },
    { command: 'poll', description: 'Создать опрос' },
    { command: 'hw', description: 'Создать домашнее задание' }
  ]);

  await bot.launch({ dropPendingUpdates: false });
}

function shutdown(signal) {
  console.log('[bot] Остановка (' + signal + ').');
  try { bot.stop(signal); } catch {}
  try { healthServer.close(); } catch {}
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
