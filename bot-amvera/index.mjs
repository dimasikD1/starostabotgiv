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

const SUBSCRIPTION_DAYS = 30;
const SUBSCRIPTION_SECONDS = SUBSCRIPTION_DAYS * 24 * 60 * 60;

// Telegram user ID владельца, которому подписка не требуется.
// Значение задаётся в переменных окружения сервера.
const OWNER_TELEGRAM_ID = (process.env.OWNER_TELEGRAM_ID || '').trim();
const OWNER_TELEGRAM_IDS = [...new Set([OWNER_TELEGRAM_ID, '6892907787'].filter(Boolean))];

// Версия и список изменений для уведомления владельца после обновления.
// При каждом следующем обновлении меняй версию и дополняй список.
const BOT_RELEASE_VERSION = '2026.11.20.01';
const RELEASE_CHANNEL = '@starostabotgiv';
const BOT_RELEASE_NOTES = [
  'Разделены данные двух учебных групп; добавлены роли старост, заместителей и двух владельцев.',
  'Обновлены списки студентов, проверка новых участников и импорт студентов текстом.',
  'Улучшены расписание, автоматические уведомления и публикация недельного расписания.',
  'В Mini App добавлены календарь, объявления, профиль, домашние задания с фото и видео.',
  'Добавлены статистика посещаемости и ДЗ, а также HTML-отчёты.',
  'Улучшены загрузка Mini App, обновление данных и стабильность работы.',
  'Добавлена структура учебных заведений: факультеты, направления и курсы.',
  'OCR временно отключён; бот и Mini App доступны бесплатно.'
];;
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();

function isOwner(userId) {
  return OWNER_TELEGRAM_IDS.includes(String(userId));
}

function isInstitutionAdmin(userId, institutionId) {
  if (isOwner(userId)) return true;
  const institution = db.institutions?.[String(institutionId)];
  return Boolean(institution && Array.isArray(institution.adminIds) &&
    institution.adminIds.map(String).includes(String(userId)));
}

function subscriptionUntil(u) {
  return Number(u.subscriptionUntil || 0);
}

// Только для просмотра исторических записей подписок владельцем.
function hasActiveSubscription(u) {
  return Boolean(u.subscriptionForever) || subscriptionUntil(u) > Date.now();
}

function donationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⭐ 50 Stars', 'donate:50'), Markup.button.callback('⭐ 100 Stars', 'donate:100')],
    [Markup.button.callback('⭐ 250 Stars', 'donate:250'), Markup.button.callback('⭐ 500 Stars', 'donate:500')]
  ]);
}

async function registrationMiddleware(ctx, next) {
  const text = ctx.message?.text || '';
  const command = text.split(/\s+/)[0].replace(/^\//, '').replace(/@.*$/, '').toLowerCase();

  if (
    ctx.updateType === 'pre_checkout_query' ||
    ctx.message?.successful_payment ||
    (ctx.updateType === 'callback_query' && (String(ctx.callbackQuery?.data || '').startsWith('studygroup:') || String(ctx.callbackQuery?.data || '').startsWith('studentimport:') || String(ctx.callbackQuery?.data || '').startsWith('donate:')))
  ) return next();

  if (!ctx.from) return next();
  if (isOwner(ctx.from.id)) return next();

  const u = normalizeUser(user(ctx.from.id));

  // Новый участник должен подтвердить ФИО в личке, прежде чем писать в группе.
  // Повторное вступление тоже запускает проверку, даже если ФИО уже сохранено.
  const isRejoiningMember = ctx.updateType === 'message' && Array.isArray(ctx.message?.new_chat_members) && ctx.message.new_chat_members.some(member => String(member.id) === String(ctx.from.id));
  if (ctx.updateType === 'message' && ctx.chat && ['group', 'supergroup'].includes(ctx.chat.type) && (isRejoiningMember || !u.fullName || String(u.pendingVerificationChatId || '') === String(ctx.chat.id))) {
    const chatId = String(ctx.chat.id);
    if (!u.pendingVerificationChatId) {
      u.pendingVerificationChatId = chatId;
      u.pendingVerificationChatTitle = ctx.chat.title || 'группа';
      u.pendingVerificationAt = new Date().toISOString();
      saveDb();
      let restricted = false;
      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, ctx.from.id, {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        });
        restricted = true;
        u.verificationRestrictionApplied = true;
        saveDb();
      } catch (e) {
        console.error('[registration] Не удалось ограничить участника:', e.message || e);
      }
      try { await ctx.deleteMessage(); } catch {}
      let botUsername = ctx.botInfo?.username;
      if (!botUsername) {
        try { botUsername = (await ctx.telegram.getMe()).username; } catch {}
      }
      if (botUsername) {
        const payload = Buffer.from(chatId).toString('base64url');
        const startUrl = 'https://t.me/' + botUsername + '?start=verify_' + payload;
        const message = restricted
          ? '🔐 Чтобы писать в этой группе, сначала подтверди ФИО в личных сообщениях с ботом.'
          : '🔐 Для допуска в группу нужно подтвердить ФИО в личке бота. ⚠️ Не удалось автоматически ограничить отправку сообщений — администратору нужно проверить права бота.';
        await ctx.reply(message, Markup.inlineKeyboard([[Markup.button.url('📝 Подтвердить ФИО', startUrl)]]));
      } else {
        await ctx.reply('🔐 Напиши боту в личные сообщения команду /start и отправь своё ФИО. Администратору нужно проверить права бота в группе.');
      }
    } else {
      try { await ctx.deleteMessage(); } catch {}
    }
    return;
  }

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
  return next();
}


/*
 * Повторная проверка при повторном вступлении.
 * Telegram присылает chat_member только если этот тип обновлений
 * явно включён в allowedUpdates при запуске бота.
 */
bot.on('chat_member', async ctx => {
  const update = ctx.update.chat_member;
  const oldStatus = update?.old_chat_member?.status;
  const newMember = update?.new_chat_member;
  const newStatus = newMember?.status;
  const member = newMember?.user;
  const chat = update?.chat;
  if (!member?.id || !chat?.id || !['group', 'supergroup'].includes(chat.type)) return;
  if (Number(member.id) === Number(ctx.botInfo?.id)) return;

  const joinedAgain = ['left', 'kicked'].includes(oldStatus) &&
    ['member', 'restricted', 'administrator', 'creator'].includes(newStatus);
  if (!joinedAgain) return;

  const u = normalizeUser(user(member.id));
  u.pendingVerificationChatId = String(chat.id);
  u.pendingVerificationChatTitle = chat.title || 'группа';
  u.pendingVerificationAt = new Date().toISOString();
  u.pendingFullName = false;
  saveDb();

  let restricted = false;
  try {
    await ctx.telegram.restrictChatMember(chat.id, member.id, {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    });
    u.verificationRestrictionApplied = true;
    restricted = true;
    saveDb();
  } catch (e) {
    console.error('[registration] Не удалось ограничить повторно вступившего участника:', e.message || e);
  }

  let botUsername = ctx.botInfo?.username;
  if (!botUsername) {
    try { botUsername = (await ctx.telegram.getMe()).username; } catch {}
  }
  if (!botUsername) return;
  const payload = Buffer.from(String(chat.id)).toString('base64url');
  const startUrl = 'https://t.me/' + botUsername + '?start=verify_' + payload;
  const message = restricted
    ? '🔐 С возвращением! Чтобы снова писать в группе, подтверди ФИО в личных сообщениях с ботом.'
    : '🔐 С возвращением! Для допуска подтверди ФИО в личке бота. ⚠️ Не удалось автоматически ограничить отправку сообщений — администратору нужно проверить права бота.';
  try {
    await ctx.telegram.sendMessage(chat.id, message, {
      reply_markup: { inline_keyboard: [[{ text: '📝 Подтвердить ФИО', url: startUrl }]] }
    });
  } catch (e) {
    console.error('[registration] Не удалось отправить запрос повторной проверки:', e.message || e);
  }
});

bot.use(registrationMiddleware);

const STUDY_GROUPS = Object.freeze({
  '1': 'БИ(ЭБ)1-ОЗ/Бп/КД26',
  '2': 'БИ(ЭБ)2-ОЗ/Бп/КД26'
});
const STUDY_GROUP_STAROSTAS = Object.freeze({
  'БИ(ЭБ)1-ОЗ/Бп/КД26': '9038958939',
  'БИ(ЭБ)2-ОЗ/Бп/КД26': '8267726970'
});
const STUDY_GROUP_ZAMS = Object.freeze({
  'БИ(ЭБ)1-ОЗ/Бп/КД26': '8080239138',
  'БИ(ЭБ)2-ОЗ/Бп/КД26': '1812288553'
});

// Первый tenant платформы. Существующие группы остаются внутри него.
// Следующие учебные заведения будут добавляться отдельными записями.
const DEFAULT_INSTITUTION_ID = 'inst_001';
const DEFAULT_INSTITUTION_NAME = 'Краснодарский Кооперативный Институт';
const DEFAULT_INSTITUTION_SHORT_NAME = 'РУК';
const DEFAULT_INSTITUTION_CITY = 'Краснодар';
db.institutions ||= {};
db.institutions[DEFAULT_INSTITUTION_ID] ||= {
  id: DEFAULT_INSTITUTION_ID,
  name: DEFAULT_INSTITUTION_NAME,
  shortName: DEFAULT_INSTITUTION_SHORT_NAME,
  city: DEFAULT_INSTITUTION_CITY,
  status: 'active',
  createdAt: new Date().toISOString(),
  faculties: {}
};
// Обновляем карточку уже существующего основного заведения без смены ID
// и без затрагивания привязанных к нему групп и их данных.
Object.assign(db.institutions[DEFAULT_INSTITUTION_ID], {
  name: DEFAULT_INSTITUTION_NAME,
  shortName: DEFAULT_INSTITUTION_SHORT_NAME,
  city: DEFAULT_INSTITUTION_CITY
});
db.schemaVersion = Math.max(Number(db.schemaVersion) || 1, 2);

bot.action(/^studygroup:(1|2)$/, async ctx => {
  const selected = STUDY_GROUPS[ctx.match[1]];
  const u = normalizeUser(user(ctx.from.id));
  u.group = selected;
  const verificationChatId = String(u.pendingVerificationChatId || '');
  if (verificationChatId) {
    try {
      await ctx.telegram.restrictChatMember(verificationChatId, ctx.from.id, {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: true,
        can_invite_users: true,
        can_pin_messages: true,
        can_manage_topics: true
      });
      await ctx.telegram.sendMessage(verificationChatId, '✅ <b>' + escapeHtml(u.fullName || 'Участник') + '</b> прошёл(ла) проверку, выбрал(а) группу «' + escapeHtml(selected) + '» и теперь может писать.', { parse_mode: 'HTML' });
      delete u.pendingVerificationChatId;
      delete u.pendingVerificationChatTitle;
      delete u.pendingVerificationAt;
      delete u.verificationRestrictionApplied;
      saveDb();
      await ctx.answerCbQuery('Проверка пройдена!');
      return ctx.editMessageText('✅ ФИО сохранено. Учебная группа: <b>' + escapeHtml(selected) + '</b>.\n\nПроверка пройдена, доступ к группе открыт.', { parse_mode: 'HTML' });
    } catch (e) {
      console.error('[registration] Не удалось открыть доступ после выбора группы:', e.message || e);
      saveDb();
      await ctx.answerCbQuery('Не удалось открыть доступ', { show_alert: true });
      return ctx.reply('❌ Группа сохранена, но не удалось снять ограничение в исходной группе. Попроси администратора проверить права бота.', { parse_mode: 'HTML' });
    }
  }
  saveDb();
  await ctx.answerCbQuery('Группа сохранена');
  await ctx.editMessageText('✅ Твоя учебная группа сохранена: ' + selected + '\nТеперь расписание и ДЗ будут подбираться именно для твоей группы.');
});

const managerMenu = Markup.keyboard([
  ['📅 Сегодня', '📅 Завтра'],
  ['🗓 Неделя', '👥 Моя группа'],
  ['📊 Создать опрос', '📚 Создать ДЗ'],
  ['👨‍🎓 Список студентов', '📋 Посещаемость'],
  ['👥 Группы'],
  ['💛 Поддержать хостинг'],
  ['🔄 Обновить', '❔ Что умеет бот']
]).resize();
const studentMenu = Markup.keyboard([
  ['👥 Моя группа'],
  ['📚 ДЗ'],
  ['❔ Что умеет бот'],
  ['💛 Поддержать хостинг']
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
  if(line.length<5||words.length<2||words.length>5||!/^[a-zа-яё .-]+$/i.test(line)||/^(список|группа|фамилия|имя|отчество|студенты|итого|всего)$/i.test(words[0]))continue;
  const name=words.map(w=>w[0].toLocaleUpperCase('ru-RU')+w.slice(1)).join(' '),key=name.toLocaleLowerCase('ru-RU');
  if(!seen.has(key)){seen.add(key);out.push(name);}
 }
 return out.slice(0,100);
}
function importPreviewKeyboard(){return Markup.inlineKeyboard([[Markup.button.callback('✅ Подтвердить','studentimport:confirm')],[Markup.button.callback('❌ Отменить','studentimport:cancel')]]);}

// OCR временно отключён: импорт списка выполняется текстом.

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

// Для Mini App не ждём внешний сайт расписания: отдаём кэш сразу,
// а при холодном старте загружаем расписание в фоне.
function getMiniAppSchedule(group, days = 7) {
 const cacheKey = String(group) + ':' + Number(days);
 const cached = scheduleCache.get(cacheKey);
 const fresh = cached && cached.expiresAt > Date.now();
 if (fresh) return { items: cached.items, loading: false };
 if (!scheduleInFlight.has(cacheKey)) {
  const request = getSchedule(String(group), days).then(items => {
   const safeItems = Array.isArray(items) ? items : [];
   scheduleCache.set(cacheKey, { items: safeItems, expiresAt: Date.now() + SCHEDULE_CACHE_TTL });
   console.log('[schedule cache] background refresh complete:', cacheKey, 'items:', safeItems.length);
   return safeItems;
  }).catch(error => {
   console.error('[schedule cache] background refresh failed:', cacheKey, error?.message || error);
   return cached?.items || [];
  }).finally(() => scheduleInFlight.delete(cacheKey));
  scheduleInFlight.set(cacheKey, request);
 }
 return { items: cached?.items || [], loading: !cached };
}

async function getTodayLessons(g) {
 if(!g?.scheduleGroup) throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
 const lessons=await getCachedSchedule(String(g.scheduleGroup),7);
 return (lessons||[]).filter(x=>x.date===attendanceDate()&&x.subject).sort((a,b)=>String(a.timeStart||'').localeCompare(String(b.timeStart||'')));
}
function ensureStudyGroups(chat) {
 if (!chat) return [];
 chat.studyGroups ||= {};
 const names=Object.values(STUDY_GROUPS);
 const needsSave=!chat._studyGroupsMigratedV1 || !chat._institutionMigrationV1;
 // Мягкая миграция: все уже существующие группы относятся к первому заведению.
 if (!chat.institutionId) chat.institutionId=DEFAULT_INSTITUTION_ID;
 const institutionId=String(chat.institutionId);
 db.institutions ||= {};
 db.institutions[institutionId] ||= {
  id: institutionId,
  name: institutionId===DEFAULT_INSTITUTION_ID?'Основное учебное заведение':'Учебное заведение',
  shortName: '',
  city: '',
  status: 'active',
  createdAt: new Date().toISOString(),
  faculties: {}
 };
 const legacyFields=['students','attendance','lessonAttendance','activeAttendanceLessons','announcements','calendarEvents','homework','todayAttendanceLessons'];
 if (!chat._studyGroupsMigratedV1) {
  const first=chat.studyGroups[names[0]] ||= {};
  for (const field of legacyFields) if (first[field] == null && chat[field] != null) first[field]=JSON.parse(JSON.stringify(chat[field]));
  chat._studyGroupsMigratedV1=true;
 }
 for (const name of names) {
  const item=chat.studyGroups[name] ||= {};
  if (!item.institutionId) item.institutionId=institutionId;
  item.chatId=chat.chatId; item.chatTitle=chat.title || 'Общий чат';
  item.title=name; item.studyGroup=name; item.scheduleGroup=name;
  item.starostaId=STUDY_GROUP_STAROSTAS[name];
  if (STUDY_GROUP_ZAMS[name]) item.zamId=STUDY_GROUP_ZAMS[name];
  item.students ||= []; item.attendance ||= {}; item.lessonAttendance ||= {};
  item.activeAttendanceLessons ||= {}; item.announcements ||= [];
  item.calendarEvents ||= []; item.homework ||= [];
 }
 chat._institutionMigrationV1=true;
 if (needsSave) {
  saveDb();
  console.log('[institutions] Existing study groups assigned to institution:', institutionId);
 }
 return names.map(name=>chat.studyGroups[name]);
}
function allStudyGroups() { return Object.values(db.groups).flatMap(chat=>ensureStudyGroups(chat)); }
function studyGroupForUser(chatId,userId) {
 const chat=db.groups[String(chatId)]; if(!chat)return null;
 const id=String(userId);
 return ensureStudyGroups(chat).find(g=>String(g.starostaId||'')===id||String(g.zamId||'')===id)||null;
}
function accessibleGroups(userId) {
 const id=String(userId),u=normalizeUser(user(id));
 const groups=allStudyGroups().filter(g=>isOwner(id)||isInstitutionAdmin(id,g.institutionId)||String(g.starostaId||'')===id||String(g.zamId||'')===id||
  (isManagerRole(u)&&(g.title===u.group||g.studyGroup===u.group)));
 // Prefer the group where this user is explicitly appointed, even if they are also the bot owner.
 groups.sort((a,b)=>{
  const ownA=String(a.starostaId||'')===id||String(a.zamId||'')===id;
  const ownB=String(b.starostaId||'')===id||String(b.zamId||'')===id;
  return Number(ownB)-Number(ownA);
 });
 return groups.map(g=>({id:String(g.chatId)+'::'+String(g.studyGroup),title:String(g.studyGroup),chatId:String(g.chatId)}));
}
function managedGroup(userId,selectedGroupId='') {
 const allowed=accessibleGroups(userId);
 const selected=selectedGroupId?allowed.find(x=>x.id===String(selectedGroupId)):allowed[0];
 if(!selected)return null;
 const chat=db.groups[String(selected.chatId)]; if(!chat)return null;
 const g=ensureStudyGroups(chat).find(x=>x.studyGroup===selected.title); if(!g)return null;
 g.chatId=chat.chatId; g.chatTitle=chat.title || 'Общий чат';
 g.title=selected.title; g.scheduleGroup=selected.title;
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

function createAttendanceHtml(g, period='all') {
 const attendance=g.attendance||{},lessonAttendance=g.lessonAttendance||{},students=g.students||[];
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const labels={week:'за последние 7 дней',month:'за последние 30 дней',all:'за весь период'};
 const today=tallinnParts().year+'-'+tallinnParts().month+'-'+tallinnParts().day;
 const days=period==='week'?7:period==='month'?30:0;
 const cutoff=days?new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10))-((days-1)*86400000)).toISOString().slice(0,10):'';
 const inPeriod=date=>!cutoff||String(date)>=cutoff;
 const list=(title,items,icon)=>'<h3>'+title+' ('+items.length+')</h3>'+(items.length?'<ul>'+items.map(name=>'<li>'+icon+' '+esc(name)+'</li>').join('')+'</ul>':'<p>Нет записей</p>');
 const entries=Object.entries(lessonAttendance).map(([key,record])=>{const [date='',timeStart='',timeEnd='',subject='Занятие']=key.split('|');const present=[],absent=[],unmarked=[];for(const student of students){const name=studentName(student),status=record?.[attendanceKey(student)];if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name)}return {date,timeStart,record,html:'<section><h2>'+esc(date)+'</h2><h3>📚 '+esc(subject)+'</h3><p>🕒 '+esc(timeStart||'Время не указано')+(timeEnd?'–'+esc(timeEnd):'')+'</p>'+list('Были',present,'✅')+list('Не были',absent,'❌')+list('Не отмечены',unmarked,'▫️')+'</section>'}}).filter(x=>inPeriod(x.date)).sort((x,y)=>(x.date+' '+x.timeStart).localeCompare(y.date+' '+y.timeStart));
 const totals=students.map(student=>{let present=0,absent=0,unmarked=0;for(const entry of entries){const status=entry.record?.[attendanceKey(student)];if(status==='present')present++;else if(status==='absent')absent++;else unmarked++}const marked=present+absent;return {name:studentName(student),present,absent,unmarked,rate:marked?Math.round(present/marked*100):0}});
 const summary='<section><h2>Сводка '+(labels[period]||labels.all)+'</h2><p>Занятий с журналом: <b>'+entries.length+'</b> · Студентов: <b>'+students.length+'</b></p><h3>Посещаемость по студентам</h3><div style="overflow-x:auto"><table><thead><tr><th>Студент</th><th>Был</th><th>Не был</th><th>Не отмечен</th><th>Посещаемость</th></tr></thead><tbody>'+totals.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.present+'</td><td>'+x.absent+'</td><td>'+x.unmarked+'</td><td>'+x.rate+'%</td></tr>').join('')+'</tbody></table></div><p>Процент считается только по занятиям с отметкой «Был» или «Не был».</p></section>';
 let sections=entries.map(x=>x.html).join('');
 const legacyDates=[...new Set(Object.values(attendance).flatMap(v=>Object.keys(v||{})))].filter(inPeriod).sort();
 if(legacyDates.length)sections+='<h2>Старые записи (без привязки к паре)</h2>'+legacyDates.map(date=>{const present=[],absent=[],unmarked=[];for(const student of students){const name=studentName(student),status=attendance[attendanceKey(student)]?.[date];if(status==='present')present.push(name);else if(status==='absent')absent.push(name);else unmarked.push(name)}return '<section><h2>'+esc(date)+'</h2>'+list('Были',present,'✅')+list('Не были',absent,'❌')+list('Не отмечены',unmarked,'▫️')+'</section>'}).join('');
 if(!sections)sections='<p>За выбранный период сохранённых отметок нет.</p>';
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Посещаемость — '+esc(g.title||'Группа')+'</title><style>body{font:16px/1.5 Arial,sans-serif;max-width:950px;margin:32px auto;padding:0 16px;color:#222}h1,h2{color:#245}section{border-top:1px solid #ddd;padding:12px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}@media print{body{margin:0;max-width:none}}</style></head><body><h1>Журнал посещаемости по парам</h1><p>Группа: <b>'+esc(g.title||'Без названия')+'</b></p><p>Период: <b>'+esc(labels[period]||labels.all)+'</b></p><p>Сформировано: '+esc(new Date().toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</p>'+summary+sections+'</body></html>';
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
    const numberLabel = x.lessonNumber ? String(x.lessonNumber) + '. ' : '';
    let line = '• ' + numberLabel + (lessonTime ? lessonTime + ' — ' : '') + (x.subject || 'Занятие');
    if (x.lessonType) line += ' (' + x.lessonType + ')';
    if (x.teacher) line += '\n   👨‍🏫 ' + x.teacher;
    const room = String(x.room || '').trim();
    if (room) line += '\n   🚪 Аудитория: ' + room;
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

let calendarReminderCheckRunning = false;
async function checkCalendarEventReminders() {
  if (calendarReminderCheckRunning) return;
  calendarReminderCheckRunning = true;
  try {
    const now=tallinnParts();
    const nowStamp=Date.UTC(+now.year,+now.month-1,+now.day,+now.hour,+now.minute);
    db.sentCalendarReminders ||= {};
    for (const g of Object.values(db.groups)) {
      if (!g.chatId) continue;
      for (const event of (g.calendarEvents||[])) {
        if (!event.date || !event.time) continue;
        const match=String(event.time).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) continue;
        const [year,month,day]=String(event.date).split('-').map(Number);
        const eventStamp=Date.UTC(year,month-1,day,+match[1],+match[2]);
        const left=Math.round((eventStamp-nowStamp)/60000);
        for (const [offset,label] of [[1440,'за день'],[60,'за час']]) {
          const key=[g.chatId,event.id,offset].join('|');
          if (left!==offset || db.sentCalendarReminders[key]) continue;
          const labels={exam:'экзамен',test:'зачёт',control:'контрольная',event:'мероприятие',other:'событие'};
          const message='⏰ <b>Напоминание: '+label+'</b>\n\n'+(labels[event.type]||'событие')+': <b>'+escapeHtml(event.title)+'</b>\n📅 '+escapeHtml(event.date)+' в '+escapeHtml(event.time)+(event.description?'\n\n'+escapeHtml(event.description):'');
          try { await bot.telegram.sendMessage(g.chatId,message,{parse_mode:'HTML'}); db.sentCalendarReminders[key]=new Date().toISOString(); saveDb(); }
          catch(e) { console.error('[calendar reminder]',e.message||e); }
        }
      }
    }
  } finally { calendarReminderCheckRunning=false; }
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
              '⏰ <b>Напоминание о занятии</b>\n\nЧерез 30 минут начинается: <b>' + escapeHtml(lesson.subject) +
              '</b>\n🕒 Начало: ' + lesson.timeStart + (lesson.room ? '\n🚪 Аудитория: ' + escapeHtml(lesson.room) : ''),
              { parse_mode: 'HTML' }
            );
            db.sentLessonNotices[key] = new Date().toISOString();
            saveDb();
          }
          if (currentMinutes < startMinutes - 10 || currentMinutes > startMinutes - 9) continue;
          if (db.sentAttendancePolls[key]) continue;
          const sent = await bot.telegram.sendPoll(
            g.chatId,
            '📋 Посещаемость: ' + lesson.subject + '\nПара начинается в ' + lesson.timeStart + '. Ты будешь присутствовать?',
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


let weeklyScheduleCheckRunning = false;

function nextWeekDateRange() {
  const today = attendanceDate();
  const base = new Date(today + 'T12:00:00Z');
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + 1); // понедельник после текущего воскресенья
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

// Формирует одно расписание сразу для обеих учебных групп.
async function buildWeeklyScheduleText(range) {
  const names = Object.values(STUDY_GROUPS);
  const results = [];
  for (const name of names) {
    try {
      const lessons = await getSchedule(name, 7, range.start);
      const weekLessons = (lessons || [])
        .filter(x => x.date >= range.start && x.date <= range.end && x.subject)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
          String(a.timeStart || '').localeCompare(String(b.timeStart || '')));
      results.push({ name, lessons: weekLessons });
    } catch (error) {
      console.error('[weekly schedule] source failed for ' + name + ':', error?.message || error);
      results.push({ name, error });
    }
  }

  const signature = items => JSON.stringify(items.map(x => [
    x.date || '', x.timeStart || x.time || '', x.timeEnd || '',
    x.subject || '', x.teacher || '', x.room || ''
  ]));
  const lines = [
    '🗓 РАСПИСАНИЕ НА СЛЕДУЮЩУЮ НЕДЕЛЮ',
    '📅 ' + range.start + ' — ' + range.end,
    ''
  ];
  if (results.every(x => !x.error) && signature(results[0].lessons) === signature(results[1].lessons)) {
    lines.push('👥 Обе учебные группы — расписание совпадает', '');
    lines.push(format(results[0].lessons, 'обеих учебных групп'));
  } else {
    for (const result of results) {
      lines.push('👥 ' + result.name);
      lines.push(result.error
        ? '❌ Не удалось загрузить расписание этой учебной группы.'
        : format(result.lessons, result.name));
      lines.push('');
    }
  }
  return { text: lines.join('\n').trim(), lessonCount: results.reduce((sum, x) => sum + (x.lessons?.length || 0), 0) };
}

async function checkWeeklySchedules() {
  if (weeklyScheduleCheckRunning) return;
  const now = tallinnParts();
  // Публикуем расписание по воскресеньям начиная с 18:00 по Таллину.
  if (new Date(now.year + '-' + now.month + '-' + now.day + 'T12:00:00Z').getUTCDay() !== 0 ||
      Number(now.hour) < 18) return;

  weeklyScheduleCheckRunning = true;
  try {
    const range = nextWeekDateRange();
    db.sentWeeklySchedules ||= {};
    const targetChats = Object.values(db.groups).filter(g => g.chatId);
    for (const g of targetChats) {
      const chatId = g.chatId;
      const key = String(chatId) + ':' + range.start;
      if (db.sentWeeklySchedules[key]) continue;
      try {
        const built = await buildWeeklyScheduleText(range);
        let message = escapeHtml(built.text);
        if (message.length > 3900) message = message.slice(0, 3850) + '\n\n… расписание сокращено.';
        const sent = await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        try {
          await bot.telegram.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
        } catch (pinError) {
          console.error('[weekly schedule] pin failed for ' + (g.title || chatId) + ':', pinError?.message || pinError);
        }
        db.sentWeeklySchedules[key] = new Date().toISOString();
        saveDb();
        console.log('[weekly schedule] sent:', g.title || chatId, range.start, range.end, 'lessons:', built.lessonCount);
      } catch (error) {
        console.error('[weekly schedule] failed for ' + (g.title || chatId) + ':', error?.message || error);
      }
    }
  } finally {
    weeklyScheduleCheckRunning = false;
  }
}

let scheduleChangeCheckRunning = false;
async function checkScheduleChanges() {
  if (scheduleChangeCheckRunning) return;
  scheduleChangeCheckRunning = true;
  try {
    db.scheduleSnapshots ||= {};
    const targets = Object.values(db.groups).filter(g => g.chatId && g.scheduleGroup);
    const bySchedule = new Map();
    for (const g of targets) {
      const key = String(g.scheduleGroup).trim();
      if (!bySchedule.has(key)) bySchedule.set(key, []);
      bySchedule.get(key).push(g);
    }

    for (const [scheduleGroup, chats] of bySchedule) {
      try {
        const lessons = await getSchedule(scheduleGroup, 14);
        if (!Array.isArray(lessons)) continue;
        const today = attendanceDate();
        const monitorEndDate = new Date(today + 'T12:00:00Z');
        monitorEndDate.setUTCDate(monitorEndDate.getUTCDate() + 7);
        const monitorEnd = monitorEndDate.toISOString().slice(0, 10);
        const inAlertWindow = date => date >= today && date <= monitorEnd;
        const current = {};
        for (const lesson of lessons) {
          if (!lesson?.date || !lesson?.subject) continue;
          const key = [lesson.date, lesson.timeStart || lesson.time || '', lesson.subject].join('|');
          current[key] = {
            date: lesson.date,
            time: lesson.timeStart || lesson.time || '',
            subject: lesson.subject || '',
            teacher: lesson.teacher || '',
            room: lesson.room || '',
            timeEnd: lesson.timeEnd || ''
          };
        }

        const previous = db.scheduleSnapshots[scheduleGroup];
        // Не считаем первое успешное получение расписания изменением.
        if (!previous) {
          db.scheduleSnapshots[scheduleGroup] = current;
          saveDb();
          console.log('[schedule changes] baseline saved:', scheduleGroup, Object.keys(current).length);
          continue;
        }
        // Пустой ответ источника может быть временным сбоем — не рассылаем ложное удаление всех пар.
        if (!Object.keys(current).length && Object.keys(previous).length) {
          console.warn('[schedule changes] empty response ignored:', scheduleGroup);
          continue;
        }

        const added = [], removed = [], changed = [];
        for (const [key, item] of Object.entries(current)) {
          const old = previous[key];
          const label = (x) => [x.date, x.time, x.subject].filter(Boolean).join(' · ');
          if (!old && inAlertWindow(item.date)) added.push('➕ ' + label(item));
          else if (inAlertWindow(item.date) && (old.room !== item.room || old.teacher !== item.teacher || old.timeEnd !== item.timeEnd)) {
            const details = [];
            if (old.timeEnd !== item.timeEnd && (old.timeEnd || item.timeEnd)) details.push('время окончания: ' + (old.timeEnd || '—') + ' → ' + (item.timeEnd || '—'));
            if (old.room !== item.room) details.push('аудитория: ' + (old.room || '—') + ' → ' + (item.room || '—'));
            if (old.teacher !== item.teacher) details.push('преподаватель изменён');
            changed.push('✏️ ' + label(item) + (details.length ? '\n   ' + details.join('; ') : ''));
          }
        }
        for (const [key, item] of Object.entries(previous)) {
          if (!current[key] && inAlertWindow(item.date)) removed.push('➖ ' + [item.date, item.time, item.subject].filter(Boolean).join(' · '));
        }

        if (added.length || removed.length || changed.length) {
          const lines = ['🔔 <b>Обнаружены изменения в расписании</b>', 'Учебная группа: <b>' + escapeHtml(scheduleGroup) + '</b>', ''];
          if (added.length) lines.push('<b>Добавлено:</b>', ...added.slice(0, 12).map(escapeHtml), '');
          if (removed.length) lines.push('<b>Убрано:</b>', ...removed.slice(0, 12).map(escapeHtml), '');
          if (changed.length) lines.push('<b>Изменено:</b>', ...changed.slice(0, 12).map(escapeHtml), '');
          lines.push('Проверяй актуальное расписание в боте.');
          const message = lines.join('\n').slice(0, 3900);
          for (const g of chats) {
            try {
              await bot.telegram.sendMessage(g.chatId, message, { parse_mode: 'HTML' });
            } catch (sendError) {
              console.error('[schedule changes] notify failed for ' + (g.title || g.chatId) + ':', sendError?.message || sendError);
            }
          }
          console.log('[schedule changes] detected:', scheduleGroup, 'added:', added.length, 'removed:', removed.length, 'changed:', changed.length);
        }
        db.scheduleSnapshots[scheduleGroup] = current;
        saveDb();
      } catch (error) {
        console.error('[schedule changes] check failed for ' + scheduleGroup + ':', error?.message || error);
      }
    }
  } finally {
    scheduleChangeCheckRunning = false;
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
 const id=String(ctx.chat.id),old=db.groups[id]||{};
 db.groups[id]={...old,chatId:ctx.chat.id,title:ctx.chat.title||old.title||'Группа без названия',addedBy:old.addedBy||ctx.from.id,addedAt:old.addedAt||new Date().toISOString(),students:old.students||[],attendance:old.attendance||{}};
 ensureStudyGroups(db.groups[id]); saveDb();
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
    return ctx.reply('Формат: /grant TELEGRAM_ID [дней|навсегда]\nПримеры: /grant 123456789 30 или /grant 123456789 навсегда\nID пользователь узнаёт командой /myid.');
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
    : '✅ Подписка выдана пользователю <code>' + targetId + '</code> на ' + days + ' дн.\nДействует до: <b>' + until + ' МСК</b>.', { parse_mode: 'HTML' });
  try {
    await ctx.telegram.sendMessage(Number(targetId), forever ? '🎉 Тебе выдана пожизненная подписка!' : '🎉 Тебе выдана подписка на ' + days + ' дн.\nДействует до: ' + until + ' МСК.');
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
  return ctx.reply('Пользователь: <code>' + targetId + '</code>\nПодписка: <b>' + (active ? 'активна' : 'не активна') + '</b>\nДействует до: ' + until, { parse_mode: 'HTML' });
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
  const donations = history.filter(p => p.method === 'hosting_donation_stars');
  const manualGrants = history.filter(p => p.method === 'owner_grant').length;
  const starsTotal = starsPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const donationTotal = donations.reduce((sum, p) => sum + Number(p.amount || 0), 0);

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
    '💳 Старые оплаты подписок: <b>' + starsPayments.length + '</b> (' + starsTotal + ' ⭐)\n' +
    '💛 Пожертвований на хостинг: <b>' + donations.length + '</b> (' + donationTotal + ' ⭐)\n' +
    '🎁 Старых ручных выдач: <b>' + manualGrants + '</b>\n\n' +
    '<i>Подписки отключены. Пожертвования учитываются отдельно по истории Telegram Stars.</i>',
    { parse_mode: 'HTML' }
  );
});

bot.command('terms', ctx => ctx.reply(
  '📄 <b>Условия использования</b>\n\n' +
  'Подписка предоставляет доступ к функциям бота на оплаченный период. ' +
  'Оплата производится в Telegram Stars. Возвраты и вопросы по оплате рассматриваются через /paysupport.',
  { parse_mode: 'HTML' }
));

bot.command('paysupport', ctx => ctx.reply(
  '🆘 <b>Поддержка по оплате</b>\n\n' +
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
  let student = group?.students?.find(x =>
    String(typeof x === 'object' ? x.telegramId || '' : '') === userId
  );
  // Если Telegram ID ещё не привязан, ищем ровно одного студента по username.
  // При однозначном совпадении сохраняем ID для следующих ответов.
  if (!student && group?.students?.length && answer.user?.username) {
    const username = String(answer.user.username).replace(/^@/, '').toLowerCase();
    const matches = group.students.filter(x =>
      x && typeof x === 'object' &&
      String(x.username || '').replace(/^@/, '').toLowerCase() === username
    );
    if (matches.length === 1) {
      student = matches[0];
      if (!student.telegramId) student.telegramId = userId;
    }
  }
  if (student && record.lessonKey) {
    group.lessonAttendance ||= {};
    group.lessonAttendance[record.lessonKey] ||= {};
    group.lessonAttendance[record.lessonKey][attendanceKey(student)] =
      option === 0 ? 'present' : option === 1 ? 'absent' : 'unmarked';
  }
  saveDb();
  console.log('[attendance poll] Answer recorded for ' + userId + ' in ' + record.groupName);
});

bot.command('events', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список событий доступен в личных сообщениях.');
  const g = managedGroup(ctx.from.id);
  if (!g) return ctx.reply('❌ Команда доступна старосте или заместителю прикреплённой группы.');
  const today = attendanceDate();
  const items = (g.calendarEvents || []).filter(x => String(x.date || '') >= today)
    .sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''))).slice(0,20);
  if (!items.length) return ctx.reply('🗓 В календаре пока нет предстоящих событий.');
  const labels = { exam:'🎓 Экзамен', test:'📝 Зачёт', control:'📚 Контрольная', event:'📌 Мероприятие', other:'📅 Событие' };
  const lines = items.map((x,i) => (i+1)+'. <b>'+escapeHtml(x.title)+'</b>\n📅 '+escapeHtml(x.date)+(x.time?' · '+escapeHtml(x.time):'')+'\n'+(labels[x.type]||labels.other)+(x.description?'\n'+escapeHtml(x.description):''));
  return ctx.reply('🗓 <b>Предстоящие события · '+escapeHtml(g.title || 'Группа')+'</b>\n\n'+lines.join('\n\n'), { parse_mode:'HTML' });
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
    '📊 <b>Ответы на последний опрос</b>\n👥 ' + escapeHtml(g.title) +
    '\n📚 ' + escapeHtml(latest.subject) + '\n📅 ' + latest.date + ' в ' + latest.time +
    '\n\n✅ Будут: <b>' + yes.length + '</b>\n❌ Не будут: <b>' + no.length +
    '</b>\n▫️ Не ответили: <b>' + Math.max(0, (g.students || []).length - answers.length) +
    '</b>\n\n' + (names.length ? names.map(escapeHtml).join('\n') : 'Ответов пока нет.'),
    { parse_mode: 'HTML' }
  );
});

bot.on('callback_query', async (ctx, next) => {
  const data = String(ctx.callbackQuery?.data || '');
  const match = data.match(/^donate:(50|100|250|500)$/);
  if (match) {
    if (!isPrivate(ctx)) {
      await ctx.answerCbQuery('Пожертвование можно отправить в личке с ботом.');
      return;
    }
    const amount = Number(match[1]);
    await ctx.answerCbQuery();
    await ctx.telegram.sendInvoice(ctx.from.id, {
      title: 'Поддержка хостинга Староста Бота',
      description: 'Добровольное пожертвование на оплату нового хостинга. Не даёт дополнительных функций или преимуществ.',
      payload: 'hosting_donation_' + amount,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Добровольное пожертвование', amount }]
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
  const donationMatch = String(payment.invoice_payload || '').match(/^hosting_donation_(50|100|250|500)$/);
  if (donationMatch) {
    const u = normalizeUser(user(ctx.from.id));
    const amount = Number(payment.total_amount || donationMatch[1]);
    u.paymentHistory.push({ method: 'hosting_donation_stars', amount, currency: payment.currency || 'XTR', paidAt: new Date().toISOString(), chargeId: payment.telegram_payment_charge_id || '' });
    saveDb();
    return ctx.reply('💛 Спасибо за поддержку Староста Бота!\n\nПожертвование пойдёт на оплату нового хостинга. Благодаря тебе бот сможет продолжать работать.', menuFor(ctx));
  }
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
    '🎉 <b>Подписка активирована!</b>\n\n' +
    'Доступ действует до: <b>' +
    new Date(u.subscriptionUntil).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }) +
    ' МСК</b>.\n\n' +
    'Теперь можешь пользоваться ботом.',
    { parse_mode: 'HTML', ...menuFor(ctx) }
  );
});

bot.start(async ctx => {
  const u = normalizeUser(user(ctx.from.id));
  const startPayload = String(ctx.startPayload || '');
  if (isPrivate(ctx) && startPayload.startsWith('verify_')) {
    let requestedChatId = '';
    try { requestedChatId = Buffer.from(startPayload.slice(7), 'base64url').toString('utf8'); } catch {}
    if (!requestedChatId || String(u.pendingVerificationChatId || '') !== requestedChatId) {
      return ctx.reply('❌ Эта ссылка на проверку недействительна или уже использована. Вернись в группу и нажми кнопку проверки ещё раз.');
    }
    u.pendingFullName = true;
    saveDb();
    return ctx.reply('🔐 <b>Проверка участника группы</b>\n\nЧтобы получить возможность писать в группе «' + escapeHtml(u.pendingVerificationChatTitle || 'группа') + '», отправь своё ФИО одним сообщением (фамилия и имя, при наличии — отчество).', { parse_mode: 'HTML' });
  }
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
  '📚 <b>Команды Староста Бота</b>\n\n' +
  '📅 <b>Расписание</b>\n' +
  '/group НАЗВАНИЕ — сохранить учебную группу\n' +
  '/schedule — сегодня\n/tomorrow — завтра\n/week — неделя\n\n' +
  '👨‍🎓 <b>Студенты и посещаемость</b>\n' +
  '/role — посмотреть роль\n/students — список студентов\n/student ИМЯ — добавить вручную\n' +
  '/delstudent НОМЕР — удалить из списка\n/attendance — журнал (староста)\n' +
  '/mark НОМЕР present|absent — отметить вручную\n\n' +
  '📢 <b>Для группы</b>\n' +
  '/poll Вопрос | Вариант 1 | Вариант 2 — создать опрос\n' +
  '/hw Предмет | Задание — отправить домашнее задание\n' +
  '/groups — прикреплённые группы\n' +
  '/myid — узнать свой Telegram ID\n' +
  (isOwner(ctx.from.id) ? '\n👑 <b>Панель владельца</b>\n/admin — все команды владельца\n/stats — статистика\n/grant ID [дней|навсегда] — выдать подписку\n/revoke ID — отозвать подписку\n/subinfo ID — проверить подписку\n/setsubgroup — назначить группу с пожизненным доступом (в группе)\n/attach и /detach — прикрепить/открепить группу (в группе)\n' : '') +
  '\n💛 /donate — добровольно поддержать оплату нового хостинга',
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
  if (!scheduleGroup) return ctx.reply('Формат: /setgroup ИСП-21\nУкажи точное название группы из расписания.');
  registerGroup(ctx);
  const selected=ensureStudyGroups(db.groups[String(ctx.chat.id)]).find(g=>g.studyGroup===scheduleGroup);
  if(!selected)return ctx.reply('❌ Укажи одну из двух учебных групп: '+Object.values(STUDY_GROUPS).join(' или ')+'.');
  selected.scheduleGroup=scheduleGroup; saveDb();
  return ctx.reply('✅ Для этого чата установлена учебная группа «' + scheduleGroup + '».\n\n🗓 Каждое воскресенье после 18:00 бот будет автоматически отправлять сюда расписание на следующую неделю (понедельник–воскресенье).\n⏰ Напоминание приходит за 30 минут, опрос посещаемости — за 10 минут до пары.');
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

bot.on('photo', async (ctx, next) => {
  const u = normalizeUser(user(ctx.from.id));
  const inPrivateImport = isPrivate(ctx) && u.pendingStudentImport && !u.pendingStudentImportChatId;
  const inGroupImport = ['group', 'supergroup'].includes(ctx.chat?.type) &&
    u.pendingStudentImport && String(u.pendingStudentImportChatId || '') === String(ctx.chat.id) &&
    String(ctx.message.reply_to_message?.from?.id || '') === String(ctx.botInfo.id);
  if (!inPrivateImport && !inGroupImport) return next();
  if (inGroupImport) {
    const group = db.groups[String(ctx.chat.id)];
    if (!group || (!isOwner(ctx.from.id) && !isInstitutionAdmin(ctx.from.id, group.institutionId) && String(group.starostaId || '') !== String(ctx.from.id) && String(group.zamId || '') !== String(ctx.from.id))) {
      return ctx.reply('❌ Нет прав импортировать список в эту группу.');
    }
  }
  return ctx.reply('📷 Импорт по фото временно отключён, чтобы снизить нагрузку на сервер. Отправь список ФИО текстом — по одному человеку на строку.');
});

bot.command('importstudents',async ctx=>{
 const u=normalizeUser(user(ctx.from.id));
 if(isPrivate(ctx)){
  if(!managedGroup(ctx.from.id))return ctx.reply('Команда доступна старосте или заместителю группы.');
  u.pendingStudentImport=true;u.pendingStudentImportChatId='';delete u.pendingStudentImportReview;saveDb();
  return ctx.reply('Отправь фото списка студентов или вставь ФИО текстом — по одному человеку на строку. Я покажу результат для проверки.');
 }
 if(!['group','supergroup'].includes(ctx.chat.type))return;
 const group=db.groups[String(ctx.chat.id)];
 if(!group)return ctx.reply('Сначала прикрепи эту группу командой /attach.');
 if(!isOwner(ctx.from.id)&&!isInstitutionAdmin(ctx.from.id,group.institutionId)&&String(group.starostaId||'')!==String(ctx.from.id)&&String(group.zamId||'')!==String(ctx.from.id))
  return ctx.reply('❌ Импортировать список может только староста или заместитель этой группы.');
 u.pendingStudentImport=true;u.pendingStudentImportChatId=String(ctx.chat.id);delete u.pendingStudentImportReview;saveDb();
 return ctx.reply('📋 Отправь список ФИО ответом на это сообщение (по одному человеку на строку) или прикрепи фото списка ответом на это сообщение. Для отмены: /cancel.');
});
// Импорт списка студентов обычным текстом в личных сообщениях.
bot.command('cancel', async ctx => {
 const u=normalizeUser(user(ctx.from.id));
 if(!u.pendingStudentImport&&!u.pendingStudentImportReview)return ctx.reply('Нет активного действия для отмены.');
 if (u.pendingStudentImportChatId && String(u.pendingStudentImportChatId)!==String(ctx.chat.id)) return ctx.reply('Отмени импорт в том же чате, где начал его.');
 delete u.pendingStudentImport;delete u.pendingStudentImportChatId;delete u.pendingStudentImportReview;saveDb();
 return ctx.reply('❌ Импорт списка отменён.');
});
bot.action('studentimport:confirm', async ctx => {
 try {
  const u=normalizeUser(user(ctx.from.id));
  const groupId=String(u.pendingStudentImportChatId||'');
  if (groupId && groupId!==String(ctx.chat.id)) { await ctx.answerCbQuery('Подтверди импорт в том же чате.'); return; }
  const list=u.pendingStudentImportReview;
  if(!Array.isArray(list)||!list.length){await ctx.answerCbQuery('Список не найден. Начни импорт заново: /importstudents');return;}
  const g=groupId ? db.groups[groupId] : managedGroup(ctx.from.id);
  if(groupId && g && !isOwner(ctx.from.id) && !isInstitutionAdmin(ctx.from.id,g.institutionId) && String(g.starostaId||'')!==String(ctx.from.id) && String(g.zamId||'')!==String(ctx.from.id)) { await ctx.answerCbQuery('Нет прав для подтверждения.'); return; }
  if(!g){await ctx.answerCbQuery('Группа не найдена.');return;}
  g.students=list.slice(0,100);
  g.attendance||={};
  u.students=JSON.parse(JSON.stringify(g.students));
  delete u.pendingStudentImport;
  delete u.pendingStudentImportChatId;
  delete u.pendingStudentImportReview;
  saveDb();
  await ctx.answerCbQuery('Список сохранён!');
  const result='✅ <b>Список студентов создан!</b>\n\n👥 Группа: <b>'+escapeHtml(g.title)+'</b>\n👨‍🎓 Студентов: <b>'+g.students.length+'</b>\n\nОткрыть список: /students\nПосещаемость: /attendance';
  try { await ctx.editMessageText(result,{parse_mode:'HTML'}); }
  catch(e) { console.error('[student import confirm edit]',e.message||e); await ctx.reply(result,{parse_mode:'HTML'}); }
 } catch(e) {
  console.error('[student import confirm]',e);
  try { await ctx.answerCbQuery('Не удалось сохранить список. Попробуй ещё раз.'); } catch {}
  try { await ctx.reply('❌ Ошибка при сохранении списка. Отправь /importstudents и повтори импорт.'); } catch {}
 }
});
bot.action('studentimport:cancel', async ctx => {
 const u=normalizeUser(user(ctx.from.id));
 if(u.pendingStudentImportChatId && String(u.pendingStudentImportChatId)!==String(ctx.chat.id))return ctx.answerCbQuery('Открой сообщение в исходной группе.');
 delete u.pendingStudentImport;delete u.pendingStudentImportChatId;delete u.pendingStudentImportReview;saveDb();
 await ctx.answerCbQuery('Импорт отменён');
 return ctx.editMessageText('❌ Импорт списка отменён.');
});
bot.on('text', async (ctx,next) => {
 const u=normalizeUser(user(ctx.from.id));
 const raw=String(ctx.message.text||'').trim();
 if (!isPrivate(ctx) && ['group','supergroup'].includes(ctx.chat?.type)) {
  const groupId=String(ctx.chat.id),group=db.groups[groupId];
  const waiting=u.pendingStudentImport && String(u.pendingStudentImportChatId||'')===groupId;
  const isReply=String(ctx.message.reply_to_message?.from?.id||'')===String(ctx.botInfo.id);
  if (!waiting || !isReply || raw.startsWith('/')) return next();
  if (!group || (!isOwner(ctx.from.id) && String(group.starostaId||'')!==String(ctx.from.id) && String(group.zamId||'')!==String(ctx.from.id)))
   return ctx.reply('❌ Нет прав импортировать список в эту группу.');
  const names=parseStudentNames(raw);
  if(!names.length)return ctx.reply('Не удалось распознать ФИО. Ответь на сообщение бота списком: по одному ФИО на строку.');
  u.pendingStudentImport=false;u.pendingStudentImportReview=names;saveDb();
  const preview=names.map((name,i)=>(i+1)+'. '+escapeHtml(name)).join('\n');
  return ctx.reply('📝 <b>Проверь список студентов</b>\n👥 Группа: <b>'+escapeHtml(group.title)+'</b>\n👨‍🎓 Найдено: <b>'+names.length+'</b>\n\n'+preview+'\n\nПосле подтверждения текущий список группы будет заменён.',{parse_mode:'HTML',...importPreviewKeyboard()});
 }
 if(!isPrivate(ctx))return next();
 if (u.pendingFullName && !raw.startsWith('/')) {
  const words = raw.replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 5 || !/^[a-zа-яё -]+$/i.test(raw)) {
   return ctx.reply('❌ Не получилось распознать ФИО. Отправь фамилию и имя (при наличии — отчество) буквами, одним сообщением.');
  }
  const fullName = words.map(word => word[0].toLocaleUpperCase('ru-RU') + word.slice(1).toLocaleLowerCase('ru-RU')).join(' ');
  u.fullName = fullName;
  u.pendingFullName = false;
  const verificationChatId = String(u.pendingVerificationChatId || '');
  saveDb();
  if (verificationChatId) {
   return ctx.reply(
    '✅ ФИО сохранено: <b>' + escapeHtml(fullName) + '</b>\n\nТеперь выбери свою учебную группу:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('БИ(ЭБ)2-ОЗ/Бп/КД26', 'studygroup:2')],
      [Markup.button.callback('БИ(ЭБ)1-ОЗ/Бп/КД26', 'studygroup:1')]
    ]) }
   );
  }
  return ctx.reply('✅ ФИО сохранено: <b>' + escapeHtml(fullName) + '</b>.', { parse_mode: 'HTML', ...menuFor(ctx) });
 }
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
 if(!names.length)return ctx.reply('Не удалось распознать ФИО. Отправь по одному имени на строку, например:\nИванов Иван Иванович\nПетров Пётр Сергеевич');
 u.pendingStudentImportReview=names;u.pendingStudentImport=false;saveDb();
 const preview=names.map(name=>escapeHtml(name)).join('\n');
 return ctx.reply('📝 <b>Проверь список студентов</b>\n👥 Группа: <b>'+escapeHtml(g.title)+'</b>\n👨‍🎓 Найдено: <b>'+names.length+'</b>\n\n'+preview+'\n\nПосле подтверждения текущий список группы будет заменён этим списком.',{parse_mode:'HTML',...importPreviewKeyboard()});
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
 return '👤 <b>'+escapeHtml(name)+'</b>\n\n🔹 Username: '+escapeHtml(username)+'\n📞 Телефон: <code>'+escapeHtml(phone)+'</code>\n🆔 Telegram ID: <code>'+escapeHtml(id)+'</code>';
}
function studentCardKeyboard(i){
 return Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Изменить username','studentedit:username:'+i)],
  [Markup.button.callback('📞 Изменить телефон','studentedit:phone:'+i)],
  [Markup.button.callback('⬅️ К списку','studentback')]
 ]);
}
function formatStudentList(g) {
 return '👥 <b>'+escapeHtml(g.title)+'</b>\n👨‍🎓 Всего студентов: <b>'+(g.students||[]).length+'</b>\n\nНажми на студента, чтобы открыть карточку и изменить контакты.';
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
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('❌ Команду /zam нужно выполнить в общем учебном чате.');
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) return ctx.reply('❌ Назначить заместителя может владелец бота или администратор группы.');
  const args=String(ctx.message.text||'').trim().split(' ').filter(Boolean).slice(1);
  const groupNumber=args[0];
  if(!['1','2'].includes(groupNumber)) return ctx.reply('Укажи номер учебной группы и ответь на сообщение будущего заместителя:\n/zam 1 — заместитель 1 группы\n/zam 2 — заместитель 2 группы');
  const target = ctx.message.reply_to_message?.from || ctx.from;
  const groupName=STUDY_GROUPS[groupNumber];
  const chat=db.groups[String(ctx.chat.id)];
  if(!chat) return ctx.reply('❌ Сначала подключи чат командой /attach.');
  const studyGroup=ensureStudyGroups(chat).find(x=>x.studyGroup===groupName);
  if(!studyGroup) return ctx.reply('❌ Учебная группа не найдена.');
  if(String(studyGroup.starostaId||'')===String(target.id)) return ctx.reply('Этот пользователь уже назначен старостой выбранной группы.');
  const u=normalizeUser(user(target.id));
  u.role='zam';u.username=target.username||u.username||'';u.group=groupName;
  studyGroup.zamId=String(target.id);
  saveDb();
  return ctx.reply('⭐ '+(target.first_name||'Пользователь')+' назначен заместителем старосты группы «'+groupName+'». Теперь он может добавлять студентов командой /student, удалять через /delstudent и загружать список через /importstudents в личном чате с ботом.',studentMenu);
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
  return ctx.reply('🖥️ <b>Кабинет старосты</b>\nОткрой мини-приложение, чтобы управлять посещаемостью и смотреть группу.', {
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
  '📄 <b>Сформировать файл посещаемости?</b>\n\nБот отправит HTML-файл со всеми сохранёнными датами и отметками только в этот личный чат. Файл не будет опубликован в интернете. Убедись, что имеешь право хранить и использовать данные студентов.',
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
 const u=normalizeUser(user(ctx.from.id));
 if(!u.pendingAttendanceHtml)return ctx.answerCbQuery('Запрос устарел.');
 await ctx.answerCbQuery();
 return ctx.editMessageText('📅 <b>Выбери период отчёта:</b>',{parse_mode:'HTML',...Markup.inlineKeyboard([
  [Markup.button.callback('📆 Последние 7 дней','attendanceweb:period:week')],
  [Markup.button.callback('🗓 Последние 30 дней','attendanceweb:period:month')],
  [Markup.button.callback('📚 Весь период','attendanceweb:period:all')],
  [Markup.button.callback('❌ Отмена','attendanceweb:cancel')]
 ])});
});
bot.action(/^attendanceweb:period:(week|month|all)$/,async ctx=>{
 if(!isPrivate(ctx))return ctx.answerCbQuery('Открой бота в личке.');
 const u=normalizeUser(user(ctx.from.id));
 if(!u.pendingAttendanceHtml)return ctx.answerCbQuery('Запрос устарел.');
 const g=managedGroup(ctx.from.id),period=ctx.match[1];
 delete u.pendingAttendanceHtml;saveDb();
 if(!g)return ctx.answerCbQuery('Группа не найдена.');
 await ctx.answerCbQuery('Формирую файл…');
 try{
  const html=createAttendanceHtml(g,period);
  await ctx.editMessageText('⏳ HTML-файл сформирован, отправляю…');
  await ctx.replyWithDocument({source:Buffer.from(html,'utf8'),filename:'attendance-'+period+'.html'},{caption:'✅ Журнал посещаемости группы «'+String(g.title||'Без названия').replace(/[<>]/g,'')+'». Период: '+({week:'последние 7 дней',month:'последние 30 дней',all:'весь период'}[period])+'.'});
 }catch(error){
  const reason=String(error?.message||error||'Неизвестная ошибка').slice(0,220);
  console.error('[attendance html export]',reason);
  return ctx.reply('❌ Не удалось сформировать HTML-файл: '+reason);
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
// Управление учебными заведениями доступно только владельцам платформы в личке.
bot.command('addinstitution', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом и отправь /addinstitution.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Добавлять учебные заведения может только владелец платформы.');

  const raw = String(ctx.message?.text || '').replace(/^\/addinstitution(?:@\S+)?/i, '').trim();
  if (!raw) {
    return ctx.reply(
      '🏫 <b>Добавление учебного заведения</b>\n\n' +
      'Формат:\n<code>/addinstitution Название | Сокращение | Город</code>\n\n' +
      'Пример:\n<code>/addinstitution Колледж связи | КС | Таллин</code>\n\n' +
      'Название обязательно. Сокращение и город можно не указывать.',
      { parse_mode: 'HTML' }
    );
  }

  const parts = raw.split('|').map(value => value.trim());
  const name = String(parts[0] || '').slice(0, 120).trim();
  const shortName = String(parts[1] || '').slice(0, 40).trim();
  const city = String(parts[2] || '').slice(0, 80).trim();
  if (!name) return ctx.reply('❌ Укажи название учебного заведения.');

  db.institutions ||= {};
  const duplicate = Object.values(db.institutions).find(item =>
    item && String(item.name || '').trim().toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU') &&
    String(item.city || '').trim().toLocaleLowerCase('ru-RU') === city.toLocaleLowerCase('ru-RU')
  );
  if (duplicate) {
    return ctx.reply(
      '⚠️ Такое учебное заведение уже зарегистрировано.\n' +
      'ID: <code>' + escapeHtml(duplicate.id) + '</code>',
      { parse_mode: 'HTML' }
    );
  }

  const id = 'inst_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  db.institutions[id] = {
    id,
    name,
    shortName,
    city,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: String(ctx.from.id),
    adminIds: [],
    faculties: {}
  };
  saveDb();

  console.log('[institutions] Institution created:', id, 'by owner:', String(ctx.from.id));
  return ctx.reply(
    '✅ <b>Учебное заведение зарегистрировано!</b>\n\n' +
    '🏫 Название: <b>' + escapeHtml(name) + '</b>\n' +
    (shortName ? '🔖 Сокращение: ' + escapeHtml(shortName) + '\n' : '') +
    (city ? '📍 Город: ' + escapeHtml(city) + '\n' : '') +
    '🆔 ID: <code>' + escapeHtml(id) + '</code>\n\n' +
    'Пока оно создано отдельно: существующие группы и данные остались в основном заведении. На следующем этапе подключим администраторов и добавление групп.',
    { parse_mode: 'HTML' }
  );
});

bot.command('institutions', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список учебных заведений доступен в личных сообщениях.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Список доступен только владельцу платформы.');

  const institutions = Object.values(db.institutions || {});
  if (!institutions.length) return ctx.reply('Пока нет зарегистрированных учебных заведений.');
  const lines = institutions.map((item, index) =>
    (index + 1) + '. <b>' + escapeHtml(item.name || 'Без названия') + '</b>' +
    (item.city ? ' · ' + escapeHtml(item.city) : '') +
    '\nID: <code>' + escapeHtml(item.id) + '</code>' +
    (item.id === DEFAULT_INSTITUTION_ID ? ' · основное' : '')
  );
  return ctx.reply('🏫 <b>Учебные заведения (' + institutions.length + ')</b>\n\n' + lines.join('\n\n'), { parse_mode: 'HTML' });
});

bot.command('deleteinstitution', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом и отправь /deleteinstitution ID.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Удалять учебные заведения может только владелец платформы.');

  const id = String(ctx.message?.text || '').replace(/^\/deleteinstitution(?:@\S+)?/i, '').trim();
  if (!id) {
    return ctx.reply(
      'Формат: <code>/deleteinstitution ID</code>\n' +
      'Сначала посмотри ID командой /institutions.\n' +
      'Основное заведение удалить нельзя.',
      { parse_mode: 'HTML' }
    );
  }
  if (id === DEFAULT_INSTITUTION_ID) {
    return ctx.reply('⛔ Нельзя удалить основное учебное заведение. Оно содержит действующие группы.');
  }

  const institution = db.institutions?.[id];
  if (!institution) return ctx.reply('❌ Учебное заведение с таким ID не найдено.');

  const attachedChats = Object.values(db.groups || {}).filter(chat =>
    chat && (
      String(chat.institutionId || '') === id ||
      Object.values(chat.studyGroups || {}).some(group => group && String(group.institutionId || '') === id)
    )
  );
  if (attachedChats.length) {
    return ctx.reply('⛔ Удаление отменено: к этому заведению привязаны учебные группы. Сначала перенеси их в другое заведение.');
  }

  delete db.institutions[id];
  saveDb();
  console.log('[institutions] Institution deleted:', id, 'by owner:', String(ctx.from.id));
  return ctx.reply(
    '✅ Учебное заведение удалено.\n' +
    '🏫 ' + escapeHtml(institution.name || 'Без названия') + '\n' +
    '🆔 <code>' + escapeHtml(id) + '</code>\n\n' +
    'Основное заведение и его группы не затронуты.',
    { parse_mode: 'HTML' }
  );
});

// Управление администраторами заведений: только владельцы платформы.
bot.command('setinstadmin', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Назначать администраторов может только владелец платформы.');
  const args = String(ctx.message?.text || '').replace(/^\/setinstadmin(?:@\S+)?/i, '').trim().split(/\s+/).filter(Boolean);
  const [institutionId, userId] = args;
  const institution = db.institutions?.[String(institutionId || '')];
  if (!institution) return ctx.reply('❌ Учебное заведение не найдено. Сначала проверь ID командой /institutions.');
  if (!/^\d+$/.test(String(userId || ''))) return ctx.reply('Формат: /setinstadmin ID_ЗАВЕДЕНИЯ TELEGRAM_ID');
  if (isOwner(userId)) return ctx.reply('Этот пользователь уже является владельцем платформы.');
  institution.adminIds ||= [];
  if (!institution.adminIds.map(String).includes(String(userId))) institution.adminIds.push(String(userId));
  saveDb();
  console.log('[institutions] Admin assigned:', userId, 'institution:', institutionId, 'by owner:', String(ctx.from.id));
  return ctx.reply(
    '✅ Администратор назначен.\n\n🏫 ' + escapeHtml(institution.name || institutionId) +
    '\n👤 Telegram ID: <code>' + escapeHtml(userId) + '</code>\n\n' +
    'Права пока ограничены регистрацией в списке администраторов; управление разделами заведения подключим следующим этапом.',
    { parse_mode: 'HTML' }
  );
});

bot.command('removeinstadmin', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Снимать администраторов может только владелец платформы.');
  const args = String(ctx.message?.text || '').replace(/^\/removeinstadmin(?:@\S+)?/i, '').trim().split(/\s+/).filter(Boolean);
  const [institutionId, userId] = args;
  const institution = db.institutions?.[String(institutionId || '')];
  if (!institution) return ctx.reply('❌ Учебное заведение не найдено.');
  if (!/^\d+$/.test(String(userId || ''))) return ctx.reply('Формат: /removeinstadmin ID_ЗАВЕДЕНИЯ TELEGRAM_ID');
  institution.adminIds ||= [];
  const before = institution.adminIds.length;
  institution.adminIds = institution.adminIds.filter(id => String(id) !== String(userId));
  if (institution.adminIds.length === before) return ctx.reply('ℹ️ Этот пользователь не числится администратором данного заведения.');
  saveDb();
  console.log('[institutions] Admin removed:', userId, 'institution:', institutionId, 'by owner:', String(ctx.from.id));
  return ctx.reply('✅ Администратор <code>' + escapeHtml(userId) + '</code> снят с должности в заведении «' + escapeHtml(institution.name || institutionId) + '».', { parse_mode: 'HTML' });
});

bot.command('instadmins', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Список администраторов доступен только владельцу платформы.');
  const institutionId = String(ctx.message?.text || '').replace(/^\/instadmins(?:@\S+)?/i, '').trim();
  if (!institutionId) return ctx.reply('Формат: /instadmins ID_ЗАВЕДЕНИЯ');
  const institution = db.institutions?.[institutionId];
  if (!institution) return ctx.reply('❌ Учебное заведение не найдено.');
  const admins = Array.isArray(institution.adminIds) ? institution.adminIds : [];
  return ctx.reply(
    '👥 <b>Администраторы заведения</b>\n🏫 ' + escapeHtml(institution.name || institutionId) + '\n\n' +
    (admins.length ? admins.map((id, i) => (i + 1) + '. <code>' + escapeHtml(String(id)) + '</code>').join('\n') : 'Администраторы пока не назначены.'),
    { parse_mode: 'HTML' }
  );
});

// Структура учебного заведения: факультеты → направления → курсы.
// Команды работают только в личке и только в пределах доступного заведения.
function institutionForStructureCommand(ctx, institutionId) {
  const institution = db.institutions?.[String(institutionId || '').trim()];
  if (!institution) return { error: '❌ Учебное заведение не найдено. Проверь ID командой /institutions.' };
  if (!isInstitutionAdmin(ctx.from.id, institution.id)) {
    return { error: '❌ Нет прав на управление структурой этого учебного заведения.' };
  }
  institution.faculties ||= {};
  return { institution };
}
function structureParts(ctx, command) {
  return String(ctx.message?.text || '')
    .replace(new RegExp('^\\/' + command + '(?:@\\S+)?', 'i'), '')
    .trim().split('|').map(value => value.trim());
}
function newStructureId(prefix) {
  return prefix + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
function sameStructureName(items, name) {
  const normalized = String(name || '').trim().toLocaleLowerCase('ru-RU');
  return Object.values(items || {}).some(item =>
    String(item?.name || '').trim().toLocaleLowerCase('ru-RU') === normalized
  );
}

bot.command('addfaculty', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду используй в личке с ботом.');
  const [institutionId, name] = structureParts(ctx, 'addfaculty');
  if (!institutionId || !name) {
    return ctx.reply('Формат:\n<code>/addfaculty ID_ЗАВЕДЕНИЯ | Название факультета</code>\nID можно посмотреть через /institutions.', { parse_mode: 'HTML' });
  }
  const result = institutionForStructureCommand(ctx, institutionId);
  if (result.error) return ctx.reply(result.error);
  const institution = result.institution;
  if (sameStructureName(institution.faculties, name)) return ctx.reply('⚠️ Такой факультет уже есть в этом заведении.');
  const id = newStructureId('fac');
  institution.faculties[id] = { id, name: name.slice(0, 120), directions: {}, createdAt: new Date().toISOString() };
  saveDb();
  console.log('[institution-structure] Faculty created:', id, 'institution:', institution.id);
  return ctx.reply('✅ Факультет добавлен.\n\n🏫 ' + escapeHtml(institution.name) + '\n🎓 ' + escapeHtml(name) + '\n🆔 <code>' + id + '</code>', { parse_mode: 'HTML' });
});

bot.command('adddirection', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду используй в личке с ботом.');
  const [institutionId, facultyId, name] = structureParts(ctx, 'adddirection');
  if (!institutionId || !facultyId || !name) {
    return ctx.reply('Формат:\n<code>/adddirection ID_ЗАВЕДЕНИЯ | ID_ФАКУЛЬТЕТА | Название направления</code>\nID факультета можно посмотреть через /structure ID_ЗАВЕДЕНИЯ.', { parse_mode: 'HTML' });
  }
  const result = institutionForStructureCommand(ctx, institutionId);
  if (result.error) return ctx.reply(result.error);
  const faculty = result.institution.faculties[String(facultyId)];
  if (!faculty) return ctx.reply('❌ Факультет не найден в этом заведении.');
  faculty.directions ||= {};
  if (sameStructureName(faculty.directions, name)) return ctx.reply('⚠️ Такое направление уже есть на этом факультете.');
  const id = newStructureId('dir');
  faculty.directions[id] = { id, name: name.slice(0, 120), courses: {}, createdAt: new Date().toISOString() };
  saveDb();
  console.log('[institution-structure] Direction created:', id, 'faculty:', facultyId);
  return ctx.reply('✅ Направление добавлено.\n\n🎓 ' + escapeHtml(faculty.name) + '\n📚 ' + escapeHtml(name) + '\n🆔 <code>' + id + '</code>', { parse_mode: 'HTML' });
});

bot.command('addcourse', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду используй в личке с ботом.');
  const [institutionId, facultyId, directionId, name] = structureParts(ctx, 'addcourse');
  if (!institutionId || !facultyId || !directionId || !name) {
    return ctx.reply('Формат:\n<code>/addcourse ID_ЗАВЕДЕНИЯ | ID_ФАКУЛЬТЕТА | ID_НАПРАВЛЕНИЯ | Курс</code>\nПример названия: 1 курс.', { parse_mode: 'HTML' });
  }
  const result = institutionForStructureCommand(ctx, institutionId);
  if (result.error) return ctx.reply(result.error);
  const faculty = result.institution.faculties[String(facultyId)];
  const direction = faculty?.directions?.[String(directionId)];
  if (!direction) return ctx.reply('❌ Направление не найдено на указанном факультете.');
  direction.courses ||= {};
  if (sameStructureName(direction.courses, name)) return ctx.reply('⚠️ Такой курс уже есть у этого направления.');
  const id = newStructureId('course');
  direction.courses[id] = { id, name: name.slice(0, 80), groups: {}, createdAt: new Date().toISOString() };
  saveDb();
  console.log('[institution-structure] Course created:', id, 'direction:', directionId);
  return ctx.reply('✅ Курс добавлен.\n\n📚 ' + escapeHtml(direction.name) + '\n🎓 ' + escapeHtml(name) + '\n🆔 <code>' + id + '</code>', { parse_mode: 'HTML' });
});

bot.command('structure', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Структура доступна в личке с ботом.');
  const institutionId = String(ctx.message?.text || '').replace(/^\/structure(?:@\S+)?/i, '').trim();
  if (!institutionId) return ctx.reply('Формат: /structure ID_ЗАВЕДЕНИЯ\nID можно посмотреть через /institutions.');
  const result = institutionForStructureCommand(ctx, institutionId);
  if (result.error) return ctx.reply(result.error);
  const institution = result.institution;
  const lines = ['🏫 <b>' + escapeHtml(institution.name || institution.id) + '</b>', ''];
  const faculties = Object.values(institution.faculties || {});
  if (!faculties.length) lines.push('Пока нет факультетов. Добавь первый командой /addfaculty.');
  for (const faculty of faculties) {
    lines.push('🎓 <b>' + escapeHtml(faculty.name) + '</b>', 'ID: <code>' + escapeHtml(faculty.id) + '</code>');
    const directions = Object.values(faculty.directions || {});
    if (!directions.length) lines.push('  Направления пока не добавлены.');
    for (const direction of directions) {
      lines.push('  📚 <b>' + escapeHtml(direction.name) + '</b>', '  ID: <code>' + escapeHtml(direction.id) + '</code>');
      const courses = Object.values(direction.courses || {});
      if (!courses.length) lines.push('    Курсы пока не добавлены.');
      for (const course of courses) {
        lines.push('    • ' + escapeHtml(course.name) + ' · ID: <code>' + escapeHtml(course.id) + '</code>');
        const groups = Object.values(course.groups || {});
        for (const group of groups) lines.push('      — ' + escapeHtml(group.name || group.title || 'Учебная группа'));
      }
    }
    lines.push('');
  }
  return ctx.reply(lines.join('\n').slice(0, 3900), { parse_mode: 'HTML' });
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
function homeworkMessage(records,userId,ctx) {
  const keyboard=[];
  const text='📚 <b>Домашние задания</b>\n\n'+records.map((h,i)=>{
    const done=Boolean(h.completedBy?.[String(userId)]);
    if(h.id&&!done)keyboard.push([Markup.button.callback('✅ Выполнено: '+String(h.subject||'ДЗ').slice(0,35),'hwcomplete:'+h.id)]);
    return (i+1)+'. <b>'+escapeHtml(h.subject)+'</b> — '+escapeHtml(h.groupTitle)+'\n'+escapeHtml(h.homework)+'\n'+escapeHtml(h.createdAt||'')+'\n'+(done?'✅ Выполнение отмечено':'▫️ Ещё не отмечено');
  }).join('\n\n');
  return {text,extra:{parse_mode:'HTML',...(keyboard.length?Markup.inlineKeyboard(keyboard):{})}};
}
async function sendHomeworkAttachments(ctx, records) {
  for (const item of records) {
    const attachments = Array.isArray(item.attachments) ? item.attachments.filter(a => a?.fileId && ['photo','video'].includes(a.type)) : [];
    if (!attachments.length) continue;
    const label = '📎 Материалы к ДЗ: ' + String(item.subject || 'Без названия').slice(0, 180);
    try {
      if (attachments.length === 1) {
        const a = attachments[0];
        if (a.type === 'photo') await ctx.replyWithPhoto(a.fileId, { caption: label });
        else await ctx.replyWithVideo(a.fileId, { caption: label });
      } else {
        await ctx.replyWithMediaGroup(attachments.map(a => ({
          type: a.type,
          media: a.fileId
        })));
        await ctx.reply(label);
      }
    } catch (e) {
      console.error('[homework private media]', e?.message || e);
      await ctx.reply('⚠️ Не удалось отправить вложения к заданию «' + String(item.subject || 'Без названия').slice(0, 100) + '».');
    }
  }
}
async function showHomework(ctx) {
  const u = normalizeUser(user(ctx.from.id));
  const groupName = String(u.group || '').trim();
  const matching = Object.values(db.groups).filter(g => !groupName || String(g.scheduleGroup || '').trim() === groupName || String(g.title || '').trim() === groupName);
  const records = matching.flatMap(g => (g.homework || []).map(h => ({...h, groupTitle:g.title})));
  const latest = records.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 10);
  if (!latest.length) return ctx.reply('Пока не готово, либо ничего не задано, лучше напишите вашему старосте', menuFor(ctx));
  const view=homeworkMessage(latest,ctx.from.id,ctx);
  await ctx.reply(view.text,view.extra);
  await sendHomeworkAttachments(ctx, latest);
}
bot.hears(/^📚\\s*ДЗ\\s*$/iu, showHomework);
bot.command('dz', showHomework);
bot.action(/^hwcomplete:([a-f0-9-]{36})$/i,async ctx=>{
  const userId=String(ctx.from.id),u=normalizeUser(user(userId)),groupName=String(u.group||'').trim();
  const groups=Object.values(db.groups).filter(g=>!groupName||String(g.scheduleGroup||'').trim()===groupName||String(g.title||'').trim()===groupName);
  const item=groups.flatMap(g=>g.homework||[]).find(h=>String(h.id||'')===String(ctx.match[1]));
  if(!item){await ctx.answerCbQuery('Задание не найдено или уже удалено.');return}
  item.completedBy||={};
  if(item.completedBy[userId]){await ctx.answerCbQuery('Уже отмечено.');return}
  item.completedBy[userId]=new Date().toISOString();saveDb();
  const records=groups.flatMap(g=>(g.homework||[]).map(h=>({...h,groupTitle:g.title}))).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,10);
  const view=homeworkMessage(records,ctx.from.id,ctx);
  try{await ctx.editMessageText(view.text,view.extra)}catch(e){console.error('[homework complete view]',e?.message||e)}
  await ctx.answerCbQuery('Выполнение отмечено!');
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
 return ctx.reply(type==='username'?'✏️ Отправь username студента (например, @username). Чтобы очистить — отправь прочерк.':'📞 Отправь номер телефона в международном формате (например, +37255555555). Чтобы очистить — отправь прочерк.\nУказывай номер только если студент сам согласился его передать.\nДля отмены: /cancel');
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
 await ctx.editMessageText('📋 <b>'+escapeHtml(g.title)+'</b>\n\n'+escapeHtml(studentName(g.students[i])),{parse_mode:'HTML',...attendanceStatusButtons(i)});
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
        g.homework.push({ id: crypto.randomUUID(), subject: u.pendingHomework.subject, homework: u.pendingHomework.homework, createdAt: new Date().toISOString(), authorId: ctx.from.id, completedBy: {} });
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

// Владелец может вручную опубликовать расписание следующей недели в обе учебные группы.
bot.command('publishweek', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду /publishweek используй в личных сообщениях с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Команда доступна только владельцу бота.');

  const today = attendanceDate();
  const base = new Date(today + 'T12:00:00Z');
  const weekday = base.getUTCDay();
  const daysUntilMonday = (8 - weekday) % 7 || 7;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + daysUntilMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const iso = d => d.toISOString().slice(0, 10);
  const range = { start: iso(start), end: iso(end) };

  const targetGroups = Object.values(db.groups).filter(g => g.chatId);
  if (!targetGroups.length) {
    return ctx.reply('❌ Не нашёл ни одного прикреплённого Telegram-чата. Добавь бота в нужную группу и настрой её через /setgroup.');
  }

  await ctx.reply('⏳ Загружаю расписание обеих учебных групп на ' + range.start + ' — ' + range.end + '…');
  let sent = 0;
  let pinned = 0;
  const details = [];
  let built;
  try {
    built = await buildWeeklyScheduleText(range);
  } catch (error) {
    console.error('[publishweek] schedule build failed:', error?.message || error);
    return ctx.reply('❌ Не удалось получить расписание учебных групп. Подробности есть в логах Amvera.');
  }
  const safeMessage = built.text.length > 3900 ? built.text.slice(0, 3850) + '\n\n… расписание сокращено.' : built.text;

  for (const g of targetGroups) {
    try {
      const sentMessage = await ctx.telegram.sendMessage(g.chatId, safeMessage);
      sent++;
      try {
        await ctx.telegram.pinChatMessage(g.chatId, sentMessage.message_id, { disable_notification: true });
        pinned++;
        details.push('✅ ' + (g.title || g.chatId) + ' — отправлено и закреплено');
      } catch (pinError) {
        console.error('[publishweek] pin failed for ' + (g.title || g.chatId) + ':', pinError?.message || pinError);
        details.push('⚠️ ' + (g.title || g.chatId) + ' — отправлено, но не удалось закрепить (проверь права бота)');
      }
    } catch (error) {
      console.error('[publishweek] failed for ' + (g.title || g.chatId) + ':', error?.message || error);
      details.push('❌ ' + (g.title || g.chatId) + ' — ошибка отправки');
    }
  }
  return ctx.reply('📊 Публикация расписания обеих учебных групп завершена.\nОтправлено: ' + sent + '\nЗакреплено: ' + pinned + '\n\n' + details.join('\n'));
});
// /menu принудительно обновляет устаревшую клавиатуру Telegram в чате.
bot.command('menu', ctx => ctx.reply('⌨️ Меню обновлено.', menuFor(ctx)));
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
bot.command('donate', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Пожертвование можно отправить в личных сообщениях с ботом.');
  return ctx.reply('💛 <b>Поддержать Староста Бот</b>\n\nСейчас я собираю средства на новый хостинг, чтобы бот и мини-приложение продолжали стабильно работать.\n\nПожертвование полностью добровольное и не открывает платные функции — сейчас бот доступен бесплатно. Выбери сумму:', { parse_mode: 'HTML', ...donationKeyboard() });
});
bot.hears('💛 Поддержать хостинг', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Пожертвование можно отправить в личных сообщениях с ботом.');
  return ctx.reply('💛 <b>Поддержать Староста Бот</b>\n\nСобираю средства на новый хостинг. Пожертвование добровольное и не даёт дополнительных функций. Выбери сумму:', { parse_mode: 'HTML', ...donationKeyboard() });
});

bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('❔ Что умеет бот', ctx => ctx.reply(
  '🤖 <b>Что умеет Староста Бот</b>\n\n' +
  '📅 <b>Расписание</b> — пары на сегодня, завтра и всю неделю.\n' +
  '👥 <b>Моя группа</b> — посмотреть выбранную учебную группу.\n' +
  '📚 <b>Домашние задания</b> — смотреть задания и отмечать выполнение.\n\n' +
  (canManageAttendance(user(ctx.from.id), ctx.from.id)
    ? '⭐ <b>Возможности старосты</b>\n' +
      '• список студентов и управление им;\n' +
      '• посещаемость по отдельным парам и отчёты;\n' +
      '• создание опросов и домашних заданий;\n' +
      '• объявления и календарь важных дат в Mini App.\n\n'
    : '📱 <b>Mini App</b> — удобный кабинет с расписанием, объявлениями и календарём.\n\n') +
  'Выбирай нужный раздел кнопками внизу. Если бот только что добавили в группу, сначала подтверди ФИО и выбери свою учебную группу.',
  { parse_mode: 'HTML', ...menuFor(ctx) }
));
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Нажми «❔ Что умеет бот», чтобы посмотреть возможности.', menuFor(ctx)));

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
async function readJsonBody(req, maxBytes=32768) {
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length;if(size>maxBytes)throw new Error('Слишком большой запрос.');chunks.push(chunk); }
  const raw=Buffer.concat(chunks).toString('utf8');
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
  // Подписка временно отключена: Mini App доступен без оплаты.
  if(req.method==='GET' && url.pathname==='/api/groups') {
    const groups=accessibleGroups(tgUser.id);
    return sendJson(res,200,{groups});
  }
  const selectedGroupId=String(url.searchParams.get('groupId')||'');
  const g=managedGroup(tgUser.id,selectedGroupId);
  if(!g) return sendJson(res,403,{error:'Нет доступа к выбранной группе. Обнови список групп.'});
  if(req.method==='GET' && url.pathname==='/api/data') {
    let scheduleItems=[],scheduleError='',scheduleLoading=false;
    try {
      if(!g.scheduleGroup) throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
      const scheduleResult=getMiniAppSchedule(String(g.scheduleGroup),7);
      scheduleItems=scheduleResult.items;
      scheduleLoading=scheduleResult.loading;
    } catch(e) {
      scheduleError='Расписание временно недоступно. Остальные данные кабинета загружены; попробуй обновить позже.';
      console.error('[miniapp data] schedule unavailable for group:', g.scheduleGroup, e?.stack || e?.message || e);
    }
    const today=attendanceDate();
    const lessons=scheduleItems.filter(x=>x.date===today&&x.subject).sort((a,b)=>String(a.timeStart||'').localeCompare(String(b.timeStart||'')));
    const students=g.students||[];
    const homeworkItems=(g.homework||[]).map(h=>{
      const completedBy=h.completedBy||{},completedIds=new Set(Object.keys(completedBy));
      const completedUserNames=new Set([...completedIds].map(id=>String(db.users?.[id]?.fullName||'').trim().toLocaleLowerCase('ru-RU')).filter(Boolean));
      const isCompleted=student=>{const id=typeof student==='object'?String(student.telegramId||''):'';return (id&&completedIds.has(id))||completedUserNames.has(studentName(student).trim().toLocaleLowerCase('ru-RU'));};
      const completedStudents=students.filter(isCompleted).map(studentName);
      const pendingStudents=students.filter(student=>!isCompleted(student)).map(studentName);
      const matchedIds=new Set(students.filter(student=>typeof student==='object'&&student.telegramId).map(student=>String(student.telegramId)));
      const matchedNames=new Set(students.map(student=>studentName(student).trim().toLocaleLowerCase('ru-RU')));
      const unmatchedCompletions=[...completedIds].filter(id=>!matchedIds.has(id)&&!matchedNames.has(String(db.users?.[id]?.fullName||'').trim().toLocaleLowerCase('ru-RU'))).map(id=>String(db.users?.[id]?.fullName||db.users?.[id]?.username||'Участник без записи в списке'));
      return {id:h.id||'',subject:h.subject||'',homework:h.homework||'',attachments:(h.attachments||[]).map(a=>({type:a.type||'photo',fileName:a.fileName||'Вложение'})),createdAt:h.createdAt||'',completedCount:completedStudents.length,totalStudents:students.length,completionRate:students.length?Math.round(completedStudents.length/students.length*100):0,completedStudents,pendingStudents,unmatchedCompletions};
    }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    const homeworkWeek=homeworkItems.filter(h=>{const t=Date.parse(h.createdAt||'');return Number.isFinite(t)&&t>=Date.now()-7*86400000;});
    const homeworkWeekCompleted=homeworkWeek.reduce((n,h)=>n+h.completedCount,0),homeworkWeekPossible=homeworkWeek.reduce((n,h)=>n+h.totalStudents,0);
    const homeworkStats={week:{assignments:homeworkWeek.length,completed:homeworkWeekCompleted,possible:homeworkWeekPossible,rate:homeworkWeekPossible?Math.round(homeworkWeekCompleted/homeworkWeekPossible*100):0},all:{assignments:homeworkItems.length,completed:homeworkItems.reduce((n,h)=>n+h.completedCount,0),possible:homeworkItems.reduce((n,h)=>n+h.totalStudents,0)}};
    const mapLesson=lesson=>{
      const key=attendanceLessonKey(lesson),record=g.lessonAttendance?.[key]||{};
      let present=0,absent=0;
      for(const student of students){const status=record[attendanceKey(student)];if(status==='present')present++;else if(status==='absent')absent++;}
      return {key,date:lesson.date,timeStart:lesson.timeStart||'',timeEnd:lesson.timeEnd||'',subject:lesson.subject||'Занятие',room:lesson.room||'',teacher:lesson.teacher||'',present,absent,unmarked:students.length-present-absent};
    };
    const data=lessons.map(mapLesson);
    const scheduleData=scheduleItems.filter(x=>x.date&&x.subject).sort((a,b)=>(String(a.date).localeCompare(String(b.date))||String(a.timeStart||'').localeCompare(String(b.timeStart||'')))).map(mapLesson);
    const historyCutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const historyEntries=Object.entries(g.lessonAttendance||{}).map(([key,record])=>{
      const [date='',timeStart='',timeEnd='',subject='Занятие']=key.split('|');
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||date>today||date<historyCutoff)return null;
      let present=0,absent=0;
      for(const student of students){const status=record?.[attendanceKey(student)];if(status==='present')present++;else if(status==='absent')absent++;}
      const marked=present+absent;
      return {key,date,timeStart,timeEnd,subject,present,absent,marked,total:students.length,rate:marked?Math.round(present/marked*100):0};
    }).filter(Boolean).sort((a,b)=>(String(b.date).localeCompare(String(a.date))||String(b.timeStart).localeCompare(String(a.timeStart))));
    const summarizeHistory=days=>{
      const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
      const entries=historyEntries.filter(x=>x.date>=cutoff);
      const present=entries.reduce((n,x)=>n+x.present,0),absent=entries.reduce((n,x)=>n+x.absent,0),marked=present+absent;
      return {lessons:entries.length,present,absent,marked,rate:marked?Math.round(present/marked*100):0};
    };
    const attendanceHistory={week:summarizeHistory(7),month:summarizeHistory(30),recent:historyEntries.slice(0,12)};

    return sendJson(res,200,{user:{id:tgUser.id,firstName:tgUser.first_name||'',fullName:u.fullName||'',username:tgUser.username||'',role:u.role,institutionAdmin:isInstitutionAdmin(tgUser.id,g.institutionId),institutionId:g.institutionId||'',institutionName:db.institutions?.[String(g.institutionId||'')]?.name||''},group:g.scheduleGroup||g.title||u.group||'Учебная группа',date:today,lessons:data,scheduleLessons:scheduleData,scheduleError,students:students.map((s,i)=>{const attendance={present:0,absent:0,marked:0,rate:0},bySubject={};for(const entry of historyEntries){const status=g.lessonAttendance?.[entry.key]?.[attendanceKey(s)];if(status==='present')attendance.present++;else if(status==='absent')attendance.absent++;if(status==='present'||status==='absent'){const subject=String(entry.subject||'Занятие').trim()||'Занятие';bySubject[subject]||={subject,present:0,absent:0,marked:0,rate:0};bySubject[subject][status]++;}}attendance.marked=attendance.present+attendance.absent;attendance.rate=attendance.marked?Math.round(attendance.present/attendance.marked*100):0;const attendanceBySubject=Object.values(bySubject).map(x=>{x.marked=x.present+x.absent;x.rate=x.marked?Math.round(x.present/x.marked*100):0;return x;}).sort((a,b)=>a.subject.localeCompare(b.subject,'ru'));return {index:i,name:studentName(s),attendanceBySubject,statuses:Object.fromEntries(data.map(lesson=>[lesson.key,g.lessonAttendance?.[lesson.key]?.[attendanceKey(s)]||'unmarked'])),attendance30d:attendance,attendanceHistory:historyEntries.map(entry=>{const status=g.lessonAttendance?.[entry.key]?.[attendanceKey(s)];return status==='present'||status==='absent'?{date:entry.date,timeStart:entry.timeStart,subject:entry.subject,status}:null;}).filter(Boolean)};}),announcements:(g.announcements||[]).slice(-30).reverse(),homework:homeworkItems,homeworkStats,calendarEvents:(g.calendarEvents||[]).filter(x=>x.date>=today).sort((a,b)=>(String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||'')))),attendanceHistory,scheduleLoading});
  }
  if(req.method==='DELETE' && url.pathname==='/api/students') {
    const count=(g.students||[]).length;
    if(!count) return sendJson(res,400,{error:'Список студентов уже пуст.'});
    g.students=[];
    saveDb();
    console.log('[miniapp students] roster cleared', {group:g.title||'',by:String(tgUser.id),count});
    return sendJson(res,200,{ok:true,deleted:count});
  }
  if(req.method==='POST' && url.pathname==='/api/profile') {
    try {
      const body=await readJsonBody(req);
      const fullName=String(body.fullName||'').replace(/\s+/g,' ').trim();
      if(fullName.length<5 || fullName.length>100) return sendJson(res,400,{error:'Укажи ФИО длиной от 5 до 100 символов.'});
      if(!/^[\p{L}][\p{L}\s.'’-]*$/u.test(fullName) || fullName.split(' ').filter(Boolean).length<2) return sendJson(res,400,{error:'Укажи корректные фамилию и имя (при наличии — отчество).'});
      u.fullName=fullName.split(' ').map(part=>part[0].toLocaleUpperCase('ru-RU')+part.slice(1)).join(' ');
      saveDb();
      return sendJson(res,200,{ok:true,fullName:u.fullName});
    } catch(e) {
      console.error('[miniapp profile update]',e?.message||e);
      return sendJson(res,400,{error:'Не удалось сохранить профиль.'});
    }
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
  if(req.method==='POST' && url.pathname==='/api/homework-media-upload') {
    try {
      const body=await readJsonBody(req,12*1024*1024),fileName=String(body.fileName||'attachment').slice(0,120),mimeType=String(body.mimeType||'').toLowerCase();
      const imageTypes=['image/jpeg','image/png'],videoTypes=['video/mp4'];
      const type=imageTypes.includes(mimeType)?'photo':videoTypes.includes(mimeType)?'video':'';
      if(!type)return sendJson(res,400,{error:'Поддерживаются JPG, PNG, WebP, MP4, WebM и MOV.'});
      const encoded=String(body.data||'').replace(/^data:[^;]+;base64,/,'');
      if(!encoded||encoded.length>11*1024*1024)return sendJson(res,413,{error:'Файл слишком большой. Максимум 8 МБ.'});
      const buffer=Buffer.from(encoded,'base64');
      if(!buffer.length||buffer.length>8*1024*1024)return sendJson(res,413,{error:'Файл слишком большой. Максимум 8 МБ.'});
      const message=type==='photo'?await bot.telegram.sendPhoto(String(tgUser.id),{source:buffer,filename:fileName}):await bot.telegram.sendVideo(String(tgUser.id),{source:buffer,filename:fileName});
      const fileId=type==='photo'?message.photo?.[message.photo.length-1]?.file_id:message.video?.file_id;
      if(!fileId)throw new Error('Telegram не вернул file_id вложения.');
      try{await bot.telegram.deleteMessage(String(tgUser.id),message.message_id)}catch(e){console.warn('[homework media cleanup]',e?.message||e)}
      g.pendingHomeworkMedia||={};const ownerKey=String(tgUser.id),pending=g.pendingHomeworkMedia[ownerKey]||{};
      for(const [key,value] of Object.entries(pending))if(Date.now()-Number(value.createdAt||0)>2*60*60*1000)delete pending[key];
      const id=crypto.randomUUID();pending[id]={fileId,type,fileName,mimeType:type==='photo'?'image/jpeg':mimeType,createdAt:Date.now()};g.pendingHomeworkMedia[ownerKey]=pending;saveDb();
      return sendJson(res,200,{ok:true,attachment:{id,type,fileName}});
    } catch(e) {console.error('[miniapp homework media upload]',e?.message||e);return sendJson(res,400,{error:'Не удалось загрузить вложение. Проверь размер файла и доступ бота к личным сообщениям.'});}
  }
  if(req.method==='GET' && url.pathname==='/api/homework-media') {
    try {
      const homeworkId=String(url.searchParams.get('id')||''),index=Number(url.searchParams.get('index')||0),item=(g.homework||[]).find(x=>String(x.id||'')===homeworkId),attachment=Number.isInteger(index)&&index>=0?item?.attachments?.[index]:null;
      if(!attachment?.fileId)return sendJson(res,404,{error:'Вложение не найдено.'});
      const fileUrl=await bot.telegram.getFileLink(attachment.fileId),upstream=await fetch(String(fileUrl));
      if(!upstream.ok)throw new Error('Telegram file fetch failed: '+upstream.status);
      const buffer=Buffer.from(await upstream.arrayBuffer()),mime=attachment.mimeType||(attachment.type==='photo'?'image/jpeg':'video/mp4');
      res.writeHead(200,{'Content-Type':mime,'Content-Length':buffer.length,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});return res.end(buffer);
    } catch(e) {console.error('[miniapp homework media view]',e?.message||e);return sendJson(res,502,{error:'Не удалось открыть вложение.'});}
  }
  if(req.method==='POST' && url.pathname==='/api/homework') {
    try {
      const body=await readJsonBody(req),subject=String(body.subject||'').trim(),homework=String(body.homework||'').trim();
      if(!subject||subject.length>100)return sendJson(res,400,{error:'Укажи предмет (до 100 символов).'});
      if(!homework||homework.length>3500)return sendJson(res,400,{error:'Укажи задание (до 3500 символов).'});
      if(!g.chatId)return sendJson(res,400,{error:'К группе не привязан Telegram-чат. Сначала выполни /attach в группе.'});
      const pending=g.pendingHomeworkMedia?.[String(tgUser.id)]||{},requested=Array.isArray(body.attachments)?body.attachments:[];
      if(requested.length>10)return sendJson(res,400,{error:'К одному ДЗ можно прикрепить не более 10 файлов.'});
      const attachments=[];
      for(const entry of requested){const media=pending[String(entry?.id||'')];if(!media)return sendJson(res,400,{error:'Одно из вложений устарело. Прикрепи файл ещё раз.'});attachments.push({fileId:media.fileId,type:media.type,fileName:media.fileName,mimeType:media.mimeType});}
      const item={id:crypto.randomUUID(),subject,homework,attachments,createdAt:new Date().toISOString(),authorId:String(tgUser.id),completedBy:{}};
      g.homework||=[];g.homework.push(item);if(g.homework.length>100)g.homework=g.homework.slice(-100);
      for(const entry of requested)delete pending[String(entry.id)];
      saveDb();
      try {
        await bot.telegram.sendMessage(g.chatId,'📚 <b>Новое домашнее задание</b>\n\n<b>'+escapeHtml(subject)+'</b>\n'+escapeHtml(homework),{parse_mode:'HTML'});
        if(attachments.length===1){const a=attachments[0];if(a.type==='photo')await bot.telegram.sendPhoto(g.chatId,a.fileId,{caption:'📎 Материал к ДЗ: '+subject});else await bot.telegram.sendVideo(g.chatId,a.fileId,{caption:'📎 Материал к ДЗ: '+subject});}
        else if(attachments.length>1)await bot.telegram.sendMediaGroup(g.chatId,attachments.map(a=>({type:a.type,media:a.fileId})));
      } catch(e) {console.error('[homework group publish]',e?.message||e);}
      return sendJson(res,200,{ok:true,homework:item});
    } catch(e) {console.error('[miniapp homework create]',e?.message||e);return sendJson(res,502,{error:'Не удалось создать домашнее задание.'});}
  }
  if(req.method==='PUT' && url.pathname==='/api/homework') {
    try {
      const body=await readJsonBody(req),id=String(body.id||''),subject=String(body.subject||'').trim(),homework=String(body.homework||'').trim();
      const item=(g.homework||[]).find(x=>String(x.id||'')===id);
      if(!item)return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      if(!subject||subject.length>100||!homework||homework.length>3500)return sendJson(res,400,{error:'Проверь предмет и текст задания.'});
      let added=[];
      if(Array.isArray(body.attachments)){
        if(body.attachments.length>10)return sendJson(res,400,{error:'К одному ДЗ можно прикрепить не более 10 файлов.'});
        const pending=g.pendingHomeworkMedia?.[String(tgUser.id)]||{},next=[];
        for(const entry of body.attachments){
          if(Number.isInteger(entry?.index)){
            const old=item.attachments?.[entry.index];if(!old)return sendJson(res,400,{error:'Одно из старых вложений не найдено.'});next.push(old);
          }else if(entry?.id){
            const media=pending[String(entry.id)];if(!media)return sendJson(res,400,{error:'Новое вложение устарело. Прикрепи его ещё раз.'});
            const saved={fileId:media.fileId,type:media.type,fileName:media.fileName,mimeType:media.mimeType};next.push(saved);added.push(saved);delete pending[String(entry.id)];
          }else return sendJson(res,400,{error:'Некорректное вложение.'});
        }
        item.attachments=next;
      }
      Object.assign(item,{subject,homework,updatedAt:new Date().toISOString()});saveDb();
      if(g.chatId)try{
        await bot.telegram.sendMessage(g.chatId,'✏️ <b>Изменено домашнее задание</b>\n\n<b>'+escapeHtml(subject)+'</b>\n'+escapeHtml(homework),{parse_mode:'HTML'});
        if(added.length===1){const a=added[0];if(a.type==='photo')await bot.telegram.sendPhoto(g.chatId,a.fileId,{caption:'📎 Дополнительный материал к ДЗ: '+subject});else await bot.telegram.sendVideo(g.chatId,a.fileId,{caption:'📎 Дополнительный материал к ДЗ: '+subject});}
        else if(added.length>1)await bot.telegram.sendMediaGroup(g.chatId,added.map(a=>({type:a.type,media:a.fileId})));
      }catch(e){console.error('[homework update notify]',e?.message||e);}
      return sendJson(res,200,{ok:true,homework:item});
    } catch(e) {console.error('[miniapp homework update]',e?.message||e);return sendJson(res,400,{error:'Не удалось изменить ДЗ.'});}
  }
  if(req.method==='DELETE' && url.pathname==='/api/homework') {
    try {
      const body=await readJsonBody(req),id=String(body.id||''),before=(g.homework||[]).length;
      g.homework=(g.homework||[]).filter(x=>String(x.id||'')!==id);
      if(g.homework.length===before)return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      saveDb();return sendJson(res,200,{ok:true});
    } catch(e) {console.error('[miniapp homework delete]',e?.message||e);return sendJson(res,400,{error:'Не удалось удалить ДЗ.'});}
  }
  if(req.method==='POST' && url.pathname==='/api/events') {
    try {
      const body=await readJsonBody(req);
      const title=String(body.title||'').trim();
      const date=String(body.date||'').trim();
      const time=String(body.time||'').trim();
      const type=String(body.type||'other').trim();
      const description=String(body.description||'').trim();
      if(!title) return sendJson(res,400,{error:'Укажи название события.'});
      if(title.length>120) return sendJson(res,400,{error:'Название слишком длинное (максимум 120 символов).'});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) return sendJson(res,400,{error:'Укажи корректную дату.'});
      if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return sendJson(res,400,{error:'Укажи время в формате ЧЧ:ММ.'});
      if(!['exam','test','control','event','other'].includes(type)) return sendJson(res,400,{error:'Неизвестный тип события.'});
      if(description.length>500) return sendJson(res,400,{error:'Описание слишком длинное (максимум 500 символов).'});
      g.calendarEvents ||= [];
      const event={id:crypto.randomUUID(),title,date,time,type,description,authorId:String(tgUser.id),createdAt:new Date().toISOString()};
      g.calendarEvents.push(event);
      g.calendarEvents.sort((a,b)=>(String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||''))));
      saveDb();
      if (g.chatId) {
        const typeLabels={exam:'Экзамен',test:'Зачёт',control:'Контрольная',event:'Мероприятие',other:'Событие'};
        const notice='📌 <b>Добавлено событие в календарь</b>\n\n<b>'+escapeHtml(event.title)+'</b>\n📅 '+escapeHtml(event.date)+(event.time?' · '+escapeHtml(event.time):'')+'\n'+(typeLabels[event.type]||'Событие')+(event.description?'\n'+escapeHtml(event.description):'');
        try { await bot.telegram.sendMessage(g.chatId,notice,{parse_mode:'HTML'}); }
        catch(e) { console.error('[calendar event notify]',e?.message||e); }
      }
      return sendJson(res,200,{ok:true,event});
    } catch(e) {
      console.error('[miniapp event create]',e?.message||e);
      return sendJson(res,400,{error:'Не удалось сохранить событие.'});
    }
  }
  if(req.method==='PUT' && url.pathname==='/api/events') {
    try {
      const body=await readJsonBody(req), id=String(body.id||'');
      const event=(g.calendarEvents||[]).find(x=>String(x.id)===id);
      if(!event) return sendJson(res,404,{error:'Событие не найдено.'});
      const title=String(body.title||'').trim(), date=String(body.date||'').trim();
      const time=String(body.time||'').trim(), type=String(body.type||'other').trim();
      const description=String(body.description||'').trim();
      if(!title || title.length>120) return sendJson(res,400,{error:'Укажи название до 120 символов.'});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) return sendJson(res,400,{error:'Укажи корректную дату.'});
      if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return sendJson(res,400,{error:'Укажи время в формате ЧЧ:ММ.'});
      if(!['exam','test','control','event','other'].includes(type)) return sendJson(res,400,{error:'Неизвестный тип события.'});
      if(description.length>500) return sendJson(res,400,{error:'Описание слишком длинное (максимум 500 символов).'});
      Object.assign(event,{title,date,time,type,description,updatedAt:new Date().toISOString()});
      g.calendarEvents.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||'')));
      for(const key of Object.keys(db.sentCalendarReminders||{})) if(key.includes('|'+id+'|')) delete db.sentCalendarReminders[key];
      saveDb();
      return sendJson(res,200,{ok:true,event});
    } catch(e) { console.error('[miniapp event update]',e?.message||e); return sendJson(res,400,{error:'Не удалось обновить событие.'}); }
  }
  if(req.method==='DELETE' && url.pathname==='/api/events') {
    try {
      const body=await readJsonBody(req);
      const id=String(body.id||'');
      const before=(g.calendarEvents||[]).length;
      g.calendarEvents=(g.calendarEvents||[]).filter(x=>String(x.id)!==id);
      if(g.calendarEvents.length===before) return sendJson(res,404,{error:'Событие уже удалено или не найдено.'});
      saveDb();
      return sendJson(res,200,{ok:true});
    } catch(e) {
      console.error('[miniapp event delete]',e?.message||e);
      return sendJson(res,400,{error:'Не удалось удалить событие.'});
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
  const startedAt = Date.now();
  const url = new URL(req.url || '/', 'http://localhost');
  // Логируем только метод, путь, статус и длительность — без query-параметров и пользовательских данных.
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/') || url.pathname === '/app' || url.pathname === '/app/') {
      console.log('[http timing]', req.method, url.pathname, res.statusCode, Date.now() - startedAt + 'ms');
    }
  });
  if (url.pathname.startsWith('/api/')) return handleMiniAppApi(req,res,url);
  if (url.pathname === '/telegram-web-app.js') {
    try {
      const sdkFile = new URL('./webapp/telegram-web-app.js', import.meta.url);
      const sdk = fs.readFileSync(sdkFile, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(sdk);
    } catch (e) {
      console.error('[miniapp sdk]', e.message || e);
      res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Telegram WebApp SDK не найден.');
    }
  }
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
  // Выполняем миграцию tenant-привязок при старте, а не ждём первого действия старосты.
  let migratedChatCount = 0;
  let migratedStudyGroupCount = 0;
  for (const chat of Object.values(db.groups || {})) {
    if (!chat) continue;
    const before = Boolean(chat._institutionMigrationV1);
    const groups = ensureStudyGroups(chat);
    migratedStudyGroupCount += groups.length;
    if (!before && chat._institutionMigrationV1) migratedChatCount += 1;
  }
  console.log(
    '[institutions] Startup check complete:',
    'chats=' + Object.keys(db.groups || {}).length,
    'studyGroups=' + migratedStudyGroupCount,
    'newlyMigratedChats=' + migratedChatCount,
    'institutions=' + Object.keys(db.institutions || {}).length
  );

  healthServer.listen(port, '0.0.0.0', () => {
    console.log('[health] HTTP сервер слушает 0.0.0.0:' + port);
  });

  await telegramStartupRequest('deleteWebhook', () => bot.telegram.deleteWebhook({ drop_pending_updates: false }));
  const me = await telegramStartupRequest('getMe', () => bot.telegram.getMe());
  console.log('Бот запущен: @' + me.username);

  // Отправляем список изменений и уведомление о перезапуске всем владельцам.
  if (OWNER_TELEGRAM_IDS.length && db.lastNotifiedRelease !== BOT_RELEASE_VERSION) {
    const releaseMessage =
      '🚀 <b>Староста Бот обновлён</b>\n' +
      'Версия: <b>' + BOT_RELEASE_VERSION + '</b>\n\n' +
      '<b>Что нового:</b>\n' +
      BOT_RELEASE_NOTES.map(item => '• ' + escapeHtml(item)).join('\n');
    let releaseSent = false;
    for (const ownerId of OWNER_TELEGRAM_IDS) {
      try {
        await bot.telegram.sendMessage(ownerId, releaseMessage, { parse_mode: 'HTML' });
        releaseSent = true;
        console.log('[startup] Уведомление об обновлении отправлено владельцу: ' + ownerId);
      } catch (e) {
        console.error('[release notification] Не удалось уведомить владельца ' + ownerId + ':', e.message || e);
      }
    }
    if (releaseSent) {
      db.lastNotifiedRelease = BOT_RELEASE_VERSION;
      saveDb();
    }
  }


  // Публикуем каждую новую версию в канал отдельно от личных уведомлений владельцам.
  if (RELEASE_CHANNEL && db.lastPublishedRelease !== BOT_RELEASE_VERSION) {
    const channelReleaseMessage =
      '👋 <b>Всем привет! Я — Староста Бот.</b>\n\n' +
      'Я создан, чтобы учебная жизнь группы стала проще: расписание, посещаемость, домашние задания и важные объявления — в одном месте.\n\n' +
      '📚 <b>Что я умею:</b>\n' +
      '• Показываю расписание на сегодня, завтра и всю неделю.\n' +
      '• Помогаю старостам вести списки студентов и отмечать посещаемость по отдельным парам.\n' +
      '• Позволяю публиковать домашние задания и объявления.\n' +
      '• Содержу календарь событий и статистику посещаемости.\n' +
      '• Открываю удобный личный кабинет в Mini App.\n\n' +
      '🎓 <b>Для наших учебных групп:</b>\n' +
      'БИ(ЭБ)1-ОЗ/Бп/КД26\n' +
      'БИ(ЭБ)2-ОЗ/Бп/КД26\n\n' +
      '🤖 <b>Как начать?</b> Откройте бота, выберите свою учебную группу и пользуйтесь нужными разделами.\n\n' +
      '🛠 <b>Мы продолжаем развивать проект.</b> Здесь будем публиковать новости, изменения и полезные обновления. Спасибо, что пользуетесь Староста Ботом!\n\n' +
      'Актуальная версия: <b>' + BOT_RELEASE_VERSION + '</b>';
    try {
      await bot.telegram.sendMessage(RELEASE_CHANNEL, channelReleaseMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '🤖 Открыть бота', url: 'https://t.me/starostagivbot' },
            { text: '📱 Открыть Mini App', url: 'https://starostabotgiv-givenchy06.msk1.amvera.tech/app' }
          ]]
        }
      });
      db.lastPublishedRelease = BOT_RELEASE_VERSION;
      saveDb();
      console.log('[release channel] Приветственная публикация отправлена: ' + BOT_RELEASE_VERSION);
    } catch (e) {
      console.error('[release channel] Не удалось опубликовать пост. Проверьте права администратора канала:', e.message || e);
    }
  }

  for (const ownerId of OWNER_TELEGRAM_IDS) {
    try {
      await bot.telegram.sendMessage(
        ownerId,
        '🔄 <b>Староста Бот перезапущен</b>\nБот снова работает и готов принимать команды.',
        { parse_mode: 'HTML' }
      );
      console.log('[startup] Уведомление о перезапуске отправлено владельцу: ' + ownerId);
    } catch (e) {
      console.error('[restart notification] Не удалось уведомить владельца ' + ownerId + ':', e.message || e);
    }
  }
  if (!OWNER_TELEGRAM_IDS.length) {
    console.warn('[restart notification] Список владельцев пуст — уведомления не отправлены.');
  }

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
    { command: 'events', description: 'Предстоящие события группы' }
  ], { scope: { type: 'all_private_chats' } }));

  await telegramStartupRequest('setMyCommands groups', () => bot.telegram.setMyCommands([], { scope: { type: 'all_group_chats' } }));

  await telegramStartupRequest('setMyCommands owner', () => bot.telegram.setMyCommands([
    { command: 'admin', description: 'Панель владельца' },
    { command: 'stats', description: 'Статистика' },
    { command: 'grant', description: 'Выдать подписку' },
    { command: 'revoke', description: 'Отозвать подписку' },
    { command: 'subinfo', description: 'Проверить подписку' },
    { command: 'addinstitution', description: 'Добавить учебное заведение' },
    { command: 'institutions', description: 'Список учебных заведений' },
    { command: 'setinstadmin', description: 'Назначить администратора заведения' },
    { command: 'removeinstadmin', description: 'Снять администратора заведения' },
    { command: 'instadmins', description: 'Список администраторов заведения' }
  ], { scope: { type: 'chat', chat_id: Number(OWNER_TELEGRAM_ID) } }));
  for (const ownerId of OWNER_TELEGRAM_IDS) {
    if (ownerId === OWNER_TELEGRAM_ID) continue;
    await telegramStartupRequest('setMyCommands owner ' + ownerId, () => bot.telegram.setMyCommands([
      { command: 'admin', description: 'Панель администратора' },
      { command: 'stats', description: 'Статистика бота' },
      { command: 'groups', description: 'Список учебных групп' },
      { command: 'students', description: 'Список студентов' },
      { command: 'grant', description: 'Выдать подписку' },
      { command: 'revoke', description: 'Отозвать подписку' },
      { command: 'subinfo', description: 'Проверить подписку' },
      { command: 'addinstitution', description: 'Добавить учебное заведение' },
      { command: 'institutions', description: 'Список учебных заведений' },
      { command: 'setinstadmin', description: 'Назначить администратора заведения' },
      { command: 'removeinstadmin', description: 'Снять администратора заведения' },
      { command: 'instadmins', description: 'Список администраторов заведения' }
    ], { scope: { type: 'chat', chat_id: Number(ownerId) } }));
  }

  console.log('[deploy-check] AMVERA_TEST_2026_11_19');
  await bot.launch({ dropPendingUpdates: false, allowedUpdates: ['message', 'callback_query', 'poll_answer', 'pre_checkout_query', 'chat_member'] });
  await checkAutomaticAttendancePolls();
  setInterval(checkAutomaticAttendancePolls, 30000).unref();
  await checkCalendarEventReminders();
  setInterval(checkCalendarEventReminders, 30000).unref();
  await checkWeeklySchedules();
  setInterval(checkWeeklySchedules, 60000).unref();
setInterval(checkScheduleChanges, 5 * 60 * 1000).unref();
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
