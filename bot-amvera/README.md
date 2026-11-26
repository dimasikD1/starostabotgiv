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
