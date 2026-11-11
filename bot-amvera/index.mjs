import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
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
  ['📊 Создать опрос', '📚 Создать ДЗ'],
  ['👨‍🎓 Список студентов', '📋 Посещаемость'],
  ['👥 Группы'],
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
      'Формат:\n/дз Предмет | Домашнее задание\n\n' +
      'Пример:\n/дз Математика | Решить задачи 1–10 на странице 25'
    );
  }

  const parts = text.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return ctx.reply('❌ Укажи предмет и задание через |\nПример: /дз Математика | Решить задачи 1–10');

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
  '/дз — создать ДЗ и отправить в группу\n' +
  '/groups — список прикреплённых групп\n' +
  '/students — список студентов\n' +
  '/student — добавить студента\n' +
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

bot.command('role', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Роль настраивается в личных сообщениях или через администратора группы.');
  const value = ctx.message.text.replace(/^\\/role(?:@\\S+)?/i, '').trim().toLowerCase();
  const u = normalizeUser(user(ctx.from.id));
  if (!value) return ctx.reply('Твоя роль: ' + roleLabel(u.role) + '\\n\\nСтатус старосты назначает администратор группы.');
  if (value !== 'student') return ctx.reply('❌ Самостоятельно назначить себя старостой нельзя. Это делает администратор группы.');
  u.role = 'student';
  saveDb();
  await ctx.reply('✅ Роль установлена: 👨‍🎓 Студент', menu);
});

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
  const parts = ctx.message.text.replace(/^\\/mark(?:@\\S+)?/i, '').trim().split(/\\s+/);
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
bot.command('дз', startHomework);
bot.command('homework', startHomework);
bot.hears('📚 Создать ДЗ', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание ДЗ выполняется в личных сообщениях.');
  return ctx.reply('Напиши ДЗ командой:\n/дз Предмет | Домашнее задание');
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
bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Укажи группу через /group ИСП-21. Опросы создаются через /poll, а ДЗ — через /дз. Перед отправкой бот даст выбрать группу.', menu));

bot.catch(e => console.error('[bot]', e));

const port = Number(process.env.PORT || 80);
const healthServer = http.createServer((req, res) => {
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
