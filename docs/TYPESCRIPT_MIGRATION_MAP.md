# Карта разбиения `bot-amvera/index.mjs` на модули

> Рабочая карта ветки `typescript-migration`. Снимок исходника: blob SHA `7904c36cba323903d2a32d158e922a5daf2adebd`, 3497 строк. Это план декомпозиции, а не утверждение, что код уже перенесён.

## Принцип разбиения

Не создавать сотни файлов по одному на каждую короткую функцию. Выносить каждую функцию из монолита в отдельный именованный модуль/файл по предметной области, а связанные обработчики Telegram держать в отдельном файле регистрации обработчиков. Каждая публичная функция получает явный TypeScript-интерфейс зависимостей и отдельные тесты. `index.mjs` постепенно оставить только как composition root: создать БД, бота, сервер и подключить модули.

Порядок переноса: чистые функции → доменные сервисы → Telegram handlers → Mini App API/HTTP → запуск. На каждом шаге сначала characterization tests на текущее поведение, затем перенос без изменения поведения, затем CI.

## Карта доменов и проверок

### 1. Запуск и доступ

**Что переносить:** isOwner, isInstitutionAdmin, subscriptionUntil, hasActiveSubscription, donationKeyboard, registrationMiddleware, my_chat_member, studygroup callback, user, isManagerRole, canManageAttendance, getMenu, menuFor, roleLabel.

**Что проверять:** Проверить владельцев, администраторов заведения, регистрацию без username, выбор группы, сохранение ролей, меню и отсутствие влияния подписки на доступ.

### 2. Студенты и роли

**Что переносить:** studentName, attendanceKey, importPreviewKeyboard, studentListKeyboard, studentCardText, studentCardKeyboard, formatStudentList, showRole, role/delrole/allroles/starosta/zam/setstarosta/appointstarosta/setstudent handlers.

**Что проверять:** Проверить импорт текстом, дубли, карточки и пагинацию, назначение/снятие ролей, привязку ролей к правильной учебной группе, owner не отображается студентом.

### 3. Учебные группы и права

**Что переносить:** ensureStudyGroups, allStudyGroups, canManageGroup, managedStudyGroups, canManageChat, managedChats, studyGroupForUser, accessibleGroups, managedGroup, isPrivate, isGroupAdmin, registerGroup, removeGroup, group/setgroup/setsubgroup/attach/detach/openchat/registerchat/connectgroup handlers.

**Что проверять:** Проверить tenant/group связи, два курса в одном чате, права старосты и заместителя только в своей группе, повторную регистрацию и снятие чата.

### 4. Расписание и календарь

**Что переносить:** attendanceDate, attendanceLessonKey, getCachedSchedule, getMiniAppSchedule, getTodayLessons, format, show, timeZoneParts, checkCalendarEventReminders, nextWeekDateRange, buildWeeklyScheduleText, checkWeeklySchedules, checkScheduleChanges, schedule/tomorrow/week/publishweek handlers.

**Что проверять:** Проверить даты и Europe/Moscow, сортировку пар, кэш и stale fallback, одновременные запросы, недельную публикацию и напоминания.

### 5. Посещаемость

**Что переносить:** formatAttendance, attendanceLessonsKeyboard, formatLessonAttendance, attendancePairButtons, createAttendanceHtml, attendanceButtons, attendanceStatusButtons, attendance/pollreport/mark handlers, attendanceweb callbacks, attstudent/attlesson/attpair callbacks, checkAutomaticAttendancePolls, poll_answer handler.

**Что проверять:** Проверить статусы по каждой паре, отсутствие отметки, пагинацию, отчёты HTML за неделю/месяц/всё время, корректную группу и автоматические опросы.

### 6. Домашние задания и опросы

**Что переносить:** studentButtons, groupButtons, homeworkButtons, startHomework, startPoll, homeworkMessage, sendHomeworkAttachments, showHomework, hw/homework/dz/poll handlers, hwcomplete callback.

**Что проверять:** Проверить создание и просмотр ДЗ, адресацию по группе, вложения, отметку выполнения, создание опроса и обработку ответов.

### 7. Учебные заведения и структура

**Что переносить:** addinstitution/institutions/deleteinstitution/setinstadmin/removeinstadmin/instadmins handlers, institutionForStructureCommand, structureParts, newStructureId, sameStructureName, addfaculty/adddirection/addcourse/linkgroup/structure handlers.

**Что проверять:** Проверить изоляцию данных заведений, права администраторов, уникальность ID/названий, связи факультет→направление→курс→группа.

### 8. Объявления и Telegram-интерфейс

**Что переносить:** announce/announcechat handlers, publishstartup, menu, hears handlers, donate, helpMessage, refreshbuttons, group/student menu callbacks.

**Что проверять:** Проверить выбор чата, права публикации, корректные меню в ЛС/группе, команды и отсутствие возвращения подписочного UI.

### 9. Mini App API и HTTP

**Что переносить:** verifyMiniAppInitData, sendJson, checkApiRate, readJsonBody, getMiniAppTodayLessons, handleMiniAppApi, readWebapp, sendText, healthServer.

**Что проверять:** Проверить подпись initData, rate limit, размер JSON, права доступа, ответы API, ошибки, gzip, HEAD/GET, security headers и healthz.

### 10. Оплата, системные события и запуск

**Что переносить:** myid/grant/revoke/subinfo/stats/terms/paysupport handlers, callback_query, pre_checkout_query, successful_payment, telegramStartupRequest, main, shutdown.

**Что проверять:** Проверить обработку платежных событий только если соответствующая функция остаётся включённой; запуск Telegram, повторные попытки, уведомления владельцев, расписания таймеров и graceful shutdown.


## Полный перечень найденных функций и регистраций обработчиков

| Строка в снимке | Функция / регистрация |
|---:|---|
| 59 | `isOwner` |
| 63 | `isInstitutionAdmin` |
| 70 | `subscriptionUntil` |
| 75 | `hasActiveSubscription` |
| 79 | `donationKeyboard` |
| 86 | `registrationMiddleware` |
| 109 | `bot.on('my_chat_member')` |
| 163 | `bot.use(registrationMiddleware)` |
| 203 | `bot.action(/^studygroup:(1/2)` |
| 270 | `user` |
| 278 | `isManagerRole` |
| 281 | `canManageAttendance` |
| 284 | `getMenu` |
| 287 | `menuFor` |
| 290 | `roleLabel` |
| 294 | `studentName` |
| 297 | `attendanceKey` |
| 298 | `importPreviewKeyboard` |
| 302 | `attendanceDate` |
| 303 | `attendanceLessonKey` |
| 310 | `getCachedSchedule` |
| 343 | `getMiniAppSchedule` |
| 363 | `getTodayLessons` |
| 368 | `ensureStudyGroups` |
| 435 | `allStudyGroups` |
| 436 | `canManageGroup` |
| 441 | `managedStudyGroups` |
| 444 | `canManageChat` |
| 449 | `managedChats` |
| 452 | `studyGroupForUser` |
| 457 | `accessibleGroups` |
| 481 | `managedGroup` |
| 491 | `formatAttendance` |
| 501 | `attendanceLessonsKeyboard` |
| 508 | `formatLessonAttendance` |
| 522 | `attendancePairButtons` |
| 537 | `createAttendanceHtml` |
| 555 | `format` |
| 576 | `show` |
| 599 | `timeZoneParts` |
| 608 | `checkCalendarEventReminders` |
| 638 | `checkAutomaticAttendancePolls` |
| 695 | `nextWeekDateRange` |
| 707 | `buildWeeklyScheduleText` |
| 748 | `checkWeeklySchedules` |
| 787 | `checkScheduleChanges` |
| 881 | `isPrivate` |
| 885 | `isGroupAdmin` |
| 895 | `registerGroup` |
| 901 | `removeGroup` |
| 907 | `attendanceButtons` |
| 912 | `attendanceStatusButtons` |
| 920 | `studentButtons` |
| 925 | `groupButtons` |
| 934 | `homeworkButtons` |
| 943 | `startHomework` |
| 977 | `startPoll` |
| 1018 | `bot.command('myid')` |
| 1022 | `bot.command('grant')` |
| 1059 | `bot.command('revoke')` |
| 1080 | `bot.command('subinfo')` |
| 1093 | `bot.command('stats')` |
| 1132 | `bot.command('terms')` |
| 1139 | `bot.command('paysupport')` |
| 1145 | `bot.on('poll_answer')` |
| 1176 | `bot.command('events')` |
| 1189 | `bot.command('pollreport')` |
| 1212 | `bot.on('callback_query')` |
| 1235 | `bot.on('pre_checkout_query')` |
| 1239 | `bot.on('successful_payment')` |
| 1333 | `bot.command(['admin')` |
| 1376 | `bot.command('group')` |
| 1397 | `bot.command('setsubgroup')` |
| 1408 | `bot.command('setgroup')` |
| 1420 | `bot.command('attach')` |
| 1432 | `bot.command('detach')` |
| 1439 | `bot.on('photo')` |
| 1455 | `bot.command('importstudents')` |
| 1471 | `bot.command('cancel')` |
| 1478 | `bot.action('studentimport:confirm')` |
| 1505 | `bot.action('studentimport:cancel')` |
| 1512 | `bot.on('text')` |
| 1613 | `studentListKeyboard` |
| 1628 | `studentCardText` |
| 1635 | `studentCardKeyboard` |
| 1642 | `formatStudentList` |
| 1645 | `bot.command('students')` |
| 1652 | `bot.command('student')` |
| 1662 | `bot.command('delstudent')` |
| 1667 | `bot.hears('👨‍🎓 Список студентов')` |
| 1669 | `showRole` |
| 1687 | `bot.command('role')` |
| 1688 | `bot.command('roles')` |
| 1691 | `bot.command(['delrole')` |
| 1714 | `bot.command(['allroles')` |
| 1766 | `bot.command('starosta')` |
| 1787 | `bot.command('zam')` |
| 1808 | `bot.command('setstarosta')` |
| 1826 | `bot.command('appointstarosta')` |
| 1832 | `bot.command('setstudent')` |
| 1853 | `bot.command('app')` |
| 1862 | `bot.command('attendance')` |
| 1877 | `bot.command(['attendanceweb')` |
| 1891 | `bot.action('attendanceweb:cancel')` |
| 1900 | `bot.action('attendanceweb:confirm')` |
| 1912 | `bot.action(/^attendanceweb:period:(week/month/all)` |
| 1934 | `bot.command('mark')` |
| 1945 | `bot.command('addinstitution')` |
| 2005 | `bot.command('institutions')` |
| 2020 | `bot.command('deleteinstitution')` |
| 2063 | `bot.command('setinstadmin')` |
| 2084 | `bot.command('removeinstadmin')` |
| 2101 | `bot.command('instadmins')` |
| 2118 | `institutionForStructureCommand` |
| 2127 | `structureParts` |
| 2132 | `newStructureId` |
| 2135 | `sameStructureName` |
| 2142 | `bot.command('addfaculty')` |
| 2159 | `bot.command('adddirection')` |
| 2178 | `bot.command('addcourse')` |
| 2198 | `bot.command('linkgroup')` |
| 2244 | `bot.command('structure')` |
| 2273 | `bot.command('groups')` |
| 2280 | `bot.command('poll')` |
| 2281 | `bot.command('hw')` |
| 2282 | `bot.command('homework')` |
| 2283 | `homeworkMessage` |
| 2292 | `sendHomeworkAttachments` |
| 2315 | `showHomework` |
| 2326 | `bot.hears(/^📚\\s*ДЗ\\s*$/iu)` |
| 2327 | `bot.command('dz')` |
| 2328 | `bot.action(/^hwcomplete:([a-f0-9-]{36})` |
| 2341 | `bot.hears('📚 Создать ДЗ')` |
| 2345 | `bot.hears('📊 Создать опрос')` |
| 2351 | `bot.action(/^studentcard:(\d+)` |
| 2357 | `bot.action(/^studentedit:(username/phone)` |
| 2365 | `bot.action('studentback')` |
| 2370 | `bot.action(/^studentpage:(\d+)` |
| 2375 | `bot.action(/^attstudent:(\d+)` |
| 2380 | `bot.action(/^attlesson:(\d+)` |
| 2388 | `bot.action(/^attpairmark:(\d+)` |
| 2398 | `bot.action(/^attpairpage:(\d+)` |
| 2405 | `bot.action('attpairback')` |
| 2413 | `bot.on('callback_query')` |
| 2481 | `bot.command('schedule')` |
| 2482 | `bot.command('tomorrow')` |
| 2483 | `bot.command('week')` |
| 2487 | `bot.command('announce')` |
| 2499 | `bot.action(/^announcechat:(-?\d+)` |
| 2512 | `bot.command('publishstartup')` |
| 2562 | `bot.command('publishweek')` |
| 2615 | `bot.command('menu')` |
| 2616 | `bot.hears('📅 Сегодня')` |
| 2617 | `bot.hears('📅 Завтра')` |
| 2618 | `bot.hears('🗓 Неделя')` |
| 2619 | `bot.hears('👥 Моя группа')` |
| 2623 | `bot.hears('👥 Группы')` |
| 2630 | `bot.hears('📋 Посещаемость')` |
| 2645 | `bot.command('donate')` |
| 2649 | `bot.hears('➕ Подключить бота к чату')` |
| 2661 | `bot.command('openchat')` |
| 2688 | `bot.command('registerchat')` |
| 2705 | `bot.command('connectgroup')` |
| 2714 | `bot.command(['refreshbuttons')` |
| 2723 | `bot.hears('💛 Поддержать хостинг')` |
| 2728 | `helpMessage` |
| 2745 | `bot.command('help')` |
| 2746 | `bot.hears('🔄 Обновить')` |
| 2747 | `bot.hears('❔ Что умеет бот')` |
| 2748 | `bot.hears('ℹ️ Помощь')` |
| 2753 | `verifyMiniAppInitData` |
| 2772 | `sendJson` |
| 2784 | `checkApiRate` |
| 2807 | `readJsonBody` |
| 2813 | `getMiniAppTodayLessons` |
| 2827 | `handleMiniAppApi` |
| 3190 | `readWebapp` |
| 3199 | `sendText` |
| 3309 | `telegramStartupRequest` |
| 3326 | `main` |
| 3484 | `shutdown` |

## Правила проверки каждого переноса

1. Зафиксировать текущее поведение тестом до перемещения.
2. Проверить все места вызова и передать зависимости явно (db, saveDb, bot, clock, timezone, config), не импортировать глобальный singleton из нового домена.
3. Сохранить формат сообщений, callback data, команды и структуру JSON-хранилища.
4. Добавить позитивный, негативный и граничный тест; для прав — отдельные тесты owner/starosta/zam/student и двух разных групп.
5. После переноса выполнить `npm run typecheck`, `npm run check`, `npm test`.
6. Не менять production/main и не переключать Amvera на эту ветку.

## Предлагаемая структура

```text
bot-amvera/
  app/                 # composition root и конфигурация
  domain/
    users/             # профиль, нормализация, роли
    groups/            # учебные группы, доступ, tenant structure
    attendance/        # ключи, статусы, отчёты, HTML
    homework/          # задания, вложения, выполнение
    schedule/          # cache, timezone, weekly schedule, reminders
    institutions/      # institution/faculty/direction/course
  telegram/
    middleware/        # registration/access middleware
    handlers/          # команды и callback handlers по доменам
    keyboards/         # меню и inline-клавиатуры
    messages/          # форматирование ответов
  http/
    miniapp-api.ts     # API handlers
    server.ts          # health/app/static/http
```

## Важное замечание

В файле есть не только обычные функции, но и inline-регистрации `bot.command/action/on/hears`, а также глобальные константы и состояние. Их нельзя механически вырезать регулярным выражением: переносить целыми логическими блоками, сохраняя порядок middleware и регистрации callback handlers. В частности, два глобальных `bot.on('callback_query')` нужно проверить на порядок и пересечение.

## Выполнено в ходе миграции

Следующие части посещаемости уже вынесены из `index.mjs` в TypeScript:

- `bot-amvera/domain/attendance-core.ts` — ключи занятий и классификация отметок.
- `bot-amvera/domain/attendance-report.ts` — построение HTML-отчёта, сводная статистика по студентам, фильтр периодов и старые записи.
- `bot-amvera/domain/attendance-polls.ts` — поиск опроса по Telegram poll ID, запись ответов и привязка отметки к студенту строго по Telegram ID.
- Runtime bridges: `attendance-core-entry.mjs`, `attendance-report-entry.mjs`, `attendance-polls-entry.mjs`.
- Тесты: `attendance-core-typescript.test.mjs`, `attendance-report-typescript.test.mjs`, `attendance-polls-typescript.test.mjs`.

Для этих модулей добавлены TypeScript build/test конфигурации и команды проверки синтаксиса собранных файлов. Само выполнение компиляции и тестов ещё не подтверждено: в текущей среде нет сетевого доступа к GitHub для клонирования репозитория, а GitHub Actions для проверяемого коммита не вернул запусков. Перед включением ветки в production обязательно выполнить `npm install`, `npm run typecheck`, `npm run check` и `npm test`.

**Production не переключён:** изменения остаются в `typescript-migration`; `main` и Amvera не менялись.
