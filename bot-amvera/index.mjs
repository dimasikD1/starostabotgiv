import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Telegraf, Markup } from 'telegraf';
import { getSchedule } from './schedule/ruc-entry.mjs';
import { ScheduleCache } from './schedule/cache-entry.mjs';
import { formatSchedule, nextWeekDateRange, nextMondayDateRange, currentMondayDateRange, buildWeeklyScheduleText } from './schedule/presentation-entry.mjs';
import { buildScheduleView } from './schedule/schedule-view-entry.mjs';
import { resolveScheduleGroupName } from './schedule/schedule-view-entry.mjs';
import { buildScheduleSnapshot, diffScheduleSnapshots, analyzeScheduleSnapshot } from './schedule/changes-entry.mjs';
import { buildWeeklySchedulePublicationKey, getPendingWeeklyScheduleTargets, groupScheduleTargetsByGroup, getScheduleChangeMonitorEnd, buildScheduleChangeMessage, isWeeklySchedulePublicationWindow, WEEKLY_SCHEDULE_CHECK_INTERVAL_MS, SCHEDULE_CHANGE_CHECK_INTERVAL_MS } from './schedule/notifications-entry.mjs';
import { buildAttendanceScheduleTasks } from './schedule/notifications-entry.mjs';
import { parseStudentNames } from './domain/student-import-entry.mjs';
import { normalizeUser } from './domain/user-normalization-entry.mjs';
import { getOrCreateUser, isManagerRole, roleLabel, studentName, attendanceKey } from './domain/user-profile-entry.mjs';
import { createGroupAccess } from './domain/group-access-entry.mjs';
import { isTelegramGroupAdmin } from './domain/telegram-admin-access-entry.mjs';
import { getMissingTelegramBotPermissions } from './domain/telegram-bot-permissions-entry.mjs';
import { buildOpenChatPermissions } from './domain/chat-permissions-entry.mjs';
import { buildAttendanceLessonKey, classifyAttendance, setLessonAttendanceStatus, paginateAttendanceStudents, getAttendanceLessonAt, buildMiniAppAttendanceLessons } from './domain/attendance-core-entry.mjs';
import { buildMiniAppGroupData } from './domain/miniapp-data-entry.mjs';
import { formatDailyAttendance, formatSingleLessonAttendance } from './domain/attendance-presentation-entry.mjs';
import { createAttendanceHtml as buildAttendanceHtml } from './domain/attendance-report-entry.mjs';
import { findAttendancePollRecord, applyAttendancePollAnswer } from './domain/attendance-polls-entry.mjs';
import { parseHomeworkCommand, createHomeworkRecord, appendHomework, getHomeworkCompletionState, buildHomeworkCompletionStatistics, markHomeworkCompleted, latestHomework } from './domain/homework-entry.mjs';
import { addTelegramStudent, addNamedStudent, removeStudentAt, updateStudentField, assignStudyGroupRole, clearStudyGroupRoles, setStudentRole, normalizeStudentUsername, normalizeStudentPhone, assignStudyGroupRoleByNumber, removeGroupRolesAndSetStudent, getStudentRosterPage, getStudentCard, replaceStudentRoster, confirmStudentRosterImport } from './domain/student-management-entry.mjs';
import { addTelegramStudentAndSave, addNamedStudentAndSave, removeStudentAtAndSave, updateStudentContactAndSave } from './domain/student-roster-workflows-entry.mjs';
import { createFaculty, createDirection, createCourse, hasDuplicateStructureName } from './domain/institution-structure-entry.mjs';
import { createFacultyAndSave, createDirectionAndSave, createCourseAndSave, linkStudyGroupToCourseAndSave, unlinkStudyGroupFromStructureAndSave } from './domain/institution-structure-workflows-entry.mjs';
import { createInstitutionAndSave, deleteInstitutionAndSave, addInstitutionAdminAndSave, removeInstitutionAdminAndSave } from './domain/institution-workflows-entry.mjs';
import { isInstitutionAdminId, addInstitutionAdmin, removeInstitutionAdmin, listInstitutionAdmins, checkInstitutionAccess } from './domain/institution-admins-entry.mjs';
import { listInstitutions, createInstitution, deleteInstitution } from './domain/institutions-entry.mjs';
import { ensureStudyGroups as ensureStudyGroupsData } from './domain/study-groups-entry.mjs';
import { registerGroup as registerGroupData, removeGroup as removeGroupData } from './domain/group-registry-entry.mjs';
import { escapeHtml } from './utils/html-entry.mjs';

import { resolveTimeZone, formatDateInTimeZone, getTimeZoneParts } from './utils/time-zone-entry.mjs';
import { resolveMiniAppRequestContext } from './api/miniapp-request-context-entry.mjs';
import { resolveMiniAppGroupAccess } from './api/miniapp-group-access-entry.mjs';
import { loadMiniAppSchedule } from './api/miniapp-schedule-loader-entry.mjs';
import { updateMiniAppProfile, clearMiniAppStudentRoster } from './api/miniapp-profile-entry.mjs';
import { updateMiniAppAttendance } from './api/miniapp-attendance-entry.mjs';
import { publishMiniAppAnnouncement } from './api/miniapp-announcement-entry.mjs';
import { createMiniAppHomework, updateMiniAppHomeworkRecord, deleteMiniAppHomeworkRecord } from './api/miniapp-records-entry.mjs';
import { listManagedMiniAppTelegramChats, performMiniAppTelegramChatAction } from './api/miniapp-telegram-chats-entry.mjs';
import { getMiniAppAccessibleGroups, clearMiniAppRosterAndSave } from './api/miniapp-group-management-entry.mjs';
import { buildMiniAppDataResponse } from './api/miniapp-data-response-entry.mjs';
import { createApiRateLimiter } from './api/rate-limit-entry.mjs';
import { isMiniAppManagerWriteRoute } from './api/miniapp-route-policy-entry.mjs';
import { sendJsonResponse as sendJson, sendTextResponse as sendText } from './api/http-response-entry.mjs';
import { sanitizeMiniAppClientError } from './api/miniapp-client-error-entry.mjs';
import { verifyTelegramWebAppInitData } from './api/telegram-webapp-auth-entry.mjs';
import { readJsonBody } from './api/json-body-entry.mjs';
import { validateMiniAppProfileName } from './api/input-validation-entry.mjs';
import { validateMiniAppHomeworkFields, validateMiniAppAttendanceMark, validateHomeworkRecordId } from './api/miniapp-write-validation-entry.mjs';
import { validateHomeworkMediaUpload } from './api/homework-media-validation-entry.mjs';
import { validateNewHomeworkAttachments, validateUpdatedHomeworkAttachments } from './api/homework-attachment-validation-entry.mjs';
import { createJsonStore } from './domain/json-store-entry.mjs';
import { normalizeAnnouncementText, createAnnouncementRecord, appendAnnouncement, formatAnnouncementMessage, getRecentAnnouncements } from './domain/announcements-entry.mjs';
import { validateAndNormalizeFullName, applyStudyGroupSelection, shouldPromptStudyGroup, completeFullNameRegistration } from './domain/registration-entry.mjs';
import { groupRoleReportSources, roleReportSourceChatIds, firstAssignedRoleId, filterRoleReportGroups } from './domain/role-report-entry.mjs';
import { assignAndPersistStudyGroupRole, removeAndPersistStudyGroupRoles, setSelfAsStudentAndSave, setGroupMemberAsStudentAndSave } from './domain/role-command-workflows-entry.mjs';
import { shouldNotifyRelease, buildReleaseMessage, buildRestartMessage } from './domain/startup-notifications-entry.mjs';

// Часовой пояс учебного заведения. Europe/Moscow — Краснодар и большая часть РФ.
// Можно переопределить через переменную окружения TIME_ZONE.
const TIME_ZONE = resolveTimeZone(process.env.TIME_ZONE);

const { db, saveDb } = createJsonStore({
  dataDir: process.env.DATA_DIR || '/data',
  backupIntervalMs: Number(process.env.DB_BACKUP_INTERVAL_MS)
});

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
const BOT_RELEASE_VERSION = '2026.11.20.03';
const RELEASE_CHANNEL = '@starostabotgiv';
const BOT_RELEASE_NOTES = [
  'Разделены данные двух учебных групп; добавлены роли старост, заместителей и двух владельцев.',
  'Обновлены списки студентов, проверка новых участников и импорт студентов текстом.',
  'Улучшены расписание, автоматические уведомления и публикация недельного расписания.',
  'В Mini App добавлены объявления, профиль и домашние задания с фото и видео.',
  'Добавлены статистика посещаемости и ДЗ, а также HTML-отчёты.',
  'Улучшены загрузка Mini App, обновление данных и стабильность работы.',
  'Добавлена структура учебных заведений: факультеты, направления и курсы.',
  'OCR временно отключён; бот и Mini App доступны бесплатно.',
  'Mini App: мгновенный показ сохранённых данных, таймер до пары, исправлено дублирование объявлений.',
  'Сервер: защита от зависших запросов, ограничение частоты, gzip и health-check /healthz.',
  'Исправлен часовой пояс расписания и чтение списков филиалов/групп.'
];
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();

function isOwner(userId) {
  return OWNER_TELEGRAM_IDS.includes(String(userId));
}

function isInstitutionAdmin(userId, institutionId) {
  const institution = db.institutions?.[String(institutionId)];
  return checkInstitutionAccess(institution, userId, OWNER_TELEGRAM_IDS).allowed;
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
  if (!ctx.from) return next();
  if (isOwner(ctx.from.id)) return next();
  const u = normalizeUser(user(ctx.from.id));
  // Капча отключена. Пользователь определяется по Telegram ID, username не требуется.
  if (shouldPromptStudyGroup({
    isOwner: false,
    updateType: ctx.updateType,
    chatType: ctx.chat?.type,
    hasGroup: Boolean(u.group),
    messageText: ctx.message?.text
  })) {
    await ctx.reply(
      '👋 Выбери свою учебную группу, чтобы получать правильное расписание и домашние задания:',
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
 * Подключение бота к существующему Telegram-чату.
 * Сохраняем существующий чат и данные; при изменении статуса бота проверяем админ-права.
 */
bot.on('my_chat_member', async ctx => {
  const update = ctx.update.my_chat_member;
  const chat = update?.chat;
  const oldStatus = update?.old_chat_member?.status;
  const newMember = update?.new_chat_member;
  const newStatus = newMember?.status;
  if (!chat?.id || !['group', 'supergroup'].includes(chat.type)) return;
  const joined = ['left', 'kicked'].includes(oldStatus) &&
    ['member', 'administrator'].includes(newStatus);
  const promoted = newStatus === 'administrator' && oldStatus !== 'administrator';
  const demoted = oldStatus === 'administrator' && newStatus === 'member';
  if (!joined && !promoted && !demoted) return;

  if (newStatus === 'left' || newStatus === 'kicked') return;
  try {
    registerGroup({ chat, from: ctx.from });
    console.log('[group setup] Existing chat registered:', chat.id, chat.title || '');
  } catch (error) {
    console.error('[group setup] Registration failed:', error?.message || error);
  }

  if (newStatus === 'administrator') {
    let memberInfo = null;
    try { memberInfo = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id); } catch {}
    const rights = memberInfo || newMember;
    const missing = getMissingTelegramBotPermissions(rights);
    const message = missing.length
      ? '⚠️ <b>Бот добавлен в чат, но не все права выданы.</b>\n\nВ настройках администраторов включи: ' + missing.join(', ') + '.'
      : '✅ <b>Бот подключён к существующему чату!</b>\nЧат зарегистрирован, необходимые права администратора выданы. Существующая переписка и данные не затронуты.';
    try { await ctx.telegram.sendMessage(chat.id, message, { parse_mode: 'HTML' }); } catch (e) {
      console.error('[group setup] Could not send admin confirmation:', e?.message || e);
    }
  } else if (joined) {
    try {
      await ctx.telegram.sendMessage(
        chat.id,
        '👋 <b>Староста Бот добавлен в этот существующий чат.</b> Чат зарегистрирован, создавать новую группу не нужно.\n\nДля полной работы назначьте бота администратором и включите права: <b>удаление сообщений</b>, <b>ограничение участников</b> и <b>закрепление сообщений</b>. Не выдавайте право добавлять других администраторов. После выдачи прав бот подтвердит подключение.',
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('[group setup] Could not send setup instructions:', e?.message || e);
    }
  } else if (demoted) {
    try {
      await ctx.telegram.sendMessage(chat.id, '⚠️ Права администратора у бота сняты. Для проверки участников и закрепления расписания верните права удаления сообщений, ограничения участников и закрепления.');
    } catch {}
  }
});

// Повторная проверка участников отключена: вступление не требует капчи.

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
  const linkedGroup = allStudyGroups().find(g => String(g.studyGroup || '') === selected);
  Object.assign(u, applyStudyGroupSelection(u, selected, linkedGroup, DEFAULT_INSTITUTION_ID));
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
  ['➕ Подключить бота к чату'],
  ['💛 Поддержать хостинг'],
  ['🔄 Обновить', '❔ Что умеет бот']
]).resize();
const studentMenu = Markup.keyboard([
  ['👥 Моя группа'],
  ['📚 ДЗ'],
  ['❔ Что умеет бот'],
  ['➕ Подключить бота к чату'],
  ['💛 Поддержать хостинг']
]).resize();

function user(id) {
  return getOrCreateUser(db.users, id);
}
function canManageAttendance(u, id) {
  return isOwner(id) || accessibleGroups(id).length > 0;
}
function getMenu(id) {
  return canManageAttendance(user(id), id) ? managerMenu : studentMenu;
}
function menuFor(ctx) {
  return isPrivate(ctx) ? getMenu(ctx.from.id) : studentMenu;
}
function importPreviewKeyboard(){return Markup.inlineKeyboard([[Markup.button.callback('✅ Подтвердить','studentimport:confirm')],[Markup.button.callback('❌ Отменить','studentimport:cancel')]]);}

// OCR временно отключён: импорт списка выполняется текстом.

function attendanceDate() { return formatDateInTimeZone(new Date(), TIME_ZONE); }
function attendanceLessonKey(lesson) {
 return buildAttendanceLessonKey(lesson, attendanceDate());
}
const scheduleCache = new ScheduleCache({
 load: (group, days) => getSchedule(String(group), days),
 ttlMs: 3 * 60 * 1000,
 logger: console
});

async function getCachedSchedule(group, days = 7) {
 return scheduleCache.get(String(group), days);
}

// Mini App получает кэш сразу; при холодном старте обновление идёт в фоне.
function getMiniAppSchedule(group, days = 7) {
 return scheduleCache.getImmediate(String(group), days);
}

async function getTodayLessons(g) {
 if(!g?.scheduleGroup) throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
 const lessons=await getCachedSchedule(String(g.scheduleGroup),7);
 return (lessons||[]).filter(x=>x.date===attendanceDate()&&x.subject).sort((a,b)=>String(a.timeStart||'').localeCompare(String(b.timeStart||'')));
}
function ensureStudyGroups(chat) {
 const result = ensureStudyGroupsData(db, chat, {
  defaultInstitutionId: DEFAULT_INSTITUTION_ID,
  names: Object.values(STUDY_GROUPS),
  starostas: STUDY_GROUP_STAROSTAS,
  zams: STUDY_GROUP_ZAMS
 });
 if (result.changed) {
  saveDb();
  console.log('[institutions] Existing study groups assigned to institution:', result.institutionId);
 }
 return result.groups;
}
function allStudyGroups() { return Object.values(db.groups).flatMap(chat=>ensureStudyGroups(chat)); }
const {
  canManageGroup,
  managedStudyGroups,
  canManageChat,
  managedChats,
  accessibleGroups,
  managedGroup
} = createGroupAccess({
  db,
  isOwner,
  isInstitutionAdmin,
  allStudyGroups,
  ensureStudyGroups
});
function formatAttendance(g) {
 return formatDailyAttendance(g, {
  today: attendanceDate(),
  getStudentKey: attendanceKey,
  getStudentName: studentName,
  escapeHtml
 });
}
function attendanceLessonsKeyboard(lessons) {
 const rows=lessons.map((lesson,i)=>{
  const time=lesson.timeStart?(lesson.timeStart+(lesson.timeEnd?'–'+lesson.timeEnd:'')):'Время не указано';
  return [Markup.button.callback((i+1)+'. '+time+' — '+String(lesson.subject||'Пара').slice(0,35),'attlesson:'+i)];
 });
 return Markup.inlineKeyboard(rows);
}
function formatLessonAttendance(g,lesson) {
 return formatSingleLessonAttendance(g, lesson, attendanceLessonKey(lesson), {
  today: attendanceDate(),
  getStudentKey: attendanceKey,
  getStudentName: studentName,
  escapeHtml
 });
}
function attendancePairButtons(g,lesson,userId,page=0) {
 const students=g.students||[],size=10;
 const pageData=paginateAttendanceStudents(students,Number(page)||0,size);
 page=pageData.page;
 const pages=pageData.pageCount;
 const record=g.lessonAttendance?.[attendanceLessonKey(lesson)]||{};
 const rows=pageData.items.map((student,offset)=>{
  const i=pageData.startIndex+offset,status=record[attendanceKey(student)];
  return [Markup.button.callback((status==='present'?'✅ Был':'▫️ Был')+' '+(i+1),'attpairmark:'+i+':present'),Markup.button.callback((status==='absent'?'❌ Нет':'▫️ Нет')+' '+(i+1),'attpairmark:'+i+':absent')];
 });
 const nav=[];if(page>0)nav.push(Markup.button.callback('⬅️','attpairpage:'+(page-1)));
 nav.push(Markup.button.callback((page+1)+'/'+pages,'attpairpage:'+page));
 if(page<pages-1)nav.push(Markup.button.callback('➡️','attpairpage:'+(page+1)));
 rows.push(nav,[Markup.button.callback('↩️ К списку пар','attpairback')]);
 return Markup.inlineKeyboard(rows);
}

function createAttendanceHtml(g, period='all') {
 return buildAttendanceHtml({ group: g, period, timeZone: TIME_ZONE });
}

async function show(ctx, days, offset, range) {
  const u = user(ctx.from.id);
  const view = buildScheduleView(
    String(u.group || ''),
    Object.values(STUDY_GROUPS),
    [],
    offset,
    range
  );
  if (!view.ok) {
    return ctx.reply(
      'Выбери корректную учебную группу, чтобы загрузить расписание:',
      Markup.inlineKeyboard([
        [Markup.button.callback(STUDY_GROUPS['2'], 'studygroup:2')],
        [Markup.button.callback(STUDY_GROUPS['1'], 'studygroup:1')]
      ])
    );
  }
  await ctx.reply('⏳ Загружаю расписание для «' + view.group + '»…');
  try {
    const lessons = range
      ? await getSchedule(view.group, days, range.start)
      : await getCachedSchedule(view.group, days);
    const prepared = buildScheduleView(view.group, Object.values(STUDY_GROUPS), lessons, offset, range);
    if (!prepared.ok) throw new Error('Selected schedule group became invalid');
    await ctx.reply(formatSchedule(prepared.lessons, prepared.group), menuFor(ctx));
  } catch (e) {
    console.error('[schedule]', e);
    await ctx.reply('❌ Не удалось получить расписание с сайта. Проверь источник или SCHEDULE_API_URL.', menuFor(ctx));
  }
}

function timeZoneParts(date = new Date()) { return getTimeZoneParts(date, TIME_ZONE); }

let attendancePollCheckRunning = false;
async function checkAutomaticAttendancePolls() {
  if (attendancePollCheckRunning) return;
  attendancePollCheckRunning = true;
  try {
    const now = timeZoneParts();
    const today = now.year + '-' + now.month + '-' + now.day;
    const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
    db.sentAttendancePolls ||= {};
    for (const g of Object.values(db.groups)) {
      const scheduleGroup = String(g.scheduleGroup || '').trim();
      if (!scheduleGroup) continue;
      try {
        const lessons = await getSchedule(scheduleGroup, 2);
        db.sentLessonNotices ||= {};
        const tasks = buildAttendanceScheduleTasks({
          chatId: g.chatId,
          lessons,
          today,
          currentMinutes,
          sentLessonNotices: db.sentLessonNotices,
          sentAttendancePolls: db.sentAttendancePolls
        });
        for (const task of tasks) {
          const lesson = task.lesson;
          const key = task.key;
          if (task.sendLessonReminder) {
            await bot.telegram.sendMessage(g.chatId,
              '⏰ <b>Напоминание о занятии</b>\n\nЧерез 30 минут начинается: <b>' + escapeHtml(lesson.subject) +
              '</b>\n🕒 Начало: ' + lesson.timeStart + (lesson.room ? '\n🚪 Аудитория: ' + escapeHtml(lesson.room) : ''),
              { parse_mode: 'HTML' }
            );
            db.sentLessonNotices[key] = new Date().toISOString();
            saveDb();
          }
          if (task.sendAttendancePoll) {
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


async function checkWeeklySchedules() {
  if (weeklyScheduleCheckRunning) return;
  const now = timeZoneParts();
  // Публикуем расписание по воскресеньям начиная с 18:00 по часовому поясу TIME_ZONE.
  if (!isWeeklySchedulePublicationWindow(now)) return;

  weeklyScheduleCheckRunning = true;
  try {
    const range = nextWeekDateRange(attendanceDate());
    db.sentWeeklySchedules ||= {};
    const targetChats = getPendingWeeklyScheduleTargets(Object.values(db.groups), db.sentWeeklySchedules, range.start);
    for (const pending of targetChats) {
      const g = pending.target;
      const chatId = g.chatId;
      const key = pending.key;
      try {
        const built = await buildWeeklyScheduleText({
          groups: Object.values(STUDY_GROUPS),
          range,
          loadSchedule: getSchedule,
          logger: console
        });
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
    const bySchedule = groupScheduleTargetsByGroup(Object.values(db.groups));

    for (const [scheduleGroup, chats] of bySchedule) {
      try {
        const lessons = await getSchedule(scheduleGroup, 14);
        if (!Array.isArray(lessons)) continue;
        const today = attendanceDate();
        const monitorEnd = getScheduleChangeMonitorEnd(today);
        const inAlertWindow = date => date >= today && date <= monitorEnd;
        const current = buildScheduleSnapshot(lessons);

        const analysis = analyzeScheduleSnapshot(db.scheduleSnapshots[scheduleGroup], current, today, monitorEnd);
        if (analysis.status === 'baseline') {
          db.scheduleSnapshots[scheduleGroup] = analysis.snapshot;
          saveDb();
          console.log('[schedule changes] baseline saved:', scheduleGroup, Object.keys(current).length);
          continue;
        }
        if (analysis.status === 'empty-response') {
          console.warn('[schedule changes] empty response ignored:', scheduleGroup);
          continue;
        }

        const { added, removed, changed } = analysis.changes;

        if (added.length || removed.length || changed.length) {
          const message = buildScheduleChangeMessage(scheduleGroup, { added, removed, changed }, escapeHtml);
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
  return isTelegramGroupAdmin(
    ctx.chat,
    ctx.from?.id,
    (chatId, userId) => ctx.telegram.getChatMember(chatId, userId)
  );
}

function registerGroup(ctx) {
  registerGroupData(db, ctx.chat, ctx.from, { ensureStudyGroups, saveDb });
}

function removeGroup(ctx) {
  removeGroupData(db, ctx.chat.id, saveDb);
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

function studentButtons(userId) {
  const groups = managedChats(userId);
  return groups.map(g => [Markup.button.callback('👨‍🎓 ' + String(g.title).slice(0, 45), 'students:' + String(g.chatId))]);
}

function groupButtons(userId) {
  const groups = managedChats(userId);
  const buttons = groups.map(g => [
    Markup.button.callback('📢 ' + String(g.title).slice(0, 45), 'pollsend:' + String(g.chatId))
  ]);
  if (groups.length > 1) buttons.push([Markup.button.callback('📢 Во все группы', 'pollsend:all')]);
  return buttons;
}

function homeworkButtons(userId) {
  const groups = managedChats(userId);
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

  const parsed = parseHomeworkCommand(text);
  if (!parsed.ok) {
    if (parsed.error === 'missing_parts') return ctx.reply('❌ Укажи предмет и задание через |\nПример: /hw Математика | Решить задачи 1–10');
    if (parsed.error === 'subject_too_long') return ctx.reply('❌ Название предмета слишком длинное.');
    return ctx.reply('❌ Текст ДЗ слишком длинный (максимум 3500 символов).');
  }
  const { subject, homework } = parsed;

  if (!managedChats(ctx.from.id).length) return ctx.reply('❌ В этом Telegram-чате несколько учебных групп. Для общей публикации нужны права на все группы чата.');
  const u = user(ctx.from.id);
  u.pendingHomework = { subject, homework };
  saveDb();

  const groups = Object.values(db.groups);
  if (!groups.length) {
    return ctx.reply('❌ Нет прикреплённых групп. Добавь бота в нужную группу, сделай себя администратором и выполни там /attach.');
  }

  await ctx.reply('📚 ДЗ создано. Выбери, в какую группу его отправить:', Markup.inlineKeyboard(homeworkButtons(ctx.from.id)));
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

  if (!managedChats(ctx.from.id).length) return ctx.reply('❌ В этом Telegram-чате несколько учебных групп. Для общей публикации нужны права на все группы чата.');
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

  await ctx.reply('📊 Опрос создан. Выбери, куда его отправить:', Markup.inlineKeyboard(groupButtons(ctx.from.id)));
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
  const record = findAttendancePollRecord(db.sentAttendancePolls, answer.poll_id);
  if (!record) return;
  const result = applyAttendancePollAnswer(
    record,
    answer,
    db.groups,
    new Date().toISOString()
  );
  if (!result) return;
  saveDb();
  console.log('[attendance poll] Answer recorded for ' + result.userId + ' in ' + result.groupName);
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
  // Старые ссылки verify_ больше не используются.
  if (!['starosta', 'zam'].includes(String(u.role || ''))) u.role = 'student';

  saveDb();
  if (isPrivate(ctx) && !u.fullName) {
    u.pendingFullName = true;
    saveDb();
    return ctx.reply(
      '👋 Добро пожаловать! Напиши, пожалуйста, свои фамилию и имя (при наличии — отчество) одним сообщением. Это нужно для списка студентов.\n\n' +
      'Если нужно подключить меня к уже существующему учебному чату, нажми кнопку ниже.',
      Markup.inlineKeyboard([[Markup.button.url('➕ Добавить бота в существующую группу', 'https://t.me/starostagivbot?startgroup=true')]])
    );
  }
  if (isPrivate(ctx) && !u.group) {
    return ctx.reply(
      '👋 Привет! Твоя роль — 👨‍🎓 Студент. Теперь выбери свою учебную группу:',
      Markup.inlineKeyboard([
        [Markup.button.callback('БИ(ЭБ)2-ОЗ/Бп/КД26', 'studygroup:2')],
        [Markup.button.callback('БИ(ЭБ)1-ОЗ/Бп/КД26', 'studygroup:1')]
      ])
    );
  }
  await ctx.reply(
    '👋 Привет! Я бот расписания.\n\n' +
    'Твоё ФИО: ' + escapeHtml(u.fullName || 'не указано') + '\n' +
    'Учебная группа: ' + escapeHtml(u.group || 'не выбрана') + '\n\n' +
    '📊 Опросы создаются в личке: /poll Вопрос | Да | Нет',
    { parse_mode: 'HTML', ...menuFor(ctx) }
  );
  await ctx.reply(
    '➕ <b>Подключение к существующему чату</b>\nДобавь бота в уже созданную учебную группу и назначь ему права администратора. Существующий чат и его история сохранятся.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('➕ Добавить бота в группу', 'https://t.me/starostagivbot?startgroup=true')]]) }
  );
});

bot.help(ctx => ctx.reply(
  '📚 <b>Команды Староста Бота</b>\n\n' +
  '📅 <b>Расписание</b>\n' +
  '/group НАЗВАНИЕ — сохранить учебную группу\n' +
  '/openchat — разрешить всем участникам писать (в чате, для админа)\n' +
  '/schedule — сегодня\n/tomorrow — завтра\n/week — неделя\n\n' +
  '👨‍🎓 <b>Студенты и посещаемость</b>\n' +
  '/role — посмотреть свою роль\n/allroles — общий список ролей по группам (в личке, для владельца/админов)\n/delrole ID — снять управленческие роли пользователя (в личке, владелец)\n/announce — выбрать чат и отправить объявление (владелец, личка)\n/students — список студентов\n/student ИМЯ — добавить вручную\n' +
  '/delstudent НОМЕР — удалить из списка\n/attendance — журнал (староста)\n/html — HTML-отчёт посещаемости\n' +
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
    '/attendance — открыть журнал посещаемости\n/html — получить журнал посещаемости HTML-файлом (также работает /attendanceweb)\n' +
    '/mark НОМЕР present|absent — отметить посещаемость\n' +
    '/starosta 1|2 — назначить себя старостой конкретной группы <i>(в группе)</i>\n' +
    '/setstarosta 1|2 — назначить старосту ответом на сообщение <i>(в группе)</i>\n' +
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
  const linkedGroup = allStudyGroups().find(g => String(g.studyGroup || '') === selected);
  Object.assign(user(ctx.from.id), applyStudyGroupSelection(user(ctx.from.id), selected, linkedGroup, DEFAULT_INSTITUTION_ID));
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
  const requestedScheduleGroup = (ctx.message.text || '').trim().split(/\s+/).slice(1).join(' ');
  registerGroup(ctx);
  const availableGroups = ensureStudyGroups(db.groups[String(ctx.chat.id)]);
  const resolution = resolveScheduleGroupName(requestedScheduleGroup, availableGroups.map(g => String(g.studyGroup || '')));
  if (!resolution.ok) {
    if (resolution.reason === 'missing') return ctx.reply('Формат: /setgroup ИСП-21\nУкажи точное название группы из расписания.');
    return ctx.reply('❌ Укажи одну из двух учебных групп: ' + Object.values(STUDY_GROUPS).join(' или ') + '.');
  }
  const selected = availableGroups.find(g => String(g.studyGroup || '') === resolution.group);
  if (!selected) return ctx.reply('❌ Не удалось найти выбранную учебную группу. Повтори команду /setgroup.');
  selected.scheduleGroup = resolution.group;
  saveDb();
  return ctx.reply('✅ Для этого чата установлена учебная группа «' + resolution.group + '».\n\n🗓 Каждое воскресенье после 18:00 бот будет автоматически отправлять сюда расписание на следующую неделю (понедельник–воскресенье).\n⏰ Напоминание приходит за 30 минут, опрос посещаемости — за 10 минут до пары.');
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
    if (!group || !canManageChat(ctx.from.id,ctx.chat.id)) {
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
 if(!canManageChat(ctx.from.id,ctx.chat.id))
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
  if(groupId && g && !canManageChat(ctx.from.id,groupId)) { await ctx.answerCbQuery('Нет прав для подтверждения.'); return; }
  if(!g){await ctx.answerCbQuery('Группа не найдена.');return;}
  const importResult=confirmStudentRosterImport(g,u,list);
  if(importResult.truncated)console.warn('[student import] roster capped at 100 entries for group '+String(g.chatId||groupId||g.title||'unknown'));
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
  if (!group || !canManageChat(ctx.from.id,groupId))
   return ctx.reply('❌ Нет прав импортировать список в эту группу.');
  const names=parseStudentNames(raw);
  if(!names.length)return ctx.reply('Не удалось распознать ФИО. Ответь на сообщение бота списком: по одному ФИО на строку.');
  u.pendingStudentImport=false;u.pendingStudentImportReview=names;saveDb();
  const preview=names.map((name,i)=>(i+1)+'. '+escapeHtml(name)).join('\n');
  return ctx.reply('📝 <b>Проверь список студентов</b>\n👥 Группа: <b>'+escapeHtml(group.title)+'</b>\n👨‍🎓 Найдено: <b>'+names.length+'</b>\n\n'+preview+'\n\nПосле подтверждения текущий список группы будет заменён.',{parse_mode:'HTML',...importPreviewKeyboard()});
 }
 if(!isPrivate(ctx))return next();
 if (u.pendingAnnouncementChatId) {
  if (raw.toLowerCase() === '/cancel') {
   delete u.pendingAnnouncementChatId; saveDb();
   return ctx.reply('❌ Публикация объявления отменена.');
  }
  if (raw.startsWith('/')) return ctx.reply('Отправь текст объявления или /cancel для отмены.');
  const announcementValidation = normalizeAnnouncementText(raw);
  if (!announcementValidation.ok) return ctx.reply(announcementValidation.reason === 'empty' ? '❌ Напиши текст объявления.' : '❌ Объявление слишком длинное. Максимум 3000 символов.');
  const announcementText = announcementValidation.text;
  const chatId = String(u.pendingAnnouncementChatId);
  const exists = Object.entries(db.groups || {}).some(([id, g]) => String(g.chatId || id) === chatId);
  if (!exists) {
   delete u.pendingAnnouncementChatId; saveDb();
   return ctx.reply('❌ Выбранный чат больше не подключён. Запусти /announce ещё раз.');
  }
  try {
   await ctx.telegram.sendMessage(chatId, formatAnnouncementMessage(announcementText, 'Объявление', escapeHtml), { parse_mode: 'HTML' });
   delete u.pendingAnnouncementChatId; saveDb();
   console.log('[owner announcement] sent to chat ' + chatId + ' by ' + ctx.from.id);
   return ctx.reply('✅ Объявление отправлено в выбранный чат.');
  } catch (error) {
   console.error('[owner announcement] send failed for ' + chatId + ':', error?.message || error);
   return ctx.reply('❌ Не удалось отправить объявление. Проверь, что бот всё ещё находится в чате и может отправлять сообщения.');
  }
 }
 if (u.pendingFullName && !raw.startsWith('/')) {
  const nameValidation = completeFullNameRegistration(u, raw);
  if (!nameValidation.ok) {
   return ctx.reply('❌ Не получилось распознать ФИО. Отправь фамилию и имя (при наличии — отчество) буквами, одним сообщением.');
  }
  const fullName = nameValidation.value;
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
  if (!['starosta', 'zam'].includes(String(u.role || ''))) u.role = 'student';
  saveDb();
  return ctx.reply(
   '✅ ФИО сохранено: <b>' + escapeHtml(fullName) + '</b>.\n\nТвоя роль — 👨‍🎓 Студент. Теперь выбери учебную группу:',
   { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [Markup.button.callback('БИ(ЭБ)2-ОЗ/Бп/КД26', 'studygroup:2')],
    [Markup.button.callback('БИ(ЭБ)1-ОЗ/Бп/КД26', 'studygroup:1')]
   ]) }
  );
 }
 if(u.pendingStudentField){
  const pending=u.pendingStudentField;
  const g=managedGroup(ctx.from.id);
  if(!g||!g.students[pending.index]){delete u.pendingStudentField;saveDb();return ctx.reply('❌ Студент не найден. Открой /students и попробуй снова.');}
  if(raw.toLowerCase()==='/cancel'){delete u.pendingStudentField;saveDb();return ctx.reply('Изменение отменено.');}
  let value='';
  if(pending.type==='username'){
   const normalized=normalizeStudentUsername(raw);
   if(!normalized.ok)return ctx.reply('❌ Неверный username. Введи @username или /cancel.');
   value=normalized.value;
  } else {
   const normalized=normalizeStudentPhone(raw);
   if(!normalized.ok)return ctx.reply('❌ Неверный номер. Укажи международный формат с плюсом, например +79181651870 или +37255555555. Для отмены: /cancel.');
   value=normalized.value;
  }
  if(!updateStudentContactAndSave(g,pending.index,pending.type,value,()=>{delete u.pendingStudentField;},saveDb)){delete u.pendingStudentField;saveDb();return ctx.reply('❌ Студент не найден. Открой /students и попробуй снова.');}
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
 const rosterPage=getStudentRosterPage(g,page,10);
 const pages=rosterPage.pages;
 const rows=rosterPage.items.map(({index,name})=>{
  return [Markup.button.callback('👤 '+(index+1)+'. '+name.slice(0,42),'studentcard:'+index)];
 });
 const nav=[];
 if(page>0)nav.push(Markup.button.callback('⬅️','studentpage:'+(page-1)));
 nav.push(Markup.button.callback((page+1)+'/'+pages,'studentpage:'+page));
 if(page<pages-1)nav.push(Markup.button.callback('➡️','studentpage:'+(page+1)));
 rows.push(nav);
 return Markup.inlineKeyboard(rows);
}
function studentCardText(g,i){
 const card=getStudentCard(g,i);
 if(!card)return '❌ Студент не найден.';
 const name=card.name;
 const username=card.username?'@'+card.username.replace(/^@/,''):'не указан';
 const phone=card.phone||'не указан';
 const id=card.telegramId||'не указан';
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
 g.attendance||={};const result=addTelegramStudentAndSave(g,{name:name||('ID '+target.id),telegramId:String(target.id),username:target.username||''},saveDb);
 if(result==='limit')return ctx.reply('❌ Максимум 100 студентов.');
 return ctx.reply((result==='updated'?'🔄 Обновлена запись в списке «':'✅ Добавлен в список «')+g.title+'»: '+studentName(g.students.find(x=>String(typeof x==='object'?x.telegramId:'')===String(target.id))));
 }
 if(!isPrivate(ctx))return ctx.reply('Ответь в группе на сообщение студента командой /student.');const g=managedGroup(ctx.from.id);if(!g)return ctx.reply('❌ Сначала назначь старосту в прикреплённой группе.');
 if(!name)return ctx.reply('Формат: /student Имя Фамилия');const result=addNamedStudentAndSave(g,name,saveDb);
 if(result==='duplicate')return ctx.reply('ℹ️ Такой студент уже есть.');
 if(result==='limit')return ctx.reply('❌ Максимум 100 студентов.');
 return ctx.reply('✅ Добавлен в список «'+g.title+'»: '+name);
});
bot.command('delstudent',async ctx=>{
 if(!isPrivate(ctx))return ctx.reply('📩 Удаление доступно в личных сообщениях.');const n=Number(ctx.message.text.replace(/^\/delstudent(?:@\S+)?/i,'').trim())-1,g=managedGroup(ctx.from.id);
 if(!g)return ctx.reply('❌ Не найдена твоя прикреплённая группа.');if(!Number.isInteger(n)||n<0||n>=g.students.length)return ctx.reply('Формат: /delstudent номер из списка /students');
 const removed=removeStudentAtAndSave(g,n,saveDb);if(removed===undefined)return ctx.reply('Формат: /delstudent номер из списка /students');return ctx.reply('🗑 Удалён: '+studentName(removed));
});
bot.hears('👨‍🎓 Список студентов', ctx => ctx.reply('Используй /students. Добавить с username: ответь в группе на сообщение студента командой /student.'));

async function showRole(ctx) {
  if (!isPrivate(ctx)) return ctx.reply('📩 Роли учебных групп проверяются в личных сообщениях.');
  const value = String(ctx.message?.text || '').trim().split(/\s+/).slice(1).join(' ').toLowerCase();
  const id=String(ctx.from.id);
  const assignments=allStudyGroups().filter(g=>String(g.starostaId||'')===id||String(g.zamId||'')===id);
  if (!value) {
    const lines=assignments.map(g=>'• '+(String(g.starostaId||'')===id?'👑 Староста':'⭐ Заместитель')+' — '+escapeHtml(g.studyGroup)+' ('+escapeHtml(db.institutions?.[String(g.institutionId||'')]?.name||g.institutionId||'учебное заведение')+')');
    return ctx.reply(lines.length?'👤 <b>Твои назначения</b>\n\n'+lines.join('\n'):'👨‍🎓 У тебя нет назначенных управленческих ролей.\n\nНазначение выполняет администратор соответствующей учебной группы.',{parse_mode:'HTML'});
  }
  if (value !== 'student') return ctx.reply('❌ Управленческую роль назначает администратор конкретной учебной группы.');
  const u=normalizeUser(user(id));
  setSelfAsStudentAndSave(allStudyGroups(),u,id,saveDb);
  await ctx.reply('✅ Ты снял(а) с себя все назначения старосты и заместителя.',menuFor(ctx));
}
bot.command('role', showRole);
bot.command('roles', showRole);

// Общий просмотр ролей доступен владельцам платформы и администраторам заведения — только в личке.
bot.command(['delrole', 'removerole'], async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду /delrole используй только в личке с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('🔒 Снимать роли других пользователей в личке может только владелец бота.');
  const targetId = String(ctx.message?.text || '').trim().split(/\s+/)[1] || '';
  if (!/^\d+$/.test(targetId)) return ctx.reply('Формат: /delrole TELEGRAM_ID\\nID можно посмотреть командой /allroles.');
  const target = db.users?.[targetId];
  const targetUser = target ? normalizeUser(target) : {};
  const result = removeAndPersistStudyGroupRoles(allStudyGroups(),targetUser,targetId,undefined,saveDb);
  const removed = result.removed;
  return ctx.reply(removed
    ? '✅ Управленческие назначения пользователя <code>' + escapeHtml(targetId) + '</code> сняты (' + removed + '). Роль пользователя — студент.'
    : 'ℹ️ У пользователя <code>' + escapeHtml(targetId) + '</code> не найдено назначений старосты или заместителя. Если профиль существует, его роль установлена как «Студент».',
    { parse_mode: 'HTML' });
});

bot.command(['allroles', 'roleslist'], async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список ролей можно получить только в личных сообщениях с ботом.');
  const requesterId=String(ctx.from.id);
  const owner=isOwner(requesterId);
  const adminInstitutionIds=Object.entries(db.institutions||{})
    .filter(([,inst])=>Array.isArray(inst.adminIds)&&inst.adminIds.map(String).includes(requesterId))
    .map(([id])=>String(id));
  if(!owner && !adminInstitutionIds.length) {
    return ctx.reply('🔒 Общий список ролей доступен владельцу бота и администраторам учебных заведений.');
  }
  const rawGroups=filterRoleReportGroups(allStudyGroups(),owner,adminInstitutionIds);
  // Один и тот же курс/группа может быть зарегистрирован в нескольких чатах.
  // Объединение карточек выполняет типизированный доменный модуль.
  const grouped=groupRoleReportSources(rawGroups);
  if(!grouped.length) return ctx.reply('Пока нет доступных учебных групп.');
  const blocks=[];
  for(const g of grouped.values()) {
    const institutionName=db.institutions?.[String(g.institutionId||'')]?.name||'Учебное заведение';
    const sourceChatIds=roleReportSourceChatIds(g);
    const starostaId=firstAssignedRoleId(g,'starostaId');
    const zamId=firstAssignedRoleId(g,'zamId');
    const members=Object.entries(db.users||{}).filter(([uid,u])=>
      !isOwner(uid) &&
      String(u.group||'')===String(g.studyGroup||'') &&
      (!u.groupChatId || sourceChatIds.has(String(u.groupChatId)))
    );
    const roleFor=uid=>starostaId===uid?'👑 Староста':zamId===uid?'⭐ Заместитель':'👨‍🎓 Студент';
    const lines=[];
    for(const [uid,u] of members) {
      const name=escapeHtml(u.fullName||u.fio||u.username&&('@'+u.username)||('ID '+uid));
      lines.push('• '+roleFor(String(uid))+' — '+name+' <code>'+escapeHtml(uid)+'</code>');
    }
    for(const [uid,label] of [[starostaId,'👑 Староста'],[zamId,'⭐ Заместитель']]) {
      if(uid && !members.some(([memberId])=>String(memberId)===uid)) {
        const u=db.users?.[uid]||{};
        const name=escapeHtml(u.fullName||u.fio||u.username&&('@'+u.username)||('ID '+uid));
        lines.unshift('• '+label+' — '+name+' <code>'+escapeHtml(uid)+'</code>');
      }
    }
    blocks.push('🏫 <b>'+escapeHtml(institutionName)+'</b>\n📚 <b>'+escapeHtml(g.studyGroup||'Учебная группа')+'</b>\n'+(lines.length?lines.join('\n'):'Пока нет пользователей, выбравших эту группу.'));
  }
  let output='👥 <b>Роли пользователей по учебным группам</b>\n\n'+blocks.join('\n\n');
  if(output.length>3900) output=output.slice(0,3850)+'\n\n… Список большой, часть записей не показана.';
  return ctx.reply(output,{parse_mode:'HTML'});
});


bot.command('starosta', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('❌ Команду /starosta нужно выполнить в учебной группе.');
  }
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) {
    return ctx.reply('❌ Назначить себя старостой может владелец бота или администратор этой группы.');
  }
  const groupNumber=String(ctx.message?.text||'').trim().split(/\s+/)[1]||'';
  if(!['1','2'].includes(groupNumber)) return ctx.reply('Укажи учебную группу: /starosta 1 или /starosta 2.');
  registerGroup(ctx);
  const chat=db.groups[String(ctx.chat.id)];
  const u = normalizeUser(user(ctx.from.id));
  const assignment=assignAndPersistStudyGroupRole(ensureStudyGroups(chat),u,'starosta',ctx.from.id,groupNumber,STUDY_GROUPS,{username:ctx.from.username||'',chatId:ctx.chat.id,institutionId:DEFAULT_INSTITUTION_ID},saveDb);
  if(assignment.status!=='assigned') return ctx.reply('❌ Учебная группа не найдена.');
  return ctx.reply('👑 Ты назначен старостой учебной группы «'+escapeHtml(String(assignment.group.studyGroup||''))+'».', studentMenu);
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
  const u=normalizeUser(user(target.id));
  const assignment=assignAndPersistStudyGroupRole(ensureStudyGroups(chat),u,'zam',target.id,groupNumber,STUDY_GROUPS,{username:target.username||'',chatId:ctx.chat.id,institutionId:DEFAULT_INSTITUTION_ID},saveDb);
  if(assignment.status==='group-not-found') return ctx.reply('❌ Учебная группа не найдена.');
  if(assignment.status==='target-is-starosta') return ctx.reply('Этот пользователь уже назначен старостой выбранной группы.');
  return ctx.reply('⭐ '+(target.first_name||'Пользователь')+' назначен заместителем старосты группы «'+escapeHtml(String(assignment.group.studyGroup||''))+'». Теперь он может добавлять студентов командой /student, удалять через /delstudent и загружать список через /importstudents в личном чате с ботом.',studentMenu);
});

bot.command('setstarosta', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Эту команду нужно выполнить в группе.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Назначать старосту может только администратор группы.');
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply('Ответь командой /setstarosta 1 или /setstarosta 2 на сообщение нужного человека.');
  const groupNumber=String(ctx.message?.text||'').trim().split(/\s+/)[1]||'';
  if(!['1','2'].includes(groupNumber)) return ctx.reply('Укажи номер учебной группы: /setstarosta 1 или /setstarosta 2.');
  registerGroup(ctx);
  const u = normalizeUser(user(target.id));
  const assignment=assignAndPersistStudyGroupRole(ensureStudyGroups(db.groups[String(ctx.chat.id)]),u,'starosta',target.id,groupNumber,STUDY_GROUPS,{username:target.username||'',chatId:ctx.chat.id,institutionId:DEFAULT_INSTITUTION_ID},saveDb);
  if(assignment.status!=='assigned') return ctx.reply('❌ Учебная группа не найдена.');
  await ctx.reply('👑 ' + (target.first_name || 'Пользователь') + ' назначен старостой группы «'+escapeHtml(String(assignment.group.studyGroup||''))+'».');
});

bot.command('appointstarosta', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Используй команду в личных сообщениях боту.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Команда доступна только владельцу платформы.');
  return ctx.reply('Назначение без конкретной группы отключено. Используй /setstarosta 1 или /setstarosta 2 ответом на сообщение пользователя в нужном учебном чате.');
});

bot.command('setstudent', async ctx => {
  if (!['group', 'supergroup'].includes(ctx.chat.type)) return ctx.reply('Эту команду нужно выполнить в группе.');
  if (!(await isGroupAdmin(ctx))) return ctx.reply('❌ Менять роль может только администратор группы.');
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply('Ответь командой /setstudent на сообщение нужного человека.');
  const chat=db.groups[String(ctx.chat.id)];
  const u = normalizeUser(user(target.id));
  setGroupMemberAsStudentAndSave(chat ? ensureStudyGroups(chat) : undefined,u,target.id,ctx.chat.id,saveDb);
  await ctx.reply('👨‍🎓 ' + (target.first_name || 'Пользователь') + ' снят с управленческих ролей в этом учебном чате.');
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
bot.command(['attendanceweb', 'html'], async ctx => {
 if (!isPrivate(ctx)) return ctx.reply('📩 Используй команду в личных сообщениях.');
 const g = managedGroup(ctx.from.id);
 if (!g) return ctx.reply('❌ Команда доступна старосте или заместителю прикреплённой группы.');
 const u = normalizeUser(user(ctx.from.id));
 // Закрепляем группу до конца экспорта: права владельца не должны переключать отчёт на другую группу.
 u.pendingAttendanceHtml = true;
 u.pendingAttendanceHtmlGroupId = String(g.chatId) + '::' + String(g.studyGroup || g.title);
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
 delete u.pendingAttendanceHtmlGroupId;
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
 const selectedGroupId = u.pendingAttendanceHtmlGroupId || '';
 const g = managedGroup(ctx.from.id, selectedGroupId);
 const period = ctx.match[1];
 delete u.pendingAttendanceHtml;
 delete u.pendingAttendanceHtmlGroupId;
 saveDb();
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
  if (!raw) return ctx.reply('Формат: /addinstitution Название | Сокращение | Город');
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
  if (duplicate) return ctx.reply('⚠️ Такое учебное заведение уже зарегистрировано.\nID: <code>' + escapeHtml(duplicate.id) + '</code>', { parse_mode: 'HTML' });
  const id = 'inst_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const created = createInstitutionAndSave(db.institutions, {
    id, name, shortName, city, status: 'active', createdAt: new Date().toISOString(),
    createdBy: String(ctx.from.id), adminIds: [], faculties: {}
  }, saveDb);
  if (!created.ok) return ctx.reply('❌ Не удалось зарегистрировать учебное заведение.');
  console.log('[institutions] Institution created:', id, 'by owner:', String(ctx.from.id));
  return ctx.reply('✅ <b>Учебное заведение зарегистрировано!</b>\n\n🏫 Название: <b>' + escapeHtml(name) + '</b>\n' +
    (shortName ? '🔖 Сокращение: ' + escapeHtml(shortName) + '\n' : '') +
    (city ? '📍 Город: ' + escapeHtml(city) + '\n' : '') +
    '🆔 ID: <code>' + escapeHtml(id) + '</code>\n\nСуществующие группы и данные не затронуты.', { parse_mode: 'HTML' });
});

bot.command('institutions', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Список учебных заведений доступен в личных сообщениях.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Список доступен только владельцу платформы.');
  const institutions = listInstitutions(db.institutions);
  if (!institutions.length) return ctx.reply('Пока нет зарегистрированных учебных заведений.');
  const lines = institutions.map((item, index) =>
    (index + 1) + '. <b>' + escapeHtml(item.name || 'Без названия') + '</b>' +
    (item.city ? ' · ' + escapeHtml(item.city) : '') +
    '\nID: <code>' + escapeHtml(item.id) + '</code>' +
    (item.id === DEFAULT_INSTITUTION_ID ? ' · основное' : '') +
    (item.status === 'inactive' ? ' · отключено' : '')
  );
  return ctx.reply('🏫 <b>Учебные заведения (' + institutions.length + ')</b>\n\n' + lines.join('\n\n'), { parse_mode: 'HTML' });
});

bot.command('deleteinstitution', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личный чат с ботом и отправь /deleteinstitution ID.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Удалять учебные заведения может только владелец платформы.');
  const id = String(ctx.message?.text || '').replace(/^\/deleteinstitution(?:@\S+)?/i, '').trim();
  if (!id) return ctx.reply('Формат: /deleteinstitution ID. Основное заведение удалить нельзя.');
  const institution = db.institutions?.[id];
  if (!institution) return ctx.reply('❌ Учебное заведение с таким ID не найдено.');
  const deletion = deleteInstitutionAndSave(db.institutions, id, db.groups, [DEFAULT_INSTITUTION_ID], saveDb);
  if (!deletion.ok) {
    if (deletion.reason === 'protected') return ctx.reply('⛔ Нельзя удалить основное учебное заведение.');
    if (deletion.reason === 'has_groups') return ctx.reply('⛔ Удаление отменено: к этому заведению привязаны учебные группы. Сначала перенеси их в другое заведение.');
    return ctx.reply('❌ Не удалось удалить учебное заведение.');
  }
  console.log('[institutions] Institution deleted:', id, 'by owner:', String(ctx.from.id));
  return ctx.reply('✅ Учебное заведение «' + escapeHtml(institution.name || 'Без названия') + '» удалено.\n🆔 <code>' + escapeHtml(id) + '</code>\nОсновное заведение и его группы не затронуты.', { parse_mode: 'HTML' });
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
  const assignment = addInstitutionAdminAndSave(institution, userId, OWNER_TELEGRAM_IDS, saveDb);
  if (!assignment.ok) return ctx.reply('❌ Не удалось назначить администратора.');
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
  const removal = removeInstitutionAdminAndSave(institution, userId, saveDb);
  if (!removal.ok) return ctx.reply('Формат: /removeinstadmin ID_ЗАВЕДЕНИЯ TELEGRAM_ID');
  if (removal.status === 'not_found') return ctx.reply('ℹ️ Этот пользователь не числится администратором данного заведения.');
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
  const admins = listInstitutionAdmins(institution);
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
  return hasDuplicateStructureName(items, name);
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
  const created = createFacultyAndSave(institution, name, id, new Date().toISOString(), saveDb);
  if (!created.ok) return ctx.reply(created.reason === 'duplicate' ? '⚠️ Такой факультет уже есть в этом заведении.' : '❌ Укажи название факультета.');
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
  const created = createDirectionAndSave(faculty, name, id, new Date().toISOString(), saveDb);
  if (!created.ok) return ctx.reply(created.reason === 'duplicate' ? '⚠️ Такое направление уже есть на этом факультете.' : '❌ Укажи название направления.');
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
  const created = createCourseAndSave(direction, name, id, new Date().toISOString(), saveDb);
  if (!created.ok) return ctx.reply(created.reason === 'duplicate' ? '⚠️ Такой курс уже есть у этого направления.' : '❌ Укажи название курса.');
  console.log('[institution-structure] Course created:', id, 'direction:', directionId);
  return ctx.reply('✅ Курс добавлен.\n\n📚 ' + escapeHtml(direction.name) + '\n🎓 ' + escapeHtml(name) + '\n🆔 <code>' + id + '</code>', { parse_mode: 'HTML' });
});

bot.command('linkgroup', async ctx => {
  if (!ctx.chat || ctx.chat.type === 'private') return ctx.reply('📌 Команду используй в общем чате, где добавлен бот.');
  const args = structureParts(ctx, 'linkgroup');
  const groupNumber = String(args[0] || '').trim();
  const courseId = String(args[1] || '').trim();
  if (!['1', '2'].includes(groupNumber) || !courseId) {
    return ctx.reply('Формат: /linkgroup 1 | ID_КУРСА\nДля второй группы укажи /linkgroup 2 | ID_КУРСА. ID курса смотри через /structure inst_001 в личке с ботом.');
  }
  const groupName = STUDY_GROUPS[groupNumber];
  const chat = db.groups?.[String(ctx.chat.id)];
  if (!chat) return ctx.reply('❌ Этот чат ещё не зарегистрирован. Сначала добавь бота в учебный чат и пройди настройку.');
  const studyGroup = ensureStudyGroups(chat).find(g => g.studyGroup === groupName);
  if (!studyGroup) return ctx.reply('❌ Учебная группа не найдена в этом чате.');
  if (!canManageGroup(ctx.from.id, studyGroup)) return ctx.reply('❌ Нет прав на изменение структуры этой учебной группы.');
  const institution = db.institutions?.[String(studyGroup.institutionId || DEFAULT_INSTITUTION_ID)];
  if (!institution) return ctx.reply('❌ Учебное заведение группы не найдено.');
  // Legacy groups without institutionId belong to the configured default institution.
  studyGroup.institutionId ||= institution.id;
  const linked = linkStudyGroupToCourseAndSave(institution, studyGroup, courseId, new Date().toISOString(), saveDb);
  if (!linked.ok) {
    if (linked.reason === 'institution_mismatch') return ctx.reply('❌ Учебная группа и структура относятся к разным учебным заведениям.');
    return ctx.reply('❌ Курс не найден в структуре учебного заведения этой группы. Проверь /structure.');
  }
  const linkId = linked.id;
  console.log('[institution-structure] Study group linked:', linkId, 'course:', courseId);
  return ctx.reply('✅ Учебная группа привязана к структуре.\n\n🎓 ' + escapeHtml(linked.facultyName || 'Факультет') +
    '\n📚 ' + escapeHtml(linked.directionName || 'Направление') + '\n🧑‍🎓 ' + escapeHtml(linked.courseName || 'Курс') +
    '\n👥 ' + escapeHtml(studyGroup.studyGroup) +
    '\n\nСуществующие студенты, посещаемость, расписание и роли сохранены.', { parse_mode: 'HTML' });
});


bot.command('unlinkgroup', async ctx => {
  if (!ctx.chat || ctx.chat.type === 'private') return ctx.reply('📌 Команду используй в общем чате, где добавлен бот.');
  const args = structureParts(ctx, 'unlinkgroup');
  const groupNumber = String(args[0] || '').trim();
  if (!['1', '2'].includes(groupNumber)) {
    return ctx.reply('Формат: /unlinkgroup 1\nДля второй группы укажи /unlinkgroup 2. Команда убирает только привязку к курсу, студенты и посещаемость сохраняются.');
  }
  const groupName = STUDY_GROUPS[groupNumber];
  const chat = db.groups?.[String(ctx.chat.id)];
  if (!chat) return ctx.reply('❌ Этот чат ещё не зарегистрирован.');
  const studyGroup = ensureStudyGroups(chat).find(g => g.studyGroup === groupName);
  if (!studyGroup) return ctx.reply('❌ Учебная группа не найдена в этом чате.');
  if (!canManageGroup(ctx.from.id, studyGroup)) return ctx.reply('❌ Нет прав на изменение структуры этой учебной группы.');
  const institution = db.institutions?.[String(studyGroup.institutionId || DEFAULT_INSTITUTION_ID)];
  if (!institution) return ctx.reply('❌ Учебное заведение группы не найдено.');
  studyGroup.institutionId ||= institution.id;
  const result = unlinkStudyGroupFromStructureAndSave(institution, studyGroup, saveDb);
  if (!result.ok) return ctx.reply('❌ Не удалось снять привязку: данные учебного заведения не совпадают.');
  console.log('[institution-structure] Study group unlinked:', String(ctx.chat.id), groupName, 'removed links:', result.removed);
  return ctx.reply('✅ Привязка учебной группы к курсу снята.\n\n👥 ' + escapeHtml(groupName) + '\nСтуденты, посещаемость, расписание и роли сохранены.');
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
  const latest = latestHomework(Object.values(db.groups), groupName, 10);
  if (!latest.length) return ctx.reply('Пока не готово, либо ничего не задано, лучше напишите вашему старосте', menuFor(ctx));
  const view=homeworkMessage(latest,ctx.from.id,ctx);
  await ctx.reply(view.text,view.extra);
  await sendHomeworkAttachments(ctx, latest);
}
bot.hears(/^📚\\s*ДЗ\\s*$/iu, showHomework);
bot.command('dz', showHomework);
bot.action(/^hwcomplete:([a-f0-9-]{36})$/i,async ctx=>{
  const userId=String(ctx.from.id),u=normalizeUser(user(ctx.from.id)),groupName=String(u.group||'').trim();
  const groups=Object.values(db.groups);
  const homeworkId=String(ctx.match[1]);
  const completionState=getHomeworkCompletionState(groups,groupName,homeworkId,userId);
  if(completionState.status==='not_found'){await ctx.answerCbQuery('Задание не найдено или уже удалено.');return}
  if(completionState.status==='already_completed'){await ctx.answerCbQuery('Уже отмечено.');return}
  markHomeworkCompleted(groups,groupName,homeworkId,userId,new Date().toISOString());
  saveDb();
  const records=latestHomework(groups,groupName,10);
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
 const lesson=getAttendanceLessonAt(g.todayAttendanceLessons||[],Number(ctx.match[1]));if(!lesson)return ctx.answerCbQuery('Список пар устарел. Отправь /attendance ещё раз.');
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
 if(!setLessonAttendanceStatus(g,key,studentKey,ctx.match[2]))return ctx.answerCbQuery('Не удалось сохранить отметку.');
 saveDb();
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
    if (!g || !canManageChat(ctx.from.id,groupId)) { await ctx.answerCbQuery('Нет доступа к этой группе.'); return; }
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
  const groups = managedChats(ctx.from.id);
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
        appendHomework(g, createHomeworkRecord(
          { subject: u.pendingHomework.subject, homework: u.pendingHomework.homework },
          crypto.randomUUID(), new Date().toISOString(), ctx.from.id
        ));
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
bot.command('week', ctx => show(ctx, 7, 0, currentMondayDateRange(attendanceDate())));

// Ручная публикация истории проекта от имени бота в официальный канал.
// Владелец выбирает зарегистрированный Telegram-чат и отправляет туда объявление из лички.
bot.command('announce', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду /announce используй в личных сообщениях с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('🔒 Публиковать объявления через эту команду может только владелец бота.');
  const chats = Object.entries(db.groups || {})
    .map(([id, g]) => ({ id: String(g.chatId || id), title: String(g.title || g.chatTitle || ('Чат ' + (g.chatId || id))) }))
    .filter(x => /^-?\d+$/.test(x.id));
  const unique = [...new Map(chats.map(x => [x.id, x])).values()];
  if (!unique.length) return ctx.reply('❌ Пока нет подключённых Telegram-чатов. Сначала добавь бота в нужный чат.');
  const rows = unique.map(x => [Markup.button.callback('📢 ' + x.title.slice(0, 48), 'announcechat:' + x.id)]);
  return ctx.reply('📨 <b>Выбери чат для объявления</b>:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action(/^announcechat:(-?\d+)$/, async ctx => {
  if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Недостаточно прав.', { show_alert: true });
  if (!isPrivate(ctx)) return ctx.answerCbQuery('Открой выбор в личных сообщениях с ботом.', { show_alert: true });
  const chatId = String(ctx.match[1]);
  const exists = Object.entries(db.groups || {}).some(([id, g]) => String(g.chatId || id) === chatId);
  if (!exists) return ctx.answerCbQuery('Чат больше не подключён.', { show_alert: true });
  const u = normalizeUser(user(ctx.from.id));
  u.pendingAnnouncementChatId = chatId;
  saveDb();
  await ctx.answerCbQuery('Чат выбран');
  return ctx.editMessageText('✍️ Отправь следующим сообщением текст объявления. Оно будет опубликовано в выбранном чате. Для отмены отправь /cancel.');
});

bot.command('publishstartup', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду /publishstartup используй в личных сообщениях с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Команда доступна только владельцу бота.');

  const message =
    '👋 <b>Привет! Я — «Староста Бот».</b> 🤖\n\n' +
    'Я — самостоятельный образовательный IT-стартап, который начал развивать выпускник среднего профессионального образования Краснодарского кооперативного института (ККИ РУК), направления ИСП. Проект вырос из реальных задач студенческой жизни и постепенно превращается из идеи для одной учебной среды в платформу для разных колледжей и университетов.\n\n' +
    '📚 <b>Возможности для студентов</b>\n' +
    '📅 Расписание на сегодня, завтра и всю неделю.\n' +
    '👥 Информация о своей учебной группе.\n' +
    '📖 Просмотр домашних заданий.\n' +
    '📢 Доступ к объявлениям и важной учебной информации.\n' +
    '📱 Удобный личный кабинет в Mini App прямо внутри Telegram.\n\n' +
    '🧑‍🏫 <b>Инструменты для старост и заместителей</b>\n' +
    '👥 Управление списком студентов своей группы.\n' +
    '✅ Учёт посещаемости отдельно по каждому занятию.\n' +
    '📊 Просмотр статистики посещаемости.\n' +
    '📢 Публикация объявлений и учебной информации.\n' +
    '🗳️ Опросы и взаимодействие с участниками группы.\n\n' +
    '🏫 <b>Возможности для администрации</b>\n' +
    '⚙️ Управление учебными группами и пользователями.\n' +
    '⭐ Назначение старост и заместителей.\n' +
    '🏛️ Подключение учебных заведений и назначение их администраторов.\n' +
    '🔐 Разделение групп и административных прав между учебными заведениями.\n\n' +
    '📲 <b>Mini App</b>\n' +
    'Основные учебные разделы и инструменты управления собраны в одном интерфейсе. Mini App открывается прямо в Telegram и рассчитан в том числе на использование с телефона.\n\n' +
    '🚀 <b>История и идея проекта</b>\n' +
    'Всё началось с желания упростить работу старост и сделать учебную информацию доступнее. Сейчас проект развивается небольшими шагами: появляются новые функции, улучшается интерфейс, а предложения студентов и старост помогают определить дальнейшее направление развития.\n\n' +
    '🎯 <b>Наша цель</b> — сделать организацию учебной жизни проще, а взаимодействие студентов, старост и администрации удобнее.\n\n' +
    '<b>«Староста Бот» — создан студентом, развивается для студентов.</b> Это только начало! ❤️';

  try {
    await ctx.telegram.sendMessage(RELEASE_CHANNEL, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '💻 Репозиторий на GitHub', url: 'https://github.com/dimasikD1/starostabotgiv' },
          { text: '🤖 Открыть бота', url: 'https://t.me/starostagivbot' }
        ]]
      }
    });
    console.log('[publishstartup] История проекта опубликована в ' + RELEASE_CHANNEL + ' владельцем ' + ctx.from.id);
    return ctx.reply('✅ Пост о стартапе опубликован в канале ' + RELEASE_CHANNEL + '.');
  } catch (error) {
    console.error('[publishstartup] Не удалось опубликовать пост:', error?.message || error);
    return ctx.reply('❌ Не удалось опубликовать пост. Проверь, что бот добавлен в канал администратором с правом публикации сообщений.');
  }
});

// Владелец может вручную опубликовать расписание следующей недели в обе учебные группы.
bot.command('publishweek', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Команду /publishweek используй в личных сообщениях с ботом.');
  if (!isOwner(ctx.from.id)) return ctx.reply('❌ Команда доступна только владельцу бота.');

  const range = nextMondayDateRange(attendanceDate());

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
    built = await buildWeeklyScheduleText({
      groups: Object.values(STUDY_GROUPS),
      range,
      loadSchedule: getSchedule,
      logger: console
    });
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
bot.hears('🗓 Неделя', ctx => show(ctx, 7, 0, currentMondayDateRange(attendanceDate())));
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
bot.hears('➕ Подключить бота к чату', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личные сообщения с ботом.');
  return ctx.reply(
    '➕ <b>Подключение к уже существующей учебной группе</b>\n\n' +
    '1. Нажми кнопку ниже и выбери нужный существующий Telegram-чат. Создавать новый чат не нужно.\n' +
    '2. Добавь туда Староста Бот.\n' +
    '3. В настройках чата открой «Администраторы» и назначь бота администратором.\n\n' +
    '<b>Нужные права:</b> удаление сообщений, блокировка/ограничение участников и закрепление сообщений. Они нужны для проверки участников и публикации закреплённого расписания. Не выдавай права на добавление других администраторов.\n\n' +
    'После добавления бот сам зарегистрирует чат и сообщит, если каких-то прав не хватает. Существующие сообщения и история чата не затрагиваются.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('➕ Выбрать существующую группу', 'https://t.me/starostagivbot?startgroup=true')]]) }
  );
});
bot.command('openchat', async ctx => {
  if (!ctx.chat || !['group','supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('📩 Команду /openchat нужно выполнить непосредственно в нужном чате.');
  }
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) {
    return ctx.reply('🔒 Открыть возможность писать может только владелец бота или администратор чата.');
  }
  try {
    await ctx.telegram.setChatPermissions(ctx.chat.id, buildOpenChatPermissions(), { use_independent_chat_permissions: true });
    return ctx.reply('🔓 <b>В чате разрешена отправка сообщений всем участникам.</b>\n\nЕсли отдельные пользователи были ограничены персонально (мут), их ограничения нужно снять отдельно в настройках участников.', { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[openchat] setChatPermissions failed:', error?.message || error);
    return ctx.reply('❌ Не удалось изменить разрешения. Проверь, что бот является администратором чата и имеет право «Ограничивать участников».');
  }
});

bot.command('registerchat', async ctx => {
  if (!ctx.chat || !['group', 'supergroup'].includes(ctx.chat.type)) {
    return ctx.reply('Эту команду нужно отправить непосредственно в учебном чате.');
  }
  if (!isOwner(ctx.from.id) && !(await isGroupAdmin(ctx))) {
    return ctx.reply('🔒 Зарегистрировать чат может владелец бота или администратор чата.');
  }
  try {
    registerGroup(ctx);
    console.log('[group setup] Chat manually registered:', ctx.chat.id, ctx.chat.title || '');
    return ctx.reply('✅ <b>Чат зарегистрирован!</b> Теперь он должен появиться в списке /announce.', { parse_mode: 'HTML' });
  } catch (error) {
    console.error('[group setup] Manual registration failed:', error?.message || error);
    return ctx.reply('❌ Не удалось зарегистрировать чат. Проверь логи бота.');
  }
});

bot.command('connectgroup', async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('Открой личные сообщения с ботом.');
  return ctx.reply(
    '➕ <b>Подключение к уже существующей учебной группе</b>\n\n' +
    'Нажми кнопку, выбери существующий чат и добавь туда бота. Затем назначь его администратором с правами удаления сообщений, ограничения участников и закрепления сообщений. Не выдавай право добавлять других администраторов. Бот автоматически зарегистрирует чат после добавления.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('➕ Выбрать существующую группу', 'https://t.me/starostagivbot?startgroup=true')]]) }
  );
});

bot.command(['refreshbuttons', 'refreshmenu'], async ctx => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Обновить кнопки можно только в личных сообщениях с ботом.');
  const keyboard = menuFor(ctx);
  return ctx.reply(
    '🔄 <b>Кнопки обновлены!</b>\nЯ заново проверил твои роли и показал актуальное меню.',
    { parse_mode: 'HTML', ...keyboard }
  );
});

bot.hears('💛 Поддержать хостинг', ctx => {
  if (!isPrivate(ctx)) return ctx.reply('📩 Пожертвование можно отправить в личных сообщениях с ботом.');
  return ctx.reply('💛 <b>Поддержать Староста Бот</b>\n\nСобираю средства на новый хостинг. Пожертвование добровольное и не даёт дополнительных функций. Выбери сумму:', { parse_mode: 'HTML', ...donationKeyboard() });
});

function helpMessage(ctx) {
  return ctx.reply(
    '🤖 <b>Что умеет Староста Бот</b>\n\n' +
    '📅 <b>Расписание</b> — пары на сегодня, завтра и всю неделю.\n' +
    '👥 <b>Моя группа</b> — посмотреть выбранную учебную группу.\n' +
    '📚 <b>Домашние задания</b> — смотреть задания и отмечать выполнение.\n\n' +
    (canManageAttendance(user(ctx.from.id), ctx.from.id)
      ? '⭐ <b>Возможности старосты</b>\n' +
        '• список студентов и управление им;\n' +
        '• посещаемость по отдельным парам и отчёты;\n' +
        '• создание опросов и домашних заданий;\n' +
        '• объявления и важная информация в Mini App.\n\n'
      : '📱 <b>Mini App</b> — удобный кабинет с расписанием и объявлениями.\n\n') +
    'Выбирай нужный раздел кнопками внизу. Если бот только что добавили в группу, сначала подтверди ФИО и выбери свою учебную группу.',
    { parse_mode: 'HTML', ...menuFor(ctx) }
  );
}
bot.command('help', helpMessage);
bot.hears('🔄 Обновить', ctx => show(ctx, 1, 0));
bot.hears('❔ Что умеет бот', helpMessage);
bot.hears('ℹ️ Помощь', ctx => ctx.reply('Нажми «❔ Что умеет бот», чтобы посмотреть возможности.', menuFor(ctx)));

bot.catch(e => console.error('[bot]', e));



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

// Rate-limit buckets remain process-local and are shared by all Mini App routes.
const checkApiRate = createApiRateLimiter();

async function handleMiniAppApi(req,res,url) {
  const requestContext = resolveMiniAppRequestContext(
    req.headers['x-telegram-init-data'],
    req.method,
    {
      verifyInitData: initData => verifyTelegramWebAppInitData(initData, { token }),
      getUser: user,
      normalizeUser,
      checkRate: checkApiRate
    }
  );
  if (requestContext.kind === 'unauthorized') {
    return sendJson(res,401,{error:requestContext.message});
  }
  if (requestContext.kind === 'rate-limited') {
    const retryAfter = requestContext.retryAfter;
    return sendJson(res,429,{error:'Слишком много запросов. Подожди '+retryAfter+' с и попробуй снова.'},{'Retry-After':String(retryAfter)});
  }
  const { telegramUser: tgUser, user: u } = requestContext;
  // Подписка временно отключена: Mini App доступен без оплаты.
  if(req.method==='GET' && url.pathname==='/api/groups') {
    const groups=getMiniAppAccessibleGroups(tgUser.id,accessibleGroups);
    return sendJson(res,200,{groups});
  }
  // Telegram chat controls are scoped to chats where the user manages every cohort.
  if (url.pathname === '/api/telegram-chats') {
    const chats = listManagedMiniAppTelegramChats(db.groups, tgUser.id, canManageChat);
    if (req.method === 'GET') {
      return sendJson(res,200,{chats:chats.map(chat=>({id:String(chat.chatId),title:String(chat.title||'Учебный чат')}))});
    }
    if (req.method === 'POST') {
      try {
        const body=await readJsonBody(req);
        const chatId=String(body.chatId||'');
        const chat=chats.find(item=>String(item.chatId)===chatId);
        if(!chat) return sendJson(res,403,{error:'Нет прав на управление этим чатом.'});
        const result = await performMiniAppTelegramChatAction(
          chat,
          String(body.action||''),
          body,
          tgUser,
          u.fullName,
          {
            setChatPermissions: (chatId, permissions, options) => bot.telegram.setChatPermissions(chatId, permissions, options),
            sendMessage: (chatId, message) => bot.telegram.sendMessage(chatId, message, {parse_mode:'HTML'}),
            normalizeText: normalizeAnnouncementText,
            formatMessage: message => formatAnnouncementMessage(message,'Объявление',escapeHtml),
            createRecord: (text, authorId, authorName) => createAnnouncementRecord({
              id:crypto.randomUUID(),text,authorId,authorName,createdAt:new Date().toISOString()
            }),
            ensureStudyGroups,
            appendAnnouncement,
            save: saveDb
          }
        );
        if(!result.ok && result.reason==='empty') return sendJson(res,400,{error:'Напиши текст объявления.'});
        if(!result.ok && result.reason==='too-long') return sendJson(res,400,{error:'Максимум 3000 символов.'});
        if(!result.ok) return sendJson(res,400,{error:'Неизвестное действие.'});
        return sendJson(res,200,{ok:true,message:result.message});
      } catch(error) {
        console.error('[miniapp telegram chat]',error?.message||error);
        return sendJson(res,502,{error:'Не удалось выполнить действие. Проверь права бота администратора в чате.'});
      }
    }
  }
  const selectedGroupId=String(url.searchParams.get('groupId')||'');
  const groupAccess = resolveMiniAppGroupAccess(tgUser.id, selectedGroupId, {
    getManagedGroup: managedGroup,
    canManageGroup
  });
  if (groupAccess.kind === 'forbidden') {
    return sendJson(res,403,{error:groupAccess.message});
  }
  const g = groupAccess.group;
  if (isMiniAppManagerWriteRoute(req.method, url.pathname) && !canManageGroup(tgUser.id,g)) {
    return sendJson(res,403,{error:'Недостаточно прав для изменения данных этой учебной группы.'});
  }
  if(req.method==='GET' && url.pathname==='/api/data') {
    const scheduleState = loadMiniAppSchedule(
      g.scheduleGroup,
      getMiniAppSchedule,
      (scheduleGroup, error) => {
        console.error('[miniapp data] schedule unavailable for group:', scheduleGroup, error?.stack || error?.message || error);
      }
    );
    const { items: scheduleItems, error: scheduleError, loading: scheduleLoading } = scheduleState;
    const today=attendanceDate();
    const lessons=scheduleItems.filter(x=>x.date===today&&x.subject).sort((a,b)=>String(a.timeStart||'').localeCompare(String(b.timeStart||'')));
    const students=g.students||[];
    const miniAppData=buildMiniAppGroupData({
      scheduleItems,students,lessonAttendance:g.lessonAttendance||{},today,
      getLessonKey:attendanceLessonKey,getStudentKey:attendanceKey,getStudentName:studentName,
      homework:g.homework||[],users:db.users||{},announcements:g.announcements||[]
    });

    return sendJson(res,200,buildMiniAppDataResponse({
      telegramUser: tgUser,
      user: u,
      group: g,
      isOwner: isOwner(tgUser.id),
      canManageTelegramChats: managedChats(tgUser.id).length > 0,
      institutionAdmin: isInstitutionAdmin(tgUser.id,g.institutionId),
      institution: db.institutions?.[String(g.institutionId||'')],
      date: today,
      data: miniAppData,
      scheduleError,
      scheduleLoading
    }));
  }
  if(req.method==='DELETE' && url.pathname==='/api/students') {
    const result = clearMiniAppRosterAndSave(
      g,
      clearMiniAppStudentRoster,
      saveDb,
      cleared => console.log('[miniapp students] roster cleared', {group:g.title||'',by:String(tgUser.id),count:cleared.deleted})
    );
    if(result.empty) return sendJson(res,400,{error:'Список студентов уже пуст.'});
    return sendJson(res,200,{ok:true,deleted:result.deleted});
  }
  if(req.method==='POST' && url.pathname==='/api/profile') {
    try {
      const body=await readJsonBody(req);
      const result = updateMiniAppProfile(u, body.fullName, {
        validateName: validateMiniAppProfileName,
        save: saveDb
      });
      if(!result.ok) return sendJson(res,result.status,{error:result.error});
      return sendJson(res,200,{ok:true,fullName:result.fullName});
    } catch(e) {
      console.error('[miniapp profile update]',e?.message||e);
      return sendJson(res,400,{error:'Не удалось сохранить профиль.'});
    }
  }
  if(req.method==='POST' && url.pathname==='/api/announcements') {
    try {
      const body=await readJsonBody(req);
      const result = await publishMiniAppAnnouncement(g, body.text, tgUser, {
        normalizeText: normalizeAnnouncementText,
        sendMessage: (chatId, message) => bot.telegram.sendMessage(chatId, message, {parse_mode:'HTML'}),
        formatMessage: message => formatAnnouncementMessage(message,'Объявление группы',escapeHtml),
        createRecord: (text, authorId, authorName) => createAnnouncementRecord({
          id:crypto.randomUUID(),text,authorId,authorName,createdAt:new Date().toISOString()
        }),
        append: appendAnnouncement,
        save: saveDb
      });
      if(!result.ok && result.reason==='empty') return sendJson(res,400,{error:'Напиши текст объявления.'});
      if(!result.ok && result.reason==='too_long') return sendJson(res,400,{error:'Объявление слишком длинное. Максимум 3000 символов.'});
      if(!result.ok) return sendJson(res,400,{error:'К группе не привязан Telegram-чат. Сначала выполни /attach в группе.'});
      return sendJson(res,200,{ok:true,announcement:result.announcement});
    } catch(e) {
      console.error('[miniapp announcement]',e?.message||e);
      return sendJson(res,502,{error:'Не удалось отправить объявление в группу. Проверь, что бот добавлен в чат и может отправлять сообщения.'});
    }
  }
  if(req.method==='POST' && url.pathname==='/api/homework-media-upload') {
    try {
      const body=await readJsonBody(req,12*1024*1024),validation=validateHomeworkMediaUpload(body);
      if(!validation.ok&&validation.reason==='type')return sendJson(res,400,{error:'Поддерживаются JPG, PNG и MP4.'});
      if(!validation.ok)return sendJson(res,413,{error:'Файл слишком большой. Максимум 8 МБ.'});
      const {fileName,mimeType,type,buffer}=validation;
      const message=type==='photo'?await bot.telegram.sendPhoto(String(tgUser.id),{source:buffer,filename:fileName}):await bot.telegram.sendVideo(String(tgUser.id),{source:buffer,filename:fileName});
      const fileId=type==='photo'?message.photo?.[message.photo.length-1]?.file_id:message.video?.file_id;
      if(!fileId)throw new Error('Telegram не вернул file_id вложения.');
      try{await bot.telegram.deleteMessage(String(tgUser.id),message.message_id)}catch(e){console.warn('[homework media cleanup]',e?.message||e)}
      g.pendingHomeworkMedia||={};const ownerKey=String(tgUser.id),pending=g.pendingHomeworkMedia[ownerKey]||{};
      for(const [key,value] of Object.entries(pending))if(Date.now()-Number(value.createdAt||0)>2*60*60*1000)delete pending[key];
      const id=crypto.randomUUID();pending[id]={fileId,type,fileName,mimeType:type==='photo'?(mimeType||'image/jpeg'):mimeType,createdAt:Date.now()};g.pendingHomeworkMedia[ownerKey]=pending;saveDb();
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
      const body=await readJsonBody(req),fields=validateMiniAppHomeworkFields(body.subject,body.homework);
      if(!fields.ok&&fields.reason==='subject')return sendJson(res,400,{error:'Укажи предмет (до 100 символов).'});
      if(!fields.ok)return sendJson(res,400,{error:'Укажи задание (до 3500 символов).'});
      const subject=fields.subject,homework=fields.homework;
      if(!g.chatId)return sendJson(res,400,{error:'К группе не привязан Telegram-чат. Сначала выполни /attach в группе.'});
      const pending=g.pendingHomeworkMedia?.[String(tgUser.id)]||{},requested=Array.isArray(body.attachments)?body.attachments:[];
      const attachmentValidation=validateNewHomeworkAttachments(requested,pending);
      if(!attachmentValidation.ok&&attachmentValidation.reason==='limit')return sendJson(res,400,{error:'К одному ДЗ можно прикрепить не более 10 файлов.'});
      if(!attachmentValidation.ok)return sendJson(res,400,{error:'Одно из вложений устарело. Прикрепи файл ещё раз.'});
      const attachments=attachmentValidation.attachments||[];
      const result = await createMiniAppHomework(g, String(tgUser.id), {
        id:crypto.randomUUID(),subject,homework,attachments,
        createdAt:new Date().toISOString(),authorId:String(tgUser.id),
        requestedAttachmentIds:requested.map(entry=>String(entry.id))
      }, {
        save:saveDb,
        afterCreate:async item => {
          await bot.telegram.sendMessage(g.chatId,'📚 <b>Новое домашнее задание</b>\n\n<b>'+escapeHtml(subject)+'</b>\n'+escapeHtml(homework),{parse_mode:'HTML'});
          if(attachments.length===1){const a=attachments[0];if(a.type==='photo')await bot.telegram.sendPhoto(g.chatId,a.fileId,{caption:'📎 Материал к ДЗ: '+subject});else await bot.telegram.sendVideo(g.chatId,a.fileId,{caption:'📎 Материал к ДЗ: '+subject});}
          else if(attachments.length>1)await bot.telegram.sendMediaGroup(g.chatId,attachments.map(a=>({type:a.type,media:a.fileId})));
        },
        onPublishError:(_operation,error)=>console.error('[homework group publish]',error?.message||error)
      });
      return sendJson(res,200,{ok:true,homework:result.record});
    } catch(e) {console.error('[miniapp homework create]',e?.message||e);return sendJson(res,502,{error:'Не удалось создать домашнее задание.'});}
  }
  if(req.method==='PUT' && url.pathname==='/api/homework') {
    try {
      const body=await readJsonBody(req),id=String(body.id||'');
      const item=(g.homework||[]).find(x=>String(x.id||'')===id);
      if(!item)return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      const fields=validateMiniAppHomeworkFields(body.subject,body.homework);
      if(!fields.ok)return sendJson(res,400,{error:'Проверь предмет и текст задания.'});
      const subject=fields.subject,homework=fields.homework;
      let added=[];
      let updatedAttachments;
      if(Array.isArray(body.attachments)){
        const pending=g.pendingHomeworkMedia?.[String(tgUser.id)]||{};
        const attachmentValidation=validateUpdatedHomeworkAttachments(body.attachments,pending,item.attachments);
        for(const id of attachmentValidation.consumedIds||[])delete pending[id];
        if(!attachmentValidation.ok&&attachmentValidation.reason==='limit')return sendJson(res,400,{error:'К одному ДЗ можно прикрепить не более 10 файлов.'});
        if(!attachmentValidation.ok&&attachmentValidation.reason==='old')return sendJson(res,400,{error:'Одно из старых вложений не найдено.'});
        if(!attachmentValidation.ok&&attachmentValidation.reason==='stale')return sendJson(res,400,{error:'Новое вложение устарело. Прикрепи его ещё раз.'});
        if(!attachmentValidation.ok)return sendJson(res,400,{error:'Некорректное вложение.'});
        updatedAttachments=attachmentValidation.attachments||[];
        added=attachmentValidation.added||[];
      }
      const result = await updateMiniAppHomeworkRecord(g,id,{
        subject,homework,updatedAt:new Date().toISOString(),attachments:updatedAttachments
      },added,{
        save:saveDb,
        afterUpdate:async (_record,newAttachments)=>{
          if(!g.chatId)return;
          await bot.telegram.sendMessage(g.chatId,'✏️ <b>Изменено домашнее задание</b>\n\n<b>'+escapeHtml(subject)+'</b>\n'+escapeHtml(homework),{parse_mode:'HTML'});
          if(newAttachments.length===1){const a=newAttachments[0];if(a.type==='photo')await bot.telegram.sendPhoto(g.chatId,a.fileId,{caption:'📎 Дополнительный материал к ДЗ: '+subject});else await bot.telegram.sendVideo(g.chatId,a.fileId,{caption:'📎 Дополнительный материал к ДЗ: '+subject});}
          else if(newAttachments.length>1)await bot.telegram.sendMediaGroup(g.chatId,newAttachments.map(a=>({type:a.type,media:a.fileId})));
        },
        onPublishError:(_operation,error)=>console.error('[homework update notify]',error?.message||error)
      });
      if(!result.ok)return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      return sendJson(res,200,{ok:true,homework:result.record});
    } catch(e) {console.error('[miniapp homework update]',e?.message||e);return sendJson(res,400,{error:'Не удалось изменить ДЗ.'});}
  }
  if(req.method==='DELETE' && url.pathname==='/api/homework') {
    try {
      const body=await readJsonBody(req),idValidation=validateHomeworkRecordId(body.id);
      if(!idValidation.ok)return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      if(!deleteMiniAppHomeworkRecord(g,idValidation.id,saveDb))return sendJson(res,404,{error:'Домашнее задание не найдено.'});
      return sendJson(res,200,{ok:true});
    } catch(e) {console.error('[miniapp homework delete]',e?.message||e);return sendJson(res,400,{error:'Не удалось удалить ДЗ.'});}
  }
  if(req.method==='POST' && url.pathname==='/api/attendance') {
    try {
      const body=await readJsonBody(req);
      const result = await updateMiniAppAttendance(g, body, {
        validate: validateMiniAppAttendanceMark,
        getTodayLessons: () => getMiniAppTodayLessons(g),
        getLessonKey: attendanceLessonKey,
        getStudentKey: attendanceKey,
        save: saveDb
      });
      if(!result.ok && result.reason==='lesson-not-found') {
        return sendJson(res,400,{error:'Эта пара отсутствует в сегодняшнем расписании. Обнови страницу.'});
      }
      if(!result.ok) return sendJson(res,400,{error:'Некорректная отметка.'});
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

// Mini App открывается внутри Telegram, поэтому inline-стили и скрипты разрешены,
// а внешние источники — только собственный origin.
const APP_SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
  ].join('; ')
};

let webappCache = { mtimeMs: 0, raw: '', gzip: null };
function readWebapp() {
  const stat = fs.statSync(webappFile);
  if (webappCache.mtimeMs !== stat.mtimeMs) {
    const raw = fs.readFileSync(webappFile, 'utf8');
    webappCache = { mtimeMs: stat.mtimeMs, raw, gzip: zlib.gzipSync(raw, { level: 9 }) };
  }
  return webappCache;
}

const healthServer = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url || '/', 'http://localhost');
  // Логируем только метод, путь, статус и длительность — без query-параметров и пользовательских данных.
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/') || url.pathname === '/app' || url.pathname === '/app/') {
      console.log('[http timing]', req.method, url.pathname, res.statusCode, Date.now() - startedAt + 'ms');
    }
  });
  if (url.pathname === '/__client-error') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
    }
    try {
      const now = Date.now();
      if (!globalThis.__miniAppErrorWindow || now - globalThis.__miniAppErrorWindow.startedAt >= 60000) {
        globalThis.__miniAppErrorWindow = { startedAt: now, count: 0 };
      }
      if (globalThis.__miniAppErrorWindow.count >= 30) {
        return sendJson(res, 429, { error: 'Слишком много диагностических сообщений.' });
      }
      globalThis.__miniAppErrorWindow.count++;
      const body = await readJsonBody(req, 8192);
      const diagnostic = sanitizeMiniAppClientError(body);
      console.error('[miniapp client error]', JSON.stringify(diagnostic));
      return sendJson(res, 202, { ok: true });
    } catch (error) {
      console.error('[miniapp client error endpoint]', error?.stack || error?.message || error);
      return sendJson(res, 400, { error: 'Некорректное диагностическое сообщение.' });
    }
  }
  if (url.pathname.startsWith('/api/')) {
    // Без этого обработчика любое необработанное исключение оставляло запрос
    // висеть до таймаута клиента.
    try {
      await handleMiniAppApi(req,res,url);
    } catch (e) {
      console.error('[http api]', e?.stack || e?.message || e);
      if (!res.headersSent) sendJson(res,500,{error:'Внутренняя ошибка сервера. Попробуй ещё раз позже.'});
      else try { res.end(); } catch {}
    }
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    return sendText(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (url.pathname === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      version: BOT_RELEASE_VERSION,
      time: new Date().toISOString()
    });
  }
  if (url.pathname === '/terms' || url.pathname === '/privacy') {
    try {
      const legalFile = url.pathname === '/terms' ? 'terms.html' : 'privacy.html';
      const legalPath = new URL('./webapp/' + legalFile, import.meta.url);
      const body = fs.readFileSync(legalPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        ...APP_SECURITY_HEADERS
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(body);
    } catch (e) {
      console.error('[legal page]', e?.message || e);
      return sendText(req, res, 500, 'Документ временно недоступен.');
    }
  }
  if (url.pathname === '/telegram-web-app.js') {
    try {
      const sdkFile = new URL('./webapp/telegram-web-app.js', import.meta.url);
      const sdk = fs.readFileSync(sdkFile, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(sdk);
    } catch (e) {
      console.error('[miniapp sdk]', e.message || e);
      return sendText(req, res, 500, 'Telegram WebApp SDK не найден.');
    }
  }
  if (url.pathname === '/app' || url.pathname === '/app/') {
    try {
      const { raw, gzip } = readWebapp();
      const useGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || '')) && gzip;
      const body = useGzip ? gzip : Buffer.from(raw, 'utf8');
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        ...APP_SECURITY_HEADERS
      };
      if (useGzip) {
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
      }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      return res.end(body);
    } catch (e) {
      console.error('[miniapp app]', e?.message || e);
      return sendText(req, res, 500, 'Mini App не найден.');
    }
  }
  if (url.pathname === '/' || url.pathname === '/health') {
    return sendText(req, res, 200, 'OK');
  }
  return sendText(req, res, 404, 'Not Found');
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
  if (shouldNotifyRelease(OWNER_TELEGRAM_IDS, db.lastNotifiedRelease, BOT_RELEASE_VERSION)) {
    const releaseMessage = buildReleaseMessage(BOT_RELEASE_VERSION, BOT_RELEASE_NOTES, escapeHtml);
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


  // Приветственный пост в канал публикуем один раз, а не при каждом обновлении версии.
  // Уведомления о новой версии владельцам отправляются отдельно выше (lastNotifiedRelease).
  if (RELEASE_CHANNEL && !db.welcomePublished && !db.lastPublishedRelease) {
    const channelReleaseMessage =
      '🚀 <b>Привет! Я — «Староста Бот». И у меня есть своя история.</b>\n\n' +
      'Мой путь начался с идеи одного выпускника Краснодарского кооперативного института (ККИ РУК), направления ИСП. Это самостоятельный образовательный IT-проект, который вырос из реальных задач студенческой жизни.\n\n' +
      '📚 Сначала главной целью было упростить повседневные дела учебной группы: расписание, посещаемость, домашние задания, списки студентов и организационную работу старост.\n\n' +
      'Постепенно я начал превращаться из небольшого помощника для одной учебной группы в проект с более масштабной целью — стать удобной платформой для разных колледжей и университетов.\n\n' +
      '🎯 <b>Моя миссия</b> — сделать студенческую жизнь организованнее, а работу старост проще.\n\n' +
      'Я продолжаю развиваться, получать новые функции и становиться лучше благодаря обратной связи пользователей. Это только начало моей истории!\n\n' +
      '<b>«Староста Бот» — создан студентом, развивается для студентов.</b> 🚀\n\n' +
      '🤖 Открыть бота: @starostagivbot';
    try {
      await bot.telegram.sendMessage(RELEASE_CHANNEL, channelReleaseMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '💻 Репозиторий на GitHub', url: 'https://github.com/dimasikD1/starostabotgiv' },
            { text: '🤖 Открыть бота', url: 'https://t.me/starostagivbot' }
          ]]
        }
      });
      db.welcomePublished = true;
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
        buildRestartMessage(),
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
    { command: 'connectgroup', description: 'Подключить бота к существующей группе' },
    { command: 'refreshbuttons', description: 'Обновить кнопки личного меню' },
    { command: 'schedule', description: 'Расписание на сегодня' },
    { command: 'group', description: 'Моя учебная группа' },
    { command: 'hw', description: 'Домашние задания' },
    { command: 'attendance', description: 'Журнал посещаемости' },
    { command: 'app', description: 'Открыть веб-кабинет' },
    { command: 'students', description: 'Список студентов группы' },
    { command: 'importstudents', description: 'Импорт списка студентов из текста' },
    { command: 'pollreport', description: 'Ответы на последний опрос' },
    { command: 'help', description: 'Что умеет бот' }
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
  await bot.launch({ dropPendingUpdates: false, allowedUpdates: ['message', 'callback_query', 'poll_answer', 'pre_checkout_query', 'chat_member', 'my_chat_member'] });
  await checkAutomaticAttendancePolls();
  setInterval(checkAutomaticAttendancePolls, 30000).unref();
  await checkWeeklySchedules();
  setInterval(checkWeeklySchedules, WEEKLY_SCHEDULE_CHECK_INTERVAL_MS).unref();
setInterval(checkScheduleChanges, SCHEDULE_CHANGE_CHECK_INTERVAL_MS).unref();
}

function shutdown(signal) {
  console.log('[bot] Остановка (' + signal + ').');
  try { bot.stop(signal); } catch {}
  try { healthServer.close(); } catch {}
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', error => {
  console.error('[fatal uncaughtException]', error?.stack || error);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  console.error('[fatal unhandledRejection]', reason?.stack || reason);
  process.exit(1);
});

main().catch(e => {
  console.error('[fatal main]', e?.stack || e);
  process.exit(1);
});
