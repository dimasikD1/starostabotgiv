# Starosta Bot

Telegram-бот с расписанием и Mini App.

Команды: /start, /help, /group, /schedule, /tomorrow, /week, /app.

Токен задаётся через TELEGRAM_BOT_TOKEN.
Данные пользователей сохраняются в /data/users.json (каталог можно изменить через DATA_DIR).

Источник расписания:
https://new-schedule.ruc.su/schedule

## Полезные переменные

- `TIME_ZONE` — часовой пояс расписания, по умолчанию `Europe/Moscow`.
- `WEBAPP_URL` — HTTPS-адрес Mini App для кнопки «Открыть кабинет».
- `DB_BACKUP_INTERVAL_MS` — интервал резервного копирования базы, по умолчанию 60 секунд.

## Проверка

```bash
npm run check
npm test
```

`GET /healthz` возвращает состояние процесса, версию и uptime.


## Бесплатный доступ владельца

В переменных окружения сервиса задай `OWNER_TELEGRAM_ID` равным своему числовому Telegram user ID. Только этот аккаунт получит бесплатный доступ; для остальных пользователей продолжит действовать подписка и существующие способы оплаты. Не используй username — нужен именно числовой ID.


## Управление подписками владельцем

Команды выполняются владельцем в личном чате с ботом. В переменной окружения Amvera должен быть задан `OWNER_TELEGRAM_ID` — числовой Telegram ID владельца.

- `/myid` — показать свой Telegram ID (доступно всем пользователям).
- `/grant TELEGRAM_ID [дней]` — выдать подписку; по умолчанию 30 дней. Если подписка уже активна, срок продлевается от её окончания.
- `/revoke TELEGRAM_ID` — отозвать подписку.
- `/subinfo TELEGRAM_ID` — проверить состояние подписки.

Пользователь присылает владельцу свой ID из команды `/myid`. Выдавать, отзывать и проверять подписки может только аккаунт из `OWNER_TELEGRAM_ID`.

## Typed student roster keyboards

The student roster and student-card callback keyboard layouts are defined in `domain/student-roster-keyboards.ts`. The Mini App/bot runtime bridge converts the typed button descriptors to Telegraf markup, while the tests cover pagination, navigation bounds, name truncation, and callback payloads.

## Typed attendance keyboard composition

The daily attendance, individual status, lesson picker, and per-lesson attendance keyboards are composed by `domain/attendance-keyboard-adapter.ts`. It reuses the typed domain button builders and keeps Telegraf markup conversion in the runtime entry point. Tests cover legacy callback payloads, status labels, and per-lesson navigation.

## Typed student roster destinations

The group-selection buttons used to open student rosters are defined in `domain/student-destination-buttons.ts`. The runtime bridge converts typed descriptors into Telegraf buttons. Tests verify one destination per managed group, the title length limit, and the empty-group case.

## Typed student import review keyboard

The text roster import review controls are described in `domain/student-import-preview-keyboard.ts`; the Telegraf-specific conversion remains in the JavaScript runtime bridge. The test locks the existing confirm/cancel callback values.

## Typed donation keyboard

Donation amount buttons are described in `domain/donation-keyboard.ts`; the runtime bridge maps those descriptors to Telegraf buttons. Tests preserve the four Stars amounts and their existing `donate:<amount>` callback identifiers. This does not add or restore subscription UI.

## Typed main menu layouts

Student and manager keyboard row layouts are defined in `domain/main-menus.ts`. Telegraf keyboard creation remains in `index.mjs`; tests preserve row ordering and confirm the student menu contains no management-only actions. The donation/support button remains, while no subscription entry is introduced.

## Typed study-group onboarding prompt

The group-selection prompt keyboard is described in `domain/study-group-prompt-keyboard.ts`. Group labels come from the configured study-group names; the existing callback values and help contact link are preserved. No CAPTCHA or additional onboarding step is added.

## Typed schedule group picker

The schedule flow's invalid-or-missing-group keyboard is defined in `domain/schedule-group-keyboard.ts`. It keeps the configured group labels and the existing `studygroup:2` / `studygroup:1` callback values; Telegram markup construction remains in the JavaScript adapter.

## Shared typed study-group choices

The initial private-chat onboarding group picker now uses `domain/study-group-choice-keyboard.ts`. It keeps the configured group names and the existing callback identifiers, while Telegram-specific button construction stays in the JavaScript adapter.
