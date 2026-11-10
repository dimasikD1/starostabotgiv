# Пустой Telegram-бот

Бот отвечает на любое сообщение одной фразой и больше ничего не делает. Токен берётся из `TELEGRAM_BOT_TOKEN`.

Если к Amvera подключён весь репозиторий, корневой `amvera.yml` запускает `bot-amvera/index.mjs`. Если загружаете только эту папку, используется локальный `amvera.yml` и команда `npm start`.

## Локально

```bash
cp .env.example .env
# впишите TELEGRAM_BOT_TOKEN
npm start
```

## Amvera

1. В переменных проекта задайте `TELEGRAM_BOT_TOKEN`.
2. Соберите проект. Бот работает в режиме long polling.
3. Если тип проекта — приложение, health-check отвечает на `PORT`.
