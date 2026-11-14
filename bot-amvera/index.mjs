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
const SUBSCRIPTION_DAYS = 30;
const SUBSCRIPTION_SECONDS = SUBSCRIPTION_DAYS * 24 * 60 * 60;

// Telegram user ID владельца, которому подписка не требуется.
// Значение задаётся в переменных окружения сервера.
const OWNER_TELEGRAM_ID = (process.env.OWNER_TELEGRAM_ID || '').trim();

// Версия и список изменений для уведомления владельца после обновления.
// При каждом следующем обновлении меняй версию и дополняй список.
const BOT_RELEASE_VERSION = '2026.11.14.3';
const BOT_RELEASE_NOTES = [
  'Добавлен раздел «Объявления» в Mini App.',
  'Староста может отправлять объявления прямо в Telegram-группу.',
  'Добавлена история объявлений с датой, временем и автором.',
  'Mini App продолжает открываться, даже если источник расписания временно недоступен.',
  'При возвращении в приложение данные автоматически обновляются, а при ошибке старые данные остаются на экране.',
  'Исправлена команда /stats: убрана ссылка на удалённые переменные ЮKassa, из-за которых статистика не отправлялась.'
];
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();

function isOwner(userId) {
  return Boolean(OWNER_TELEGRAM_ID) && String(userId) === OWNER_TELEGRAM_ID;
}

function subscriptionUntil(u) {
  return Number(u.subscriptionUntil || 0);
}

function hasActiveSubscription(u) {
  return Boolean(u.subscriptionForever) || subscriptionUntil(u) > Date.now();
}

function subscriptionText(u, owner = false) {
  if (owner) return '👑 <b>Бесплатный доступ владельца</b>\\n\\nПодписка для твоего аккаунта не требуется.';
  if (u.subscriptionForever) return '♾ <b>Пожизненная подписка активна</b>\\n\\nДоступ без ограничения по сроку.';
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
    [Markup.button.callback('⭐ Оплатить через Telegram Stars — ' + SUBSCRIPTION_STARS, 'subscribe')]
  ]);
}

async function subscriptionMiddleware(ctx, next) {
  const text = ctx.message?.text || '';
  const command = text.split(/\s+/)[0].replace(/^\//, '').replace(/@.*$/, '').toLowerCase();

  if (
    ctx.updateType === 'pre_checkout_query' ||
    ctx.message?.successful_payment ||
    (ctx.updateType === 'callback_query' && (['subscribe', 'subscribe_card'].includes(ctx.callbackQuery?.data) || String(ctx.callbackQuery?.data || '').startsWith('studygroup:') || String(ctx.callbackQuery?.data || '').startsWith('studentimport:')))
  ) return next();

  if (!ctx.from) return next();
  if (isOwner(ctx.from.id)) return next();

  // Любой пользователь, написавший в назначенной группе, получает пожизненный доступ.
  if (ctx.chat && String(ctx.chat.id) === String(db.subscriptionGroupId || '') && ctx.chat.type !== 'private') {
    const memberUser = normalizeUser(user(ctx.from.id));
    if (!memberUser.subscriptionForever) {
      memberUser.subscriptionForever = true;
      memberUser.paymentHistory.push({ method: 'group_lifetime', groupId: String(ctx.chat.id), grantedAt: new Date().toISOString() });
      saveDb();
    }
  }

  const u = normalizeUser(user(ctx.from.id));
  // Разрешаем отправить ФИО до проверки подписки, если бот его запросил.
  if (isPrivate(ctx) && u.pendingFullName && ctx.message?.text && !ctx.message.text.startsWith('/')) return next();
  // При первом сообщении в группе просим выбрать учебную группу.
  if (ctx.updateType === 'message' && ctx.chat && ['group', 'supergroup'].includes(ctx.chat.type) && !u.group && !String(ctx.message?.text || '').startsWith('/')) {
    await ctx.reply(
      '👋 Чтобы показывать правильное расписание и домашние задания, выбери свою учебную группу:',
      Markup.inlineKeyboard([
        [Markup.button.callback('БИ(ЭБ)2-ОЗ/Бп/КД26', 'studygroup:2')],
        [Markup.button.callback('БИ(ЭБ)1-ОЗ/Бп/КД26', 'studygroup:1')],
        [Markup.button.url('❓ Не знаю свою группу — написать', 'https://t.me/givenchytg')]
      ])
    );
    return;
  }
  // При открытии лички бот проверяет членство в назначенной группе.
  if (isPrivate(ctx) && !u.subscriptionForever && db.subscriptionGroupId) {
    try {
      const member = await ctx.telegram.getChatMember(db.subscriptionGroupId, ctx.from.id);
      if (member.status === 'creator' || member.status === 'administrator' || member.status === 'member' || (member.status === 'restricted' && member.is_member)) {
        u.subscriptionForever = true;
        u.paymentHistory.push({ method: 'group_lifetime', groupId: String(db.subscriptionGroupId), grantedAt: new Date().toISOString() });
        saveDb();
      }
    } catch (e) {
      console.error('[group subscription check]', e.message || e);
    }
  }

  const allowed = new Set(['start', 'help', 'admin', 'adminhelp', 'commands', 'subscribe', 'subscription', 'terms', 'paysupport', 'myid', 'grant', 'revoke', 'subinfo', 'stats', 'setgroup', 'app']);
  if (allowed.has(command)) return next();
  if (hasActiveSubscription(u)) return next();

  return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...subscriptionKeyboard() });
}

bot.use(subscriptionMiddleware);

const STUDY_GROUPS = Object.freeze({
  '1': 'БИ(ЭБ)1-ОЗ/Бп/КД26',
  '2': 'БИ(ЭБ)2-ОЗ/Бп/КД26'
});

bot.action(/^studygroup:(1|2)$/, async ctx => {
  const selected = STUDY_GROUPS[ctx.match[1]];
  const u = normalizeUser(user(ctx.from.id));
  u.group = selected;
  saveDb();
  await ctx.answerCbQuery('Группа сохранена');
  await ctx.editMessageText('✅ Твоя учебная группа сохранена: ' + selected + '\\nТеперь расписание и ДЗ будут подбираться именно для твоей группы.');
});

const managerMenu = Markup.keyboard([
  ['📅 Сегодня', '📅 Завтра'],
  ['🗓 Неделя', '👥 Моя группа'],
  ['📊 Создать опрос', '📚 Создать ДЗ'],
  ['👨‍🎓 Список студентов', '📋 Посещаемость'],
  ['👥 Группы'],
  ['💳 Подписка'],
  ['🔄 Обновить', 'ℹ️ Помощь']
]).resize();
const studentMenu = Markup.keyboard([
  ['📅 Расписание', '👥 Моя группа'],
  ['📚 ДЗ']
]).resize();

function user(id) {
  const key = String(id);
  db.users[key] ||= { group: '', role: 'student', createdAt: new Date().toISOString(), pendingPoll: null, pendingHomework: null, students: [], attendance: {} };
  return db.users[key];
}

function normalizeUser(u) {
  u.role ||= 'student';
  u.students ||= [];
  u.attendance ||= {};
  u.subscriptionUntil ||= 0;
  u.paymentHistory ||= [];
  u.createdAt ||= null;
  return u;
}

function isManagerRole(u) {
  return ['starosta', 'zam'].includes(u?.role);
}
function canManageAttendance(u, id) {
  return isOwner(id) || isManagerRole(u);
}
function getMenu(id) {
  return canManageAttendance(user(id), id) ? managerMenu : studentMenu;
}
function menuFor(ctx) {
  return isPrivate(ctx) ? getMenu(ctx.from.id) : studentMenu;
}
function roleLabel(role) {
  return role === 'starosta' ? '👑 Староста' : role === 'zam' ? '⭐ Заместитель старосты' : '👨‍🎓 Студент';
}

function studentName(s) {
  return typeof s === 'string' ? s : String(s?.name || 'Без имени') + (s?.username ? ' (@' + s.username + ')' : '');
}
function attendanceKey(s) { return typeof s === 'string' ? s : (s.telegramId || s.name); }
function parseStudentNames(raw){
 const out=[],seen=new Set();
 for(let line of String(raw||'').split(/\r?\n/)){
  line=line.replace(/\t+/g,' ').replace(/^\s*(?:№\s*)?\d+[.)]?[\s.)-]*/,'').replace(/^\s*[-•*]\s*/,'').trim();
  line=line.split(/\s{3,}/)[0].trim().replace(/\s+/g,' ').replace(/\s+\d+\s*$/,'').trim();
  const words=line.split(' ').filter(Boolean);
  if(line.length<5||words.length<2||words.length>5||!/^[a-zа-яё -]+$/i.test(line)||/^(список|группа|фамилия|имя|отчество|студенты|итого|всего)$/i.test(words[0]))continue;
  const name=words.map(w=>w[0].toLocaleUpperCase('ru-RU')+w.slice(1)).join(' '),key=name.toLocaleLowerCase('ru-RU');
  if(!seen.has(key)){seen.add(key);out.push(name);}
 }
 return out.slice(0,100);
}
function importPreviewKeyboard(){return Markup.inlineKeyboard([[Markup.button.callback('✅ Подтвердить','studentimport:confirm')],[Markup.button.callback('❌ Отменить','studentimport:cancel')]]);}

function attendanceDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date()); }
function attendanceLessonKey(lesson) {
 return [lesson.date||attendanceDate(),lesson.timeStart||lesson.time||'',lesson.timeEnd||'',lesson.subject||'Занятие'].join('|');
}
const scheduleCache = new Map();
const scheduleInFlight = new Map();
const SCHEDULE_CACHE_TTL = 3 * 60 * 1000;

async function getCachedSchedule(group, days = 7) {
 const cacheKey = String(group) + ':' + Number(days);
 const cached = scheduleCache.get(cacheKey);
 if (cached && cached.expiresAt > Date.now()) {
  console.log('[schedule cache] hit:', cacheKey);
  return cached.items;
 }
 if (scheduleInFlight.has(cacheKey)) {
  console.log('[schedule cache] waiting for in-flight request:', cacheKey);
  return scheduleInFlight.get(cacheKey);
 }
 const stale = cached && Array.isArray(cached.items) ? cached.items : null;
 const startedAt = Date.now();
 console.log('[schedule cache] loading:', cacheKey);
 const request = getSchedule(String(group), days).then(items => {
  const safeItems = Array.isArray(items) ? items : [];
  scheduleCache.set(cacheKey, { items: safeItems, expiresAt: Date.now() + SCHEDULE_CACHE_TTL });
  console.log('[schedule cache] loaded:', cacheKey, 'items:', safeItems.length, 'ms:', Date.now() - startedAt);
  return safeItems;
 }).catch(error => {
  console.error('[schedule cache] failed:', cacheKey, error?.message || error);
  if (stale) {
   console.warn('[schedule cache] serving expired cache after source failure:', cacheKey);
   return stale;
  }
  throw error;
 }).finally(() => scheduleInFlight.delete(cacheKey));
 scheduleInFlight.set(cacheKey, request);
 return request;
}

async function getTodayLessons(g) {
 if(!g?.scheduleGroup) throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
 const lessons=await getCachedSchedule(String(g.scheduleGroup),7);
 return (lessons||[]).filter(x=>x.date===attendanceDate()&&x.subject).sort((a,b)=>String(a.timeStart||'').localeCompare(String(b.timeStart||'')));
}
function managedGroup(userId) {
 const id=String(userId),u=normalizeUser(user(id));let g=Object.values(db.groups).find(x=>String(x.starostaId||'')===id||String(x.zamId||'')===id);
 if(!g&&isManagerRole(u))g=Object.values(db.groups).find(x=>x.title===u.group||x.scheduleGroup===u.group);if(!g)return null;
 g.students||=[];g.attendance||={};g.lessonAttendance||={};g.activeAttendanceLessons||={};g.announcements||=[];
 if(!g._attendanceMigrated){if(!g.students.length&&u.students?.length)g.students=JSON.parse(JSON.stringify(u.students));if(!Object.keys(g.attendance).length&&Object.keys(u.attendance||{}).length)g.attendance=JSON.parse(JSON.stringify(u.attendance));g._attendanceMigrated=true;saveDb();}
 return g;
}
function formatAttendance(g) {
 const students=g?.students||[],attendance=g?.attendance||{};
 if(!students.length)return '📋 <b>Посещаемость</b>\n\nСписок группы пуст. Добавь студентов командой /student.';
 const today=attendanceDate(),present=[],absent=[],unmarked=[];
 for(const student of students){
  const status=attendance[attendanceKey(student)]?.[today],name=escapeHtml(studentName(student));
  if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name);
 }
 return '📋 <b>Посещаемость за '+today+'</b>\n👥 <b>'+escapeHtml(g.title||'Группа')+'</b>\n\n'+'👨‍🎓 Всего: <b>'+students.length+'</b>\n\n'+'✅ <b>Были ('+present.length+')</b>\n'+(present.length?present.map((n,i)=>(i+1)+'. '+n).join('\n'):'—')+'\n\n'+'❌ <b>Не были ('+absent.length+')</b>\n'+(absent.length?absent.map((n,i)=>(i+1)+'. '+n).join('\n'):'—')+(unmarked.length?'\n\n▫️ <b>Не отмечены ('+unmarked.length+')</b>\n'+unmarked.map((n,i)=>(i+1)+'. '+n).join('\n'):'');
}
function attendanceLessonsKeyboard(lessons) {
 const rows=lessons.map((lesson,i)=>{
  const time=lesson.timeStart?(lesson.timeStart+(lesson.timeEnd?'–'+lesson.timeEnd:'')):'Время не указано';
  return [Markup.button.callback((i+1)+'. '+time+' — '+String(lesson.subject||'Пара').slice(0,35),'attlesson:'+i)];
 });
 return Markup.inlineKeyboard(rows);
}
function formatLessonAttendance(g,lesson) {
 const key=attendanceLessonKey(lesson),record=g.lessonAttendance?.[key]||{},students=g.students||[];
 const present=[],absent=[],unmarked=[];
 for(const student of students){
  const status=record[attendanceKey(student)],name=escapeHtml(studentName(student));
  if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name);
 }
 const time=lesson.timeStart?(lesson.timeStart+(lesson.timeEnd?'–'+lesson.timeEnd:'')):'Время не указано';
 return '📋 <b>Посещаемость пары</b>\n📅 '+lesson.date+' · '+time+'\n📚 <b>'+escapeHtml(lesson.subject||'Занятие')+'</b>'+
  (lesson.room?'\n🚪 Аудитория: '+escapeHtml(lesson.room):'')+
  '\n\n👨‍🎓 Всего: <b>'+students.length+'</b>\n\n✅ <b>Были ('+present.length+')</b>\n'+(present.length?present.map((n,i)=>(i+1)+'. '+n).join('\n'):'—')+
  '\n\n❌ <b>Не были ('+absent.length+')</b>\n'+(absent.length?absent.map((n,i)=>(i+1)+'. '+n).join('\n'):'—')+
  (unmarked.length?'\n\n▫️ <b>Не отмечены ('+unmarked.length+')</b>\n'+unmarked.map((n,i)=>(i+1)+'. '+n).join('\n'):'');
}
function attendancePairButtons(g,lesson,userId,page=0) {
 const students=g.students||[],size=10,pages=Math.max(1,Math.ceil(students.length/size));
 page=Math.max(0,Math.min(Number(page)||0,pages-1));
 const record=g.lessonAttendance?.[attendanceLessonKey(lesson)]||{};
 const rows=students.slice(page*size,(page+1)*size).map((student,offset)=>{
  const i=page*size+offset,status=record[attendanceKey(student)];
  return [Markup.button.callback((status==='present'?'✅ Был':'▫️ Был')+' '+(i+1),'attpairmark:'+i+':present'),Markup.button.callback((status==='absent'?'❌ Нет':'▫️ Нет')+' '+(i+1),'attpairmark:'+i+':absent')];
 });
 const nav=[];if(page>0)nav.push(Markup.button.callback('⬅️','attpairpage:'+(page-1)));
 nav.push(Markup.button.callback((page+1)+'/'+pages,'attpairpage:'+page));
 if(page<pages-1)nav.push(Markup.button.callback('➡️','attpairpage:'+(page+1)));
 rows.push(nav,[Markup.button.callback('↩️ К списку пар','attpairback')]);
 return Markup.inlineKeyboard(rows);
}

function createAttendanceHtml(g) {
 const attendance=g.attendance||{},lessonAttendance=g.lessonAttendance||{},students=g.students||[];
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const list=(title,items,icon)=>'<h3>'+title+' ('+items.length+')</h3>'+(items.length?'<ul>'+items.map(name=>'<li>'+icon+' '+esc(name)+'</li>').join('')+'</ul>':'<p>Нет записей</p>');
 const lessonEntries=Object.entries(lessonAttendance).map(([key,record])=>{
  const [date='',timeStart='',timeEnd='',subject='Занятие']=key.split('|');
  const present=[],absent=[],unmarked=[];
  for(const student of students){
   const name=studentName(student),status=record?.[attendanceKey(student)];
   if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name);
  }
  return {date,timeStart,timeEnd,subject,html:'<section><h2>'+esc(date)+'</h2><h3>📚 '+esc(subject)+'</h3><p>🕒 '+esc(timeStart||'Время не указано')+(timeEnd?'–'+esc(timeEnd):'')+'</p>'+list('Были',present,'✅')+list('Не были',absent,'❌')+list('Не отмечены',unmarked,'▫️')+'</section>'};
 }).sort((a,b)=>(a.date+' '+a.timeStart).localeCompare(b.date+' '+b.timeStart));
 let sections=lessonEntries.map(x=>x.html).join('');
 const legacyDates=[...new Set(Object.values(attendance).flatMap(v=>Object.keys(v||{})))].sort();
 if(legacyDates.length){
  sections+='<h2>Старые записи (без привязки к паре)</h2>'+legacyDates.map(date=>{
   const present=[],absent=[],unmarked=[];
   for(const student of students){
    const name=studentName(student),status=attendance[attendanceKey(student)]?.[date];
    if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name);
   }
   return '<section><h2>'+esc(date)+'</h2>'+list('Были',present,'✅')+list('Не были',absent,'❌')+list('Не отмечены',unmarked,'▫️')+'</section>';
  }).join('');
 }
 if(!sections)sections='<p>Пока нет сохранённых отметок по парам.</p>';
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Посещаемость — '+esc(g.title||'Группа')+'</title><style>body{font:16px/1.5 Arial,sans-serif;max-width:850px;margin:32px auto;padding:0 16px;color:#222}h1{font-size:26px}section{border-top:1px solid #ddd;padding:12px 0}h2{color:#245}h3{margin-bottom:4px}ul{margin-top:4px}@media print{body{margin:0;max-width:none}}</style></head><body><h1>Журнал посещаемости по парам</h1><p>Группа: <b>'+esc(g.title||'Без названия')+'</b></p><p>Сформировано: '+esc(new Date().toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</p>'+sections+'</body></html>';
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
    const lessonTime = x.timeStart && x.timeEnd ? x.timeStart + '–' + x.timeEnd : (x.time || '');
    let line = '• ' + (lessonTime ? lessonTime + ' — ' : '') + (x.subject || 'Занятие');
    if (x.teacher) line += '\n   👨‍🏫 ' + x.teacher;
    if (x.room) line += '\n   🚪 ' + x.room;
    out.push(line);
  }
  return out.join('\n').trim();
}

async function show(ctx, days, offset) {
  const u = user(ctx.from.id);
  const selectedGroup = String(u.group || '').trim();
  if (!Object.values(STUDY_GROUPS).includes(selectedGroup)) {
    return ctx.reply(
      'Выбери корректную учебную группу, чтобы загрузить расписание:',
      Markup.inlineKeyboard([
        [Markup.button.callback(STUDY_GROUPS['2'], 'studygroup:2')],
        [Markup.button.callback(STUDY_GROUPS['1'], 'studygroup:1')]
      ])
    );
  }
  await ctx.reply('⏳ Загружаю расписание для «' + selectedGroup + '»…');
  try {
    let items = await getSchedule(selectedGroup, days);
    if (offset) items = items.filter(x => Number(x.dayOffset) === offset);
    await ctx.reply(format(items, selectedGroup), menuFor(ctx));
  } catch (e) {
    console.error('[schedule]', e);
    await ctx.reply('❌ Не удалось получить расписание с сайта. Проверь источник или SCHEDULE_API_URL.', menuFor(ctx));
  }
}

function tallinnParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

let attendancePollCheckRunning = false;
async function checkAutomaticAttendancePolls() {
  if (attendancePollCheckRunning) return;
  attendancePollCheckRunning = true;
  try {
    const now = tallinnParts();
    const today = now.year + '-' + now.month + '-' + now.day;
    const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
    db.sentAttendancePolls ||= {};
    for (const g of Object.values(db.groups)) {
      const scheduleGroup = String(g.scheduleGroup || '').trim();
      if (!scheduleGroup) continue;
      try {
        const lessons = await getSchedule(scheduleGroup, 2);
        for (const lesson of lessons) {
          if (lesson.date !== today || !lesson.timeStart) continue;
          const match = String(lesson.timeStart).match(/^(\\d{1,2}):(\\d{2})$/);
          if (!match) continue;
          const startMinutes = Number(match[1]) * 60 + Number(match[2]);
          const key = [g.chatId, lesson.date, lesson.timeStart, lesson.subject].join('|');
          db.sentLessonNotices ||= {};
          if (currentMinutes >= startMinutes - 30 && currentMinutes <= startMinutes - 29 && !db.sentLessonNotices[key]) {
            await bot.telegram.sendMessage(g.chatId,
              '⏰ <b>Напоминание о занятии</b>\\n\\nЧерез 30 минут начинается: <b>' + escapeHtml(lesson.subject) +
              '</b>\\n🕒 Начало: ' + lesson.timeStart + (lesson.room ? '\\n🚪 Аудитория: ' + escapeHtml(lesson.room) : ''),
              { parse_mode: 'HTML' }
            );
            db.sentLessonNotices[key] = new Date().toISOString();
            saveDb();
          }
          if (currentMinutes < startMinutes - 10 || currentMinutes > startMinutes - 9) continue;
          if (db.sentAttendancePolls[key]) continue;
          const sent = await bot.telegram.sendPoll(
            g.chatId,
            '📋 Посещаемость: ' + lesson.subject + '\\nПара начинается в ' + lesson.timeStart + '. Ты будешь присутствовать?',
            ['✅ Буду', '❌ Не буду'],
            { is_anonymous: false, allows_multiple_answers: false }
          );
          db.sentAttendancePolls[key] = {
            pollId: sent.poll.id, groupId: String(g.chatId), groupName: g.title,
            scheduleGroup, date: lesson.date, time: lesson.timeStart,
            subject: lesson.subject, lessonKey: attendanceLessonKey(lesson), sentAt: new Date().toISOString()
          };
          saveDb();
          console.log('[attendance poll] Sent to ' + g.title + ' for ' + lesson.subject + ' at ' + lesson.timeStart);
        }
      } catch (e) {
        console.error('[attendance poll] ' + g.title + ':', e.message || e);
      }
    }
  } finally {
    attendancePollCheckRunning = false;
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
 const id=String(ctx.chat.id),old=db.groups[id]||{};db.groups[id]={...old,chatId:ctx.chat.id,title:ctx.chat.title||old.title||'Группа без названия',addedBy:old.addedBy||ctx.from.id,addedAt:old.addedAt||new Date().toISOString(),students:old.students||[],attendance:old.attendance||{}};saveDb();
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

function attendanceButtons(g,page=0){
 const students=g.students||[],size=10,pages=Math.max(1,Math.ceil(students.length/size));page=Math.max(0,Math.min(Number(page)||0,pages-1));const today=attendanceDate();
 const rows=students.slice(page*size,(page+1)*size).map((student,offset)=>{const i=page*size+offset,status=g.attendance?.[attendanceKey(student)]?.[today];return [Markup.button.callback((status==='present'?'✅ Был':'▫️ Был')+' '+(i+1),'attmark:'+i+':present'),Markup.button.callback((status==='absent'?'❌ Нет':'▫️ Нет')+' '+(i+1),'attmark:'+i+':absent')];});
 const nav=[];if(page>0)nav.push(Markup.button.callback('⬅️','attpage:'+(page-1)));nav.push(Markup.button.callback((page+1)+'/'+pages,'attsummary'));if(page<pages-1)nav.push(Markup.button.callback('➡️','attpage:'+(page+1)));rows.push(nav);return Markup.inlineKeyboard(rows);
}
function attendanceStatusButtons(index) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Был', 'attmark:' + index + ':present'), Markup.button.callback('❌ Не был', 'attmark:' + index + ':absent')],
    [Markup.button.callback('↩️ Снять отметку', 'attmark:' + index + ':clear')],
    [Markup.button.callback('⬅️ К списку', 'attback')]
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
  if (!canManageAttendance(user(ctx.from.id), ctx.from.id)) return ctx.reply('❌ Создавать и отправлять ДЗ может староста или заместитель.');
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
  if (!canManageAttendance(user(ctx.from.id), ctx.from.id)) return ctx.reply('❌ Создавать опросы может староста или заместитель.');
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
  if (isOwner(ctx.from.id)) return ctx.reply('👑 У тебя бесплатный доступ владельца. Оплата не требуется.', menuFor(ctx));
  const u = normalizeUser(user(ctx.from.id));
  if (hasActiveSubscription(u)) return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...menuFor(ctx) });

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
  return ctx.reply(subscriptionText(u, isOwner(ctx.from.id)), { parse_mode: 'HTML', ...menuFor(ctx) });
});

// Управление подписками доступно только владельцу и только в личном чате с ботом.
bot.command('myid', ctx => {
  return ctx.reply('Твой Telegram ID: <code>' + ctx.from.id + '</code>', { parse_mode: 'HTML' });
});

bot.command('grant', async ctx => {
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Эта команда доступна только владельцу бота.');
  if (!isPrivate(ctx)) return ctx.reply('Используй команду в личных сообщениях с ботом.');
  const args = ctx.message.text.replace(/^\/grant(?:@\S+)?/i, '').trim().split(/\s+/).filter(Boolean);
  const targetId = args[0];
  const forever = ['forever', 'lifetime', 'навсегда', 'пожизненно'].includes((args[1] || '').toLowerCase());
  const days = args[1] === undefined ? SUBSCRIPTION_DAYS : Number(args[1]);
  if (!targetId || !/^\d+$/.test(targetId) || (!forever && (!Number.isSafeInteger(days) || days < 1 || days > 3650))) {
    return ctx.reply('Формат: /grant TELEGRAM_ID [дней|навсегда]\\nПримеры: /grant 123456789 30 или /grant 123456789 навсегда\\nID пользователь узнаёт командой /myid.');
  }
  if (isOwner(targetId)) return ctx.reply('У владельца уже есть бесплатный доступ.');
  const target = normalizeUser(user(targetId));
  if (forever) target.subscriptionForever = true;
  else {
    const start = Math.max(Date.now(), subscriptionUntil(target));
    target.subscriptionUntil = start + days * 24 * 60 * 60 * 1000;
  }
  target.paymentHistory.push({
    method: 'owner_grant',
    days: forever ? null : days,
    lifetime: forever,
    grantedBy: String(ctx.from.id),
    grantedAt: new Date().toISOString(),
    subscriptionUntil: forever ? null : new Date(target.subscriptionUntil).toISOString()
  });
  saveDb();
  const until = forever ? '' : new Date(target.subscriptionUntil).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' });
  await ctx.reply(forever
    ? '♾ Пожизненная подписка выдана пользователю <code>' + targetId + '</code>.'
    : '✅ Подписка выдана пользователю <code>' + targetId + '</code> на ' + days + ' дн.\\nДействует до: <b>' + until + ' МСК</b>.', { parse_mode: 'HTML' });
  try {
    await ctx.telegram.sendMessage(Number(targetId), forever ? '🎉 Тебе выдана пожизненная подписка!' : '🎉 Тебе выдана подписка на ' + days + ' дн.\\nДействует до: ' + until + ' МСК.');
  } catch {
    await ctx.reply('ℹ️ Не удалось отправить уведомление. Пользователь должен сначала открыть бота и нажать /start.');
  }
});

bot.command('revoke', async ctx => {
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Эта команда доступна только владельцу бота.');
  if (!isPrivate(ctx)) return ctx.reply('Используй команду в личных сообщениях с ботом.');
  const targetId = ctx.message.text.replace(/^\/revoke(?:@\S+)?/i, '').trim();
  if (!/^\d+$/.test(targetId)) return ctx.reply('Формат: /revoke TELEGRAM_ID');
  if (isOwner(targetId)) return ctx.reply('Бесплатный доступ владельца нельзя отозвать.');
  const target = normalizeUser(user(targetId));
  target.subscriptionUntil = 0;
  target.subscriptionForever = false;
  target.paymentHistory.push({
    method: 'owner_revoke',
    revokedBy: String(ctx.from.id),
    revokedAt: new Date().toISOString()
  });
  saveDb();
  await ctx.reply('🗑 Подписка пользователя <code>' + targetId + '</code> отозвана.', { parse_mode: 'HTML' });
  try {
    await ctx.telegram.sendMessage(Number(targetId), 'ℹ️ Твоя подписка была отключена владельцем бота.');
  } catch {}
});

bot.command('subinfo', ctx => {
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Эта команда доступна только владельцу бота.');
  if (!isPrivate(ctx)) return ctx.reply('Используй команду в личных сообщениях с ботом.');
  const targetId = ctx.message.text.replace(/^\/subinfo(?:@\S+)?/i, '').trim();
  if (!/^\d+$/.test(targetId)) return ctx.reply('Формат: /subinfo TELEGRAM_ID');
  if (isOwner(targetId)) return ctx.reply('👑 Это владелец: бесплатный доступ без срока.');
  const target = normalizeUser(user(targetId));
  const active = hasActiveSubscription(target);
  const until = target.subscriptionForever ? 'бессрочно' : active ? new Date(subscriptionUntil(target)).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }) + ' МСК' : 'не активна';
  return ctx.reply('Пользователь: <code>' + targetId + '</code>\\nПодписка: <b>' + (active ? 'активна' : 'не активна') + '</b>\\nДействует до: ' + until, { parse_mode: 'HTML' });
});

// Личная статистика доступна только владельцу в личном чате.
bot.command('stats', ctx => {
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Статистика доступна только владельцу бота.');
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом и отправь /stats.');

  const entries = Object.entries(db.users);
  const now = Date.now();
  const active = entries.filter(([id, u]) => !isOwner(id) && (Boolean(u.subscriptionForever) || subscriptionUntil(u) > now)).length;
  const lifetime = entries.filter(([id, u]) => !isOwner(id) && Boolean(u.subscriptionForever)).length;
  const expired = entries.filter(([id, u]) => !isOwner(id) && !u.subscriptionForever && subscriptionUntil(u) > 0 && subscriptionUntil(u) <= now).length;
  const noSubscription = entries.filter(([id, u]) => !isOwner(id) && !u.subscriptionForever && subscriptionUntil(u) <= 0).length;
  const starostas = entries.filter(([, u]) => u.role === 'starosta').length;
  const students = entries.filter(([, u]) => (u.role || 'student') === 'student').length;
  const newUsers30d = entries.filter(([, u]) => u.createdAt && (now - Date.parse(u.createdAt)) <= 30 * 24 * 60 * 60 * 1000).length;
  const history = entries.flatMap(([, u]) => Array.isArray(u.paymentHistory) ? u.paymentHistory : []);
  const starsPayments = history.filter(p => p.method === 'stars');
  const manualGrants = history.filter(p => p.method === 'owner_grant').length;
  const starsTotal = starsPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return ctx.reply(
    '📊 <b>Статистика Староста Бота</b>\n\n' +
    '👥 Всего пользователей: <b>' + entries.length + '</b>\n' +
    '🆕 Новых за 30 дней: <b>' + newUsers30d + '</b>\n' +
    '📌 Активных подписок: <b>' + active + '</b>\n' +
    '♾ Пожизненных подписок: <b>' + lifetime + '</b>\n' +
    '⌛ Истекших подписок: <b>' + expired + '</b>\n' +
    '🔓 Без подписки: <b>' + noSubscription + '</b>\n\n' +
    '👑 Старост: <b>' + starostas + '</b>\n' +
    '🎓 Студентов: <b>' + students + '</b>\n' +
    '🏫 Прикреплённых групп: <b>' + Object.keys(db.groups).length + '</b>\n\n' +
    '💳 Оплаты Telegram Stars: <b>' + starsPayments.length + '</b> (' + starsTotal + ' ⭐)\n' +
    '🎁 Выдано вручную подписок: <b>' + manualGrants + '</b>\n\n' +
    '<i>Учитываются оплаты Telegram Stars, записанные в истории пользователя. Старые оплаты до включения истории могут отсутствовать.</i>',
    { parse_mode: 'HTML' }
  );
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

bot.on('poll_answer', async ctx => {
  const answer = ctx.update.poll_answer;
  if (!answer?.poll_id) return;
  db.sentAttendancePolls ||= {};
  const record = Object.values(db.sentAttendancePolls).find(x => String(x.pollId) === String(answer.poll_id));
  if (!record) return;
  const userId = String(answer.user?.id || '');
  if (!userId) return;
  const option = Number(answer.option_ids?.[0]);
  record.responses ||= {};
  record.responses[userId] = {
    userId, username: answer.user?.username || '',
    firstName: answer.user?.first_name || '',
    status: option === 0 ? 'present' : option === 1 ? 'absent' : 'unknown',
    answeredAt: new Date().toISOString()
  };
  const group = db.groups[String(record.groupId)];
  const student = group?.students?.find(x => String(typeof x === 'object' ? x.telegramId : '') === userId);
  if (student && record.lessonKey) {
    group.lessonAttendance ||= {};
    group.lessonAttendance[record.lessonKey] ||= {};
    group.lessonAttendance[record.lessonKey][attendanceKey(student)] =
      option === 0 ? 'present' : option === 1 ? 'absent' : 'unmarked';
  }
  saveDb();
  console.log('[attendance poll] Answer recorded for ' + userId + ' in ' + record.groupName);
});

bot.command('pollreport', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Отчёт доступен в личных сообщениях.');
  const g = managedGroup(ctx.from.id);
  if (!g) return ctx.reply('❌ Команда доступна старосте или заместителю прикреплённой группы.');
  const records = Object.values(db.sentAttendancePolls || {})
    .filter(x => String(x.groupId) === String(g.chatId))
    .sort((a,b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  const latest = records[0];
  if (!latest) return ctx.reply('Пока нет автоматических опросов посещаемости для «' + g.title + '».');
  const answers = Object.values(latest.responses || {});
  const yes = answers.filter(x => x.status === 'present');
  const no = answers.filter(x => x.status === 'absent');
  const names = answers.map(x => (x.firstName || 'Студент') + (x.username ? ' (@' + x.username + ')' : '') + (x.status === 'present' ? ' — ✅ Будет' : x.status === 'absent' ? ' — ❌ Не будет' : ''));
  return ctx.reply(
    '📊 <b>Ответы на последний опрос</b>\\n👥 ' + escapeHtml(g.title) +
    '\\n📚 ' + escapeHtml(latest.subject) + '\\n📅 ' + latest.date + ' в ' + latest.time +
    '\\n\\n✅ Будут: <b>' + yes.length + '</b>\\n❌ Не будут: <b>' + no.length +
    '</b>\\n▫️ Не ответили: <b>' + Math.max(0, (g.students || []).length - answers.length) +
    '</b>\\n\\n' + (names.length ? names.map(escapeHtml).join('\\n') : 'Ответов пока нет.'),
    { parse_mode: 'HTML' }
  );
});

bot.on('callback_query', async (ctx, next) => {
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
  u.paymentHistory.push({
    method: 'stars',
    amount: Number(payment.total_amount || 0),
    currency: payment.currency || 'XTR',
    paidAt: new Date().toISOString(),
    chargeId: payment.telegram_payment_charge_id || ''
  });
  saveDb();

  await ctx.reply(
    '🎉 <b>Подписка активирована!</b>\\n\\n' +
    'Доступ действует до: <b>' +
    new Date(u.subscriptionUntil).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }) +
    ' МСК</b>.\\n\\n' +
    'Теперь можешь пользоваться ботом.',
    { parse_mode: 'HTML', ...menuFor(ctx) }
  );
});

bot.start(async ctx => {
  const u = normalizeUser(user(ctx.from.id));
  saveDb();
  if (isPrivate(ctx) && !u.fullName) {
    u.pendingFullName = true;
    saveDb();
    return ctx.reply(
      '👋 Добро пожаловать! Напиши, пожалуйста, свои фамилию и имя (при наличии — отчество) одним сообщением. Это нужно для списка студентов.'
    );
  }
  await ctx.reply(
    '👋 Привет! Я бот расписания.\n\n' +
    'Твоё ФИО: ' + escapeHtml(u.fullName || 'не указано') + '\n' +
    'Учебную группу можно выбрать в общей группе или указать командой /group НАЗВАНИЕ.\n\n' +
    '📊 Опросы создаются в личке: /poll Вопрос | Да | Нет',
    { parse_mode: 'HTML', ...menuFor(ctx) }
  );
});

bot.help(ctx => ctx.reply(
  '📚 <b>Команды Староста Бота</b>\\n\\n' +
  '📅 <b>Расписание</b>\\n' +
  '/group НАЗВАНИЕ — сохранить учебную группу\\n' +
  '/schedule — сегодня\\n/tomorrow — завтра\\n/week — неделя\\n\\n' +
  '👨‍🎓 <b>Студенты и посещаемость</b>\\n' +
  '/role — посмотреть роль\\n/students — список студентов\\n/student ИМЯ — добавить вручную\\n' +
  '/delstudent НОМЕР — удалить из списка\\n/attendance — журнал (староста)\\n' +
  '/mark НОМЕР present|absent — отметить вручную\\n\\n' +
  '📢 <b>Для группы</b>\\n' +
  '/poll Вопрос | Вариант 1 | Вариант 2 — создать опрос\\n' +
  '/hw Предмет | Задание — отправить домашнее задание\\n' +
  '/groups — прикреплённые группы\\n' +
  '/myid — узнать свой Telegram ID\\n' +
  (isOwner(ctx.from.id) ? '\\n👑 <b>Панель владельца</b>\\n/admin — все команды владельца\\n/stats — статистика\\n/grant ID [дней|навсегда] — выдать подписку\\n/revoke ID — отозвать подписку\\n/subinfo ID — проверить подписку\\n/setsubgroup — назначить группу с пожизненным доступом (в группе)\\n/attach и /detach — прикрепить/открепить группу (в группе)\\n' : '') +
  '\\n💳 /subscription — статус подписки\\n/subscribe — оформить подписку',
  { parse_mode: 'HTML', ...menuFor(ctx) }
));

bot.command(['admin', 'adminhelp', 'commands'], ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личные сообщения с ботом и отправь /admin.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Панель доступна только владельцу бота.');

  const message =
    '👑 <b>ПАНЕЛЬ УПРАВЛЕНИЯ</b>\n' +
    '<i>Староста Бот · команды владельца</i>\n\n' +
    '📈 <b>СТАТИСТИКА</b>\n' +
    '/stats — пользователи, подписки, роли, группы и оплаты\n\n' +
    '💳 <b>ПОДПИСКИ</b>\n' +
    '<code>/grant ID</code> — выдать 30 дней\n' +
    '<code>/grant ID 90</code> — выдать 90 дней\n' +
    '<code>/grant ID навсегда</code> — выдать бессрочно\n' +
    '<code>/revoke ID</code> — отозвать доступ\n' +
    '<code>/subinfo ID</code> — проверить подписку\n' +
    '/subscription — проверить свой статус\n\n' +
    '👥 <b>УЧЕБНЫЕ ГРУППЫ</b>\n' +
    '/groups — список прикреплённых групп\n' +
    '/attach — подключить группу <i>(выполнить в группе)</i>\n' +
    '/detach — отключить группу <i>(выполнить в группе)</i>\n' +
    '/setsubgroup — группа с пожизненным доступом <i>(в группе)</i>\n\n' +
    '🎓 <b>СТУДЕНТЫ И ПОСЕЩАЕМОСТЬ</b>\n' +
    '/students — список студентов\n' +
    '/student ИМЯ — добавить студента вручную\n' +
    '/delstudent НОМЕР — удалить студента\n' +
    '/attendance — открыть журнал посещаемости\n/attendanceweb — получить журнал посещаемости HTML-файлом\n' +
    '/mark НОМЕР present|absent — отметить посещаемость\n' +
    '/starosta — назначить себя старостой <i>(в группе, владелец или администратор)</i>\n' +
    '/setstarosta — назначить старосту <i>(ответом на сообщение)</i>\n' +
    '/setstudent — вернуть роль студента <i>(ответом на сообщение)</i>\n\n' +
    '📨 <b>РАБОТА С ГРУППОЙ</b>\n' +
    '/group НАЗВАНИЕ — сохранить свою учебную группу\n' +
    '/poll Вопрос | Вариант 1 | Вариант 2 — создать опрос\n' +
    '/hw Предмет | Текст задания — отправить ДЗ\n' +
    '/schedule · /tomorrow · /week — расписание\n\n' +
    '🛠 <b>ПОЛЕЗНОЕ</b>\n' +
    '/myid — узнать свой Telegram ID\n' +
    '/help — общая справка\n\n' +
    '<i>ID — это числовой Telegram ID пользователя. Команды с пометкой «в группе» нужно отправлять непосредственно в нужной группе.</i>';

  return ctx.reply(message, { parse_mode: 'HTML', ...menuFor(ctx) });
});

bot.command('group', async ctx => {
  const value = ctx.message.text.replace(/^\/group(?:@\S+)?/i, '').trim();
  const selected = value === STUDY_GROUPS['1'] || value === '1'
    ? STUDY_GROUPS['1']
    : value === STUDY_GROUPS['2'] || value === '2'
      ? STUDY_GROUPS['2']
      : '';
  if (!selected) {
    return ctx.reply(
      'Укажи одну из двух учебных групп кнопкой ниже или командой /group 1 либо /group 2:',
      Markup.inlineKeyboard([
        [Markup.button.callback(STUDY_GROUPS['2'], 'studygroup:2')],
        [Markup.button.callback(STUDY_GROUPS['1'], 'studygroup:1')]
      ])
    );
  }
  user(ctx.from.id).group = selected;
  saveDb();
  await ctx.reply('✅ Группа сохранена: «' + selected + '»', menuFor(ctx));
});

bot.command('setsubgroup', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Команду нужно выполнить внутри нужной группы.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Только владелец бота может назначить группу с пожизненным доступом.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Ты должен быть администратором этой группы.');
  db.subscriptionGroupId = ctx.chat.id;
  db.subscriptionGroupTitle = ctx.chat.title || 'Группа';
  registerGroup(ctx);
  saveDb();
  return ctx.reply('♾ Эта группа назначена группой с пожизненным доступом. Участники получат его, когда напишут в группе или откроют личку с ботом.');
});

bot.command('setgroup', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Команду нужно выполнить в учебной группе Telegram.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Указать учебную группу может только администратор чата.');
  const scheduleGroup = (ctx.message.text || '').trim().split(' ').filter(Boolean).slice(1).join(' ');
  if (!scheduleGroup) return ctx.reply('Формат: /setgroup ИСП-21\\nУкажи точное название группы из расписания.');
  registerGroup(ctx);
  db.groups[String(ctx.chat.id)].scheduleGroup = scheduleGroup;
  saveDb();
  return ctx.reply('✅ Для этого чата установлена учебная группа «' + scheduleGroup + '». Напоминание приходит за 30 минут, опрос посещаемости — за 10 минут до пары.');
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

bot.command('importstudents',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('Используй команду в личке.');
 if(!managedGroup(ctx.from.id))return ctx.reply('Команда доступна старосте или заместителю группы.');
 const u=normalizeUser(user(ctx.from.id));u.pendingStudentImport=true;delete u.pendingStudentImportReview;saveDb();
 return ctx.reply('Вставь список студентов текстом — по одному ФИО на строку. Я покажу результат для проверки. Для отмены: /cancel.');
});
// Импорт списка студентов обычным текстом в личных сообщениях.
bot.command('cancel', async ctx => {
 if(!isPrivate(ctx))return;
 const u=normalizeUser(user(ctx.from.id));
 if(!u.pendingStudentImport&&!u.pendingStudentImportReview)return ctx.reply('Нет активного действия для отмены.');
 delete u.pendingStudentImport;delete u.pendingStudentImportReview;saveDb();
 return ctx.reply('❌ Импорт списка отменён.');
});
bot.action('studentimport:confirm', async ctx => {
 try {
  if(!isPrivate(ctx)){await ctx.answerCbQuery('Открой бота в личке.');return;}
  const u=normalizeUser(user(ctx.from.id));
  const list=u.pendingStudentImportReview;
  if(!Array.isArray(list)||!list.length){await ctx.answerCbQuery('Список не найден. Начни импорт заново: /importstudents');return;}
  const g=managedGroup(ctx.from.id);
  if(!g){await ctx.answerCbQuery('Группа не найдена.');return;}
  g.students=list.slice(0,100);
  g.attendance||={};
  u.students=JSON.parse(JSON.stringify(g.students));
  delete u.pendingStudentImport;
  delete u.pendingStudentImportReview;
  saveDb();
  await ctx.answerCbQuery('Список сохранён!');
  const result='✅ <b>Список студентов создан!</b>\\n\\n👥 Группа: <b>'+escapeHtml(g.title)+'</b>\\n👨‍🎓 Студентов: <b>'+g.students.length+'</b>\\n\\nОткрыть список: /students\\nПосещаемость: /attendance';
  try { await ctx.editMessageText(result,{parse_mode:'HTML'}); }
  catch(e) { console.error('[student import confirm edit]',e.message||e); await ctx.reply(result,{parse_mode:'HTML'}); }
 } catch(e) {
  console.error('[student import confirm]',e);
  try { await ctx.answerCbQuery('Не удалось сохранить список. Попробуй ещё раз.'); } catch {}
  try { await ctx.reply('❌ Ошибка при сохранении списка. Отправь /importstudents и повтори импорт.'); } catch {}
 }
});
bot.action('studentimport:cancel', async ctx => {
 if(!isPrivate(ctx))return ctx.answerCbQuery();
 const u=normalizeUser(user(ctx.from.id));delete u.pendingStudentImport;delete u.pendingStudentImportReview;saveDb();
 await ctx.answerCbQuery('Импорт отменён');
 return ctx.editMessageText('❌ Импорт списка отменён.');
});
bot.on('text', async (ctx,next) => {
 if(!isPrivate(ctx))return next();
 const u=normalizeUser(user(ctx.from.id));
 const raw=String(ctx.message.text||'').trim();
 if(u.pendingStudentField){
  const pending=u.pendingStudentField;
  const g=managedGroup(ctx.from.id);
  if(!g||!g.students[pending.index]){delete u.pendingStudentField;saveDb();return ctx.reply('❌ Студент не найден. Открой /students и попробуй снова.');}
  if(raw.toLowerCase()==='/cancel'){delete u.pendingStudentField;saveDb();return ctx.reply('Изменение отменено.');}
  const student=g.students[pending.index];
  const rec=typeof student==='string'?{name:student}:student;
  if(pending.type==='username'){
   const value=raw==='-'?'':raw.replace(/^@/,'').trim();
   if(value&&!/^[A-Za-z0-9_]{5,32}$/.test(value))return ctx.reply('❌ Неверный username. Введи @username или /cancel.');
   rec.username=value;
  } else {
    const value=raw==='-'?'':raw.replace(/[^0-9+]/g,'');
    if(value&&!/^\+[1-9][0-9]{5,14}$/.test(value))return ctx.reply('❌ Неверный номер. Укажи международный формат с плюсом, например +79181651870 или +37255555555. Для отмены: /cancel.');
   rec.phone=value;
  }
  g.students[pending.index]=rec;delete u.pendingStudentField;saveDb();
  return ctx.reply('✅ Данные сохранены. Открой /students, чтобы увидеть обновлённую карточку.');
 }
 if(!u.pendingStudentImport)return next();
 if(!raw)return ctx.reply('Пришли ФИО текстом, по одному студенту на строку.');
 if(raw.toLowerCase()==='/cancel'||raw.toLowerCase().startsWith('/cancel@')){delete u.pendingStudentImport;delete u.pendingStudentImportReview;saveDb();return ctx.reply('❌ Импорт отменён.');}
 if(raw.startsWith('/'))return ctx.reply('Сначала пришли список ФИО или отправь /cancel для отмены.');
 const g=managedGroup(ctx.from.id);
 if(!g){delete u.pendingStudentImport;saveDb();return ctx.reply('❌ Не найдена группа, где ты староста или заместитель.');}
 const names=parseStudentNames(raw);
 if(!names.length)return ctx.reply('Не удалось распознать ФИО. Отправь по одному имени на строку, например:\\nИванов Иван Иванович\\nПетров Пётр Сергеевич');
 u.pendingStudentImportReview=names;u.pendingStudentImport=false;saveDb();
 const preview=names.map(name=>escapeHtml(name)).join('\\n');
 return ctx.reply('📝 <b>Проверь список студентов</b>\\n👥 Группа: <b>'+escapeHtml(g.title)+'</b>\\n👨‍🎓 Найдено: <b>'+names.length+'</b>\\n\\n'+preview+'\\n\\nПосле подтверждения текущий список группы будет заменён этим списком.',{parse_mode:'HTML',...importPreviewKeyboard()});
});

function studentListKeyboard(g,page=0){
 const size=10,pages=Math.max(1,Math.ceil((g.students||[]).length/size));
 page=Math.max(0,Math.min(Number(page)||0,pages-1));
 const rows=(g.students||[]).slice(page*size,(page+1)*size).map((s,offset)=>{
  const i=page*size+offset;
  const name=typeof s==='string'?s:String(s?.name||'Без имени');
  return [Markup.button.callback('👤 '+(i+1)+'. '+name.slice(0,42),'studentcard:'+i)];
 });
 const nav=[];
 if(page>0)nav.push(Markup.button.callback('⬅️','studentpage:'+(page-1)));
 nav.push(Markup.button.callback((page+1)+'/'+pages,'studentpage:'+page));
 if(page<pages-1)nav.push(Markup.button.callback('➡️','studentpage:'+(page+1)));
 rows.push(nav);
 return Markup.inlineKeyboard(rows);
}
function studentCardText(g,i){
 const s=g.students[i],name=typeof s==='string'?s:String(s?.name||'Без имени');
 const username=typeof s==='object'&&s?.username?'@'+String(s.username).replace(/^@/,''):'не указан';
 const phone=typeof s==='object'&&s?.phone?String(s.phone):'не указан';
 const id=typeof s==='object'&&s?.telegramId?String(s.telegramId):'не указан';
 return '👤 <b>'+escapeHtml(name)+'</b>\\n\\n🔹 Username: '+escapeHtml(username)+'\\n📞 Телефон: <code>'+escapeHtml(phone)+'</code>\\n🆔 Telegram ID: <code>'+escapeHtml(id)+'</code>';
}
function studentCardKeyboard(i){
 return Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Изменить username','studentedit:username:'+i)],
  [Markup.button.callback('📞 Изменить телефон','studentedit:phone:'+i)],
  [Markup.button.callback('⬅️ К списку','studentback')]
 ]);
}
function formatStudentList(g) {
 return '👥 <b>'+escapeHtml(g.title)+'</b>\\n👨‍🎓 Всего студентов: <b>'+(g.students||[]).length+'</b>\\n\\nНажми на студента, чтобы открыть карточку и изменить контакты.';
}
bot.command('students',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('📩 Список студентов доступен в личных сообщениях.');
 const g=managedGroup(ctx.from.id);
 if(!g)return ctx.reply('❌ Не найдена группа, где ты староста или заместитель.');
 if(!g.students.length)return ctx.reply('📋 Список группы пока пуст. Добавь студента командой /student или загрузи список через /importstudents.');
 return ctx.reply(formatStudentList(g),{parse_mode:'HTML',...studentListKeyboard(g)});
});
bot.command('student',async ctx=>{
 const target=ctx.message.reply_to_message?.from,name=target?[target.first_name,target.last_name].filter(Boolean).join(' '):ctx.message.text.replace(/^\/student(?:@\S+)?/i,'').trim();
 if(target&&['group','supergroup'].includes(ctx.chat.type)){const g=db.groups[String(ctx.chat.id)];if(!g)return ctx.reply('Сначала администратор должен выполнить /attach.');
 if(String(g.starostaId||'')!==String(ctx.from.id)&&String(g.zamId||'')!==String(ctx.from.id)&&!(await isGroupAdmin(ctx))&&!isOwner(ctx.from.id))return ctx.reply('❌ Добавлять студентов может староста или администратор.');
 g.students||=[];g.attendance||={};const rec={name:name||('ID '+target.id),telegramId:String(target.id),username:target.username||''};const i=g.students.findIndex(x=>String(typeof x==='object'?x.telegramId:'')===rec.telegramId);
 if(i>=0)g.students[i]=rec;else if(g.students.length<100)g.students.push(rec);else return ctx.reply('❌ Максимум 100 студентов.');saveDb();return ctx.reply('✅ Добавлен в список «'+g.title+'»: '+studentName(rec));}
 if(!isPrivate(ctx))return ctx.reply('Ответь в группе на сообщение студента командой /student.');const g=managedGroup(ctx.from.id);if(!g)return ctx.reply('❌ Сначала назначь старосту в прикреплённой группе.');
 if(!name)return ctx.reply('Формат: /student Имя Фамилия');if(g.students.some(x=>studentName(x).toLowerCase()===name.toLowerCase()))return ctx.reply('ℹ️ Такой студент уже есть.');
 if(g.students.length>=100)return ctx.reply('❌ Максимум 100 студентов.');g.students.push(name);saveDb();return ctx.reply('✅ Добавлен в список «'+g.title+'»: '+name);
});
bot.command('delstudent',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('📩 Удаление доступно в личных сообщениях.');const n=Number(ctx.message.text.replace(/^\/delstudent(?:@\S+)?/i,'').trim())-1,g=managedGroup(ctx.from.id);
 if(!g)return ctx.reply('❌ Не найдена твоя прикреплённая группа.');if(!Number.isInteger(n)||n<0||n>=g.students.length)return ctx.reply('Формат: /delstudent номер из списка /students');
 const removed=g.students.splice(n,1)[0];saveDb();return ctx.reply('🗑 Удалён: '+studentName(removed));
});
bot.hears('👨‍🎓 Список студентов', ctx => ctx.reply('Используй /students. Добавить с username: ответь в группе на сообщение студента командой /student.'));

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
  await ctx.reply('✅ Роль установлена: 👨‍🎓 Студент', menuFor(ctx));
}

bot.command('role', showRole);
bot.command('roles', showRole);


bot.command('starosta', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('❌ Команду /starosta нужно выполнить в учебной группе.');
  }
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) {
    return ctx.reply('❌ Назначить себя старостой может владелец бота или администратор этой группы.');
  }
  const u = normalizeUser(user(ctx.from.id));
  u.role = 'starosta';
  u.username = ctx.from.username || u.username || '';
  u.group = ctx.chat.title || u.group;
  registerGroup(ctx);
  db.groups[String(ctx.chat.id)].starostaId = ctx.from.id;
  saveDb();
  return ctx.reply('👑 ' + (ctx.from.first_name || 'Пользователь') + ' назначил(а) себя старостой этой группы. Теперь доступны команды посещаемости.', studentMenu);
});

bot.command('zam', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('❌ Команду /zam нужно выполнить в учебной группе.');
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) return ctx.reply('❌ Назначить заместителя может владелец бота или администратор группы.');
  const target = ctx.message.reply_to_message?.from || ctx.from;
  const u = normalizeUser(user(target.id));
  u.role = 'zam';
  u.username = target.username || u.username || '';
  u.group = ctx.chat.title || u.group;
  registerGroup(ctx);
  db.groups[String(ctx.chat.id)].zamId = target.id;
  const starostaId = db.groups[String(ctx.chat.id)].starostaId;
  if (starostaId && String(starostaId) !== String(target.id)) {
    const starostaUser = normalizeUser(user(starostaId));
    const group = db.groups[String(ctx.chat.id)];
    if (!group.students.length) group.students = JSON.parse(JSON.stringify(starostaUser.students || []));
    if (!Object.keys(group.attendance || {}).length) group.attendance = JSON.parse(JSON.stringify(starostaUser.attendance || {}));
  }
  saveDb();
  return ctx.reply('⭐ ' + (target.first_name || 'Пользователь') + ' назначен(а) заместителем старосты. Доступны функции старосты.', studentMenu);
});

bot.command('setstarosta', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Эту команду нужно выполнить в группе.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Назначать старосту может только администратор группы.');
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply('Ответь командой /setstarosta на сообщение нужного человека.');
  const u = normalizeUser(user(target.id));
  u.role = 'starosta';
  u.username = target.username || u.username || '';
  u.group = ctx.chat.title || u.group;
  registerGroup(ctx);
  db.groups[String(ctx.chat.id)].starostaId = target.id;
  saveDb();
  await ctx.reply('👑 ' + (target.first_name || 'Пользователь') + ' назначен старостой.');
});

bot.command('appointstarosta', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Используй команду в личных сообщениях боту.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Команда доступна только владельцу бота.');
  const targetId = (ctx.message.text || '').replace(/^\/appointstarosta(?:@\S+)?/i, '').trim().split(/\s+/)[0];
  if (!/^\d+$/.test(targetId || '')) return ctx.reply('Формат: /appointstarosta TELEGRAM_ID\nНапример: /appointstarosta 123456789');
  const target = normalizeUser(user(Number(targetId)));
  target.role = 'starosta';
  saveDb();
  await ctx.reply('👑 Пользователь ' + targetId + ' назначен старостой. Для доступа к личному журналу он должен открыть бота и отправить /start.');
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


bot.command('app', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Открой личный чат с ботом и отправь /app.');
  if (!WEBAPP_URL) return ctx.reply('⚙️ Веб-кабинет почти готов. Владельцу нужно указать публичный HTTPS-адрес в переменной WEBAPP_URL в настройках Amvera.');
  return ctx.reply('🖥️ <b>Кабинет старосты</b>\\nОткрой мини-приложение, чтобы управлять посещаемостью и смотреть группу.', {
    parse_mode:'HTML',
    ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть кабинет', WEBAPP_URL)]])
  });
});

bot.command('attendance',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('📩 Посещаемость доступна в личных сообщениях.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.reply('❌ Журнал доступен старосте или заместителю группы.');
 if(!g.students?.length)return ctx.reply('📋 Сначала добавь студентов в группу командой /importstudents.');
 try{
  const lessons=await getTodayLessons(g);
  if(!lessons.length)return ctx.reply('📋 На сегодня в расписании нет пар для группы '+escapeHtml(g.scheduleGroup||'')+'.');
  g.todayAttendanceLessons=lessons.map(x=>({date:x.date,timeStart:x.timeStart,timeEnd:x.timeEnd,subject:x.subject,room:x.room,teacher:x.teacher}));
  saveDb();
  return ctx.reply('📋 <b>Посещаемость за '+attendanceDate()+'</b>\n👥 '+escapeHtml(g.title||'Группа')+'\n\nВыбери пару:',{parse_mode:'HTML',...attendanceLessonsKeyboard(lessons)});
 }catch(e){
  console.error('[attendance] schedule error:',e.message||e);
  return ctx.reply('❌ Не удалось загрузить пары из расписания. Проверь название группы через /setgroup и попробуй ещё раз.');
 }
});
bot.command('attendanceweb', async ctx => {
 if (!isPrivate(ctx)) return ctx.reply('📩 Используй команду в личных сообщениях.');
 const g = managedGroup(ctx.from.id);
 if (!g) return ctx.reply('❌ Команда доступна старосте или заместителю прикреплённой группы.');
 const u = normalizeUser(user(ctx.from.id));
 u.pendingAttendanceHtml = true;
 saveDb();
 return ctx.reply(
  '📄 <b>Сформировать файл посещаемости?</b>\\n\\nБот отправит HTML-файл со всеми сохранёнными датами и отметками только в этот личный чат. Файл не будет опубликован в интернете. Убедись, что имеешь право хранить и использовать данные студентов.',
  { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Создать HTML-файл', 'attendanceweb:confirm')], [Markup.button.callback('❌ Отмена', 'attendanceweb:cancel')]]) }
 );
});
bot.action('attendanceweb:cancel', async ctx => {
 if (!isPrivate(ctx)) return ctx.answerCbQuery();
 const u = normalizeUser(user(ctx.from.id));
 delete u.pendingAttendanceHtml;
 saveDb();
 await ctx.answerCbQuery('Отменено');
 return ctx.editMessageText('❌ Создание файла отменено.');
});
bot.action('attendanceweb:confirm', async ctx => {
 if (!isPrivate(ctx)) return ctx.answerCbQuery('Открой бота в личке.');
 const u = normalizeUser(user(ctx.from.id));
 if (!u.pendingAttendanceHtml) return ctx.answerCbQuery('Запрос устарел.');
 const g = managedGroup(ctx.from.id);
 delete u.pendingAttendanceHtml;
 saveDb();
 if (!g) return ctx.answerCbQuery('Группа не найдена.');
 await ctx.answerCbQuery('Формирую файл…');
 try {
  const html = createAttendanceHtml(g);
   await ctx.editMessageText('⏳ HTML-файл сформирован, отправляю…');
   await ctx.replyWithDocument({ source: Buffer.from(html, 'utf8'), filename: 'attendance.html' }, { caption: '✅ Журнал посещаемости группы «' + String(g.title || 'Без названия').replace(/[<>]/g, '') + '». Открой файл в браузере.' });
   return;
 } catch (error) {
  const reason = String(error?.message || error || 'Неизвестная ошибка').slice(0, 220);
  console.error('[attendance html export]', reason);
   return ctx.reply('❌ Не удалось сформировать HTML-файл: ' + reason);
 }
});
bot.command('mark',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('📩 Используй команду в личке.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.reply('❌ Только староста или заместитель.');
 const lesson=g.activeAttendanceLessons?.[String(ctx.from.id)];
 const p=ctx.message.text.replace(/^\/mark(?:@\S+)?/i,'').trim().split(/\s+/),i=Number(p[0])-1,status=p[1]==='present'?'present':p[1]==='absent'?'absent':'';
 if(!lesson)return ctx.reply('Сначала выбери пару через /attendance, затем используй /mark 2 present или /mark 2 absent.');
 if(!Number.isInteger(i)||!g.students[i]||!status)return ctx.reply('Пример: /mark 2 present или /mark 2 absent');
 const key=attendanceLessonKey(lesson);g.lessonAttendance||={};g.lessonAttendance[key]||={};g.lessonAttendance[key][attendanceKey(g.students[i])]=status;saveDb();
 return ctx.reply('✅ Отметка сохранена для пары «'+lesson.subject+'»: '+studentName(g.students[i]));
});
bot.command('groups', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список прикреплённых групп доступен в личных сообщениях.');
  const groups = Object.values(db.groups);
  if (!groups.length) return ctx.reply('Нет прикреплённых групп. Добавь бота в группу и выполни /attach.');
  await ctx.reply('👥 Прикреплённые группы:\n\n' + groups.map((g, i) => (i + 1) + '. ' + g.title).join('\n'));
});

bot.command('poll', startPoll);
bot.command('hw', startHomework);
bot.command('homework', startHomework);
bot.hears('📚 ДЗ', async ctx => {
  if (!isPrivate(ctx)) return;
  const u = user(ctx.from.id);
  const groupName = u.group || '';
  const matching = Object.values(db.groups).filter(g => !groupName || g.scheduleGroup === groupName || g.title === groupName);
  const records = matching.flatMap(g => (g.homework || []).map(h => ({...h, groupTitle:g.title})));
  const latest = records.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10);
  if (!latest.length) return ctx.reply('📚 Пока нет опубликованных домашних заданий для твоей группы.', menuFor(ctx));
  return ctx.reply('📚 <b>Домашние задания</b>\\n\\n' + latest.map(h => '<b>' + escapeHtml(h.subject) + '</b> — ' + escapeHtml(h.groupTitle) + '\\n' + escapeHtml(h.homework) + '\\n' + escapeHtml(h.createdAt || '')).join('\\n\\n'), {parse_mode:'HTML', ...menuFor(ctx)});
});
bot.hears('📚 Создать ДЗ', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание ДЗ выполняется в личных сообщениях.');
  return ctx.reply('Напиши ДЗ командой:\n/hw Предмет | Домашнее задание');
});
bot.hears('📊 Создать опрос', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Создание опроса выполняется в личных сообщениях.');
  return ctx.reply('Напиши опрос командой:\n/poll Вопрос | Вариант 1 | Вариант 2 | Вариант 3');
});

// Отдельные обработчики кнопок посещаемости.
bot.action(/^studentcard:(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Открой список в личке.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const i=Number(ctx.match[1]);if(!g.students[i])return ctx.answerCbQuery('Студент не найден.');
 await ctx.answerCbQuery();return ctx.editMessageText(studentCardText(g,i),{parse_mode:'HTML',...studentCardKeyboard(i)});
});
bot.action(/^studentedit:(username|phone):(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Только в личных сообщениях.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const type=ctx.match[1],i=Number(ctx.match[2]);if(!g.students[i])return ctx.answerCbQuery('Студент не найден.');
 const u=normalizeUser(user(ctx.from.id));u.pendingStudentField={type,index:i};saveDb();
 await ctx.answerCbQuery();
 return ctx.reply(type==='username'?'✏️ Отправь username студента (например, @username). Чтобы очистить — отправь прочерк.':'📞 Отправь номер телефона в международном формате (например, +37255555555). Чтобы очистить — отправь прочерк.\\nУказывай номер только если студент сам согласился его передать.\\nДля отмены: /cancel');
});
bot.action('studentback',async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery();
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 await ctx.answerCbQuery();return ctx.editMessageText(formatStudentList(g),{parse_mode:'HTML',...studentListKeyboard(g)});
});
bot.action(/^studentpage:(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery();
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 await ctx.answerCbQuery();return ctx.editMessageText(formatStudentList(g),{parse_mode:'HTML',...studentListKeyboard(g,Number(ctx.match[1]))});
});
bot.action(/^attstudent:(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Открой журнал в личке.');const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const i=Number(ctx.match[1]);if(!g.students[i])return ctx.answerCbQuery('Студент не найден.');await ctx.answerCbQuery('Выбери статус');
 await ctx.editMessageText('📋 <b>'+escapeHtml(g.title)+'</b>\\n\\n'+escapeHtml(studentName(g.students[i])),{parse_mode:'HTML',...attendanceStatusButtons(i)});
});
bot.action(/^attlesson:(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Открой журнал в личке.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const lesson=g.todayAttendanceLessons?.[Number(ctx.match[1])];if(!lesson)return ctx.answerCbQuery('Список пар устарел. Отправь /attendance ещё раз.');
 g.activeAttendanceLessons[String(ctx.from.id)]=lesson;g.lessonAttendance||={};saveDb();
 await ctx.answerCbQuery();
 return ctx.editMessageText(formatLessonAttendance(g,lesson),{parse_mode:'HTML',...attendancePairButtons(g,lesson,ctx.from.id)});
});
bot.action(/^attpairmark:(\d+):(present|absent)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Открой журнал в личке.');
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const lesson=g.activeAttendanceLessons?.[String(ctx.from.id)],i=Number(ctx.match[1]),student=g.students?.[i];
 if(!lesson||!student)return ctx.answerCbQuery('Пара или студент не найдены. Открой /attendance заново.');
 const key=attendanceLessonKey(lesson),studentKey=attendanceKey(student);
 g.lessonAttendance||={};g.lessonAttendance[key]||={};g.lessonAttendance[key][studentKey]=ctx.match[2];saveDb();
 await ctx.answerCbQuery('Отметка сохранена');
 return ctx.editMessageText(formatLessonAttendance(g,lesson),{parse_mode:'HTML',...attendancePairButtons(g,lesson,ctx.from.id,Math.floor(i/10))});
});
bot.action(/^attpairpage:(\d+)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery();
 const g=managedGroup(ctx.from.id),lesson=g?.activeAttendanceLessons?.[String(ctx.from.id)];
 if(!g||!lesson)return ctx.answerCbQuery('Открой /attendance заново.');
 await ctx.answerCbQuery();
 return ctx.editMessageText(formatLessonAttendance(g,lesson),{parse_mode:'HTML',...attendancePairButtons(g,lesson,ctx.from.id,Number(ctx.match[1]))});
});
bot.action('attpairback',async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery();
 const g=managedGroup(ctx.from.id);if(!g)return ctx.answerCbQuery('Группа не найдена.');
 const lessons=g.todayAttendanceLessons||[];
 await ctx.answerCbQuery();
 if(!lessons.length)return ctx.editMessageText('Список пар устарел. Отправь /attendance ещё раз.');
 return ctx.editMessageText('📋 <b>Посещаемость за '+attendanceDate()+'</b>\n👥 '+escapeHtml(g.title||'Группа')+'\n\nВыбери пару:',{parse_mode:'HTML',...attendanceLessonsKeyboard(lessons)});
});
bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery?.data || '';
  if (!data.startsWith('pollsend:') && !data.startsWith('hwsend:') && !data.startsWith('students:')) return;

  const isStudentList = data.startsWith('students:');
  const isHomework = data.startsWith('hwsend:');
  if (isStudentList) {
    if (!isPrivate(ctx)) { await ctx.answerCbQuery('Только в личке.'); return; }
    const groupId = data.slice('students:'.length);
    const g = db.groups[groupId];
    if (!g) { await ctx.answerCbQuery('Группа не найдена.'); return; }
    const students=g.students||[];if(!students.length){await ctx.answerCbQuery('Список группы пуст.');return;}
    await ctx.answerCbQuery('Готово');await ctx.editMessageText(formatStudentList(g),{parse_mode:'HTML',...studentListKeyboard(g)});
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
        g.homework ||= [];
        g.homework.push({ subject: u.pendingHomework.subject, homework: u.pendingHomework.homework, createdAt: new Date().toISOString(), authorId: ctx.from.id });
        if (g.homework.length > 50) g.homework = g.homework.slice(-50);
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
bot.hears('📅 Расписание', ctx => show(ctx, 1, 0));
bot.hears('📅 Сегодня', ctx => show(ctx, 1, 0));
bot.hears('📅 Завтра', ctx => show(ctx, 2, 1));
bot.hears('🗓 Неделя', ctx => show(ctx, Number(process.env.SCHEDULE_DAYS || 7), 0));
bot.hears('👥 Моя группа', ctx => {
  const g = user(ctx.from.id).group;
  return ctx.reply(g ? '👥 Твоя группа: «' + g + '»' : 'Группа ещё не выбрана. Используй /group.', menuFor(ctx));
});
bot.hears('👥 Группы', ctx => {
  const groups = Object.values(db.groups);
  return ctx.reply(
    groups.length ? '👥 Прикреплено групп: ' + groups.length + '\n' + groups.map(g => '• ' + g.title).join('\n') : 'Нет прикреплённых групп.',
    menuFor(ctx)
  );
});
bot.hears('📋 Посещаемость', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Посещаемость доступна в личных сообщениях.');
  const g = managedGroup(ctx.from.id);
  if (!g) return ctx.reply('❌ Журнал доступен старосте или заместителю прикреплённой группы.');
  try {
    const lessons = await getTodayLessons(g);
    if (!lessons.length) return ctx.reply('📋 На сегодня в расписании нет пар.');
    g.todayAttendanceLessons = lessons.map(x => ({date:x.date,timeStart:x.timeStart,timeEnd:x.timeEnd,subject:x.subject,room:x.room,teacher:x.teacher}));
    saveDb();
    return ctx.reply('📋 <b>Посещаемость за '+attendanceDate()+'</b>\n👥 '+escapeHtml(g.title||'Группа')+'\n\nВыбери пару:', {parse_mode:'HTML', ...attendanceLessonsKeyboard(lessons)});
  } catch (e) {
    console.error('[attendance] schedule error:', e.message || e);
    return ctx.reply('❌ Не удалось загрузить пары из расписания. Проверь /setgroup.');
  }
});
bot.hears('💳 Подписка', ctx => {
  const u = normalizeUser(user(ctx.from.id));
  if (isOwner(ctx.from.id)) return ctx.reply(subscriptionText(u, true), { parse_mode: 'HTML', ...menuFor(ctx) });
  return ctx.reply(subscriptionText(u), { parse_mode: 'HTML', ...subscriptionKeyboard() });
});

bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Укажи группу через /group ИСП-21. Опросы создаются через /poll, а ДЗ — через /дз. Перед отправкой бот даст выбрать группу.', menuFor(ctx)));

bot.catch(e => console.error('[bot]', e));


function verifyMiniAppInitData(initData) {
  if (!initData || typeof initData !== 'string' || initData.length > 8192) throw new Error('Открой мини-приложение из Telegram.');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error('Некорректные данные Telegram.');
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k+'='+v).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const a = Buffer.from(receivedHash, 'hex'), b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Не удалось подтвердить аккаунт Telegram.');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now()/1000-authDate) > 86400) throw new Error('Сессия устарела. Закрой и снова открой мини-приложение.');
  let tgUser;
  try { tgUser = JSON.parse(params.get('user') || 'null'); } catch {}
  if (!tgUser?.id) throw new Error('Telegram не передал данные пользователя.');
  return tgUser;
}
function sendJson(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function readJsonBody(req) {
  let raw='';
  for await (const chunk of req) { raw+=chunk; if(raw.length>32768) throw new Error('Слишком большой запрос.'); }
  return raw ? JSON.parse(raw) : {};
}
async function getMiniAppTodayLessons(g) {
 let timer;
 try {
  return await Promise.race([
   getTodayLessons(g),
   new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Источник расписания не ответил за 25 секунд. Предыдущие отметки сохранены — попробуй обновить кабинет позже.')), 25000);
   })
  ]);
 } finally {
  clearTimeout(timer);
 }
}

async function handleMiniAppApi(req,res,url) {
  let tgUser;
  try { tgUser=verifyMiniAppInitData(req.headers['x-telegram-init-data']); }
  catch(e) { return sendJson(res,401,{error:e.message}); }
  const u=normalizeUser(user(tgUser.id));
  if (!isOwner(tgUser.id) && !hasActiveSubscription(u)) return sendJson(res,403,{error:'Для веб-кабинета нужна активная подписка.'});
  const g=managedGroup(tgUser.id);
  if(!g) return sendJson(res,403,{error:'Кабинет доступен старосте или заместителю группы.'});
  if(req.method==='GET' && url.pathname==='/api/data') {
    let lessons=[],scheduleError='';
    try {
      lessons=await getMiniAppTodayLessons(g);
    } catch(e) {
      scheduleError='Расписание временно недоступно. Остальные данные кабинета загружены; попробуй обновить позже.';
      console.error('[miniapp data] schedule unavailable for group:', g.scheduleGroup, e?.stack || e?.message || e);
    }
    const students=g.students||[];
    const data=lessons.map(lesson=>{
      const key=attendanceLessonKey(lesson),record=g.lessonAttendance?.[key]||{};
      let present=0,absent=0;
      for(const student of students){const status=record[attendanceKey(student)];if(status==='present')present++;else if(status==='absent')absent++;}
      return {key,date:lesson.date,timeStart:lesson.timeStart||'',timeEnd:lesson.timeEnd||'',subject:lesson.subject||'Занятие',room:lesson.room||'',present,absent,unmarked:students.length-present-absent};
    });
    return sendJson(res,200,{user:{id:tgUser.id,firstName:tgUser.first_name||'',role:u.role},group:g.title||u.group||'Учебная группа',date:attendanceDate(),lessons:data,scheduleError,students:students.map((s,i)=>({index:i,name:studentName(s),statuses:Object.fromEntries(data.map(lesson=>[lesson.key,g.lessonAttendance?.[lesson.key]?.[attendanceKey(s)]||'unmarked']))})),announcements:(g.announcements||[]).slice(-30).reverse()});
  }
  if(req.method==='POST' && url.pathname==='/api/announcements') {
    try {
      const body=await readJsonBody(req);
      const message=String(body.text||'').trim();
      if(!message) return sendJson(res,400,{error:'Напиши текст объявления.'});
      if(message.length>3000) return sendJson(res,400,{error:'Объявление слишком длинное. Максимум 3000 символов.'});
      if(!g.chatId) return sendJson(res,400,{error:'К группе не привязан Telegram-чат. Сначала выполни /attach в группе.'});
      await bot.telegram.sendMessage(g.chatId,'📢 <b>Объявление группы</b>\n\n'+escapeHtml(message),{parse_mode:'HTML'});
      g.announcements ||= [];
      const item={id:crypto.randomUUID(),text:message,authorId:String(tgUser.id),authorName:String(tgUser.first_name||'Староста'),createdAt:new Date().toISOString()};
      g.announcements.push(item);
      if(g.announcements.length>100) g.announcements=g.announcements.slice(-100);
      saveDb();
      return sendJson(res,200,{ok:true,announcement:item});
    } catch(e) {
      console.error('[miniapp announcement]',e?.message||e);
      return sendJson(res,502,{error:'Не удалось отправить объявление в группу. Проверь, что бот добавлен в чат и может отправлять сообщения.'});
    }
  }
  if(req.method==='POST' && url.pathname==='/api/attendance') {
    try {
      const body=await readJsonBody(req), index=Number(body.studentIndex), status=body.status, key=String(body.lessonKey||'');
      if(!Number.isInteger(index)||index<0||index>=(g.students||[]).length||!['present','absent','unmarked'].includes(status)) return sendJson(res,400,{error:'Некорректная отметка.'});
      const lessons=await getMiniAppTodayLessons(g);
      const lesson=lessons.find(x=>attendanceLessonKey(x)===key);
      if(!lesson) return sendJson(res,400,{error:'Эта пара отсутствует в сегодняшнем расписании. Обнови страницу.'});
      g.lessonAttendance ||= {};
      g.lessonAttendance[key] ||= {};
      const studentKey=attendanceKey(g.students[index]);
      if(status==='unmarked') delete g.lessonAttendance[key][studentKey];
      else g.lessonAttendance[key][studentKey]=status;
      saveDb();
      return sendJson(res,200,{ok:true});
    } catch(e) {
      console.error('[miniapp attendance]',e.message||e);
      return sendJson(res,400,{error:'Не удалось сохранить отметку. Попробуй ещё раз.'});
    }
  }
  return sendJson(res,404,{error:'Метод не найден.'});
}

const port = Number(process.env.PORT || 80);
const webappFile = new URL('./webapp/index.html', import.meta.url);
const healthServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleMiniAppApi(req,res,url);
  if (url.pathname === '/app' || url.pathname === '/app/') {
    try {
      const html=fs.readFileSync(webappFile,'utf8');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      return res.end(html);
    } catch {
      res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Mini App не найден.');
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('OK');
});


async function telegramStartupRequest(label, operation, attempts = 5) {
 let lastError;
 for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
   return await operation();
  } catch (error) {
   lastError = error;
   console.error('[telegram startup] ' + label + ' failed (' + attempt + '/' + attempts + '):', error?.message || error);
   if (attempt < attempts) {
    const delay = Math.min(10000, 1500 * (2 ** (attempt - 1)));
    await new Promise(resolve => setTimeout(resolve, delay));
   }
  }
 }
 throw new Error('Telegram API недоступен после ' + attempts + ' попыток (' + label + '): ' + (lastError?.message || lastError));
}

async function main() {
  healthServer.listen(port, '0.0.0.0', () => {
    console.log('[health] HTTP сервер слушает 0.0.0.0:' + port);
  });

  await telegramStartupRequest('deleteWebhook', () => bot.telegram.deleteWebhook({ drop_pending_updates: false }));
  const me = await telegramStartupRequest('getMe', () => bot.telegram.getMe());
  console.log('Бот запущен: @' + me.username);

  // Отправляем владельцу список изменений один раз для каждой версии.
  if (OWNER_TELEGRAM_ID && db.lastNotifiedRelease !== BOT_RELEASE_VERSION) {
    const releaseMessage =
      '🚀 <b>Староста Бот обновлён</b>\n' +
      'Версия: <b>' + BOT_RELEASE_VERSION + '</b>\n\n' +
      '<b>Что нового:</b>\n' +
      BOT_RELEASE_NOTES.map(item => '• ' + escapeHtml(item)).join('\n');
    try {
      await bot.telegram.sendMessage(OWNER_TELEGRAM_ID, releaseMessage, { parse_mode: 'HTML' });
      db.lastNotifiedRelease = BOT_RELEASE_VERSION;
      saveDb();
      console.log('[startup] Уведомление об обновлении отправлено владельцу: ' + BOT_RELEASE_VERSION);
    } catch (e) {
      console.error('[release notification] Не удалось уведомить владельца:', e.message || e);
    }
  }

  // Уведомляем всех пользователей, назначенных старостами, после каждого запуска/перезапуска.
  const starostas = Object.entries(db.users).filter(([, u]) => ['starosta', 'zam'].includes(u?.role));
  for (const [starostaId] of starostas) {
    try {
      await bot.telegram.sendMessage(
        starostaId,
        '🔄 <b>Староста Бот перезапущен</b>\nБот снова работает и готов принимать команды.',
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('[restart notification] Не удалось уведомить старосту ' + starostaId + ':', e.message || e);
    }
  }
  console.log('[startup] Уведомления отправлены старостам: ' + starostas.length);

  // Обновляем список команд в меню Telegram.
  await telegramStartupRequest('setMyCommands private', () => bot.telegram.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
    { command: 'schedule', description: 'Расписание на сегодня' },
    { command: 'group', description: 'Моя учебная группа' },
    { command: 'hw', description: 'Домашние задания' },
    { command: 'attendance', description: 'Журнал посещаемости' },
    { command: 'app', description: 'Открыть веб-кабинет' },
    { command: 'students', description: 'Список студентов группы' },
    { command: 'importstudents', description: 'Импорт списка студентов из текста' },
    { command: 'pollreport', description: 'Ответы на последний опрос' },
    { command: 'subscription', description: 'Статус подписки' }
  ], { scope: { type: 'all_private_chats' } }));

  await telegramStartupRequest('setMyCommands groups', () => bot.telegram.setMyCommands([], { scope: { type: 'all_group_chats' } }));

  await telegramStartupRequest('setMyCommands owner', () => bot.telegram.setMyCommands([
    { command: 'admin', description: 'Панель владельца' },
    { command: 'stats', description: 'Статистика' },
    { command: 'grant', description: 'Выдать подписку' },
    { command: 'revoke', description: 'Отозвать подписку' },
    { command: 'subinfo', description: 'Проверить подписку' }
  ], { scope: { type: 'chat', chat_id: Number(OWNER_TELEGRAM_ID) } }));

  await bot.launch({ dropPendingUpdates: false });
  await checkAutomaticAttendancePolls();
  setInterval(checkAutomaticAttendancePolls, 30000).unref();
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
