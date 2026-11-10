import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadDotEnv();

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!TOKEN || !TOKEN.includes(':')) {
  console.error(
    '\n[!] Не задан токен Telegram-бота (TELEGRAM_BOT_TOKEN).\n' +
      '    Локально: создайте .env со строкой TELEGRAM_BOT_TOKEN="123456789:AA..."\n' +
      '    На Amvera: Проект → Переменные → TELEGRAM_BOT_TOKEN.\n'
  );
  process.exit(1);
}

const API = 'https://api.telegram.org';
const EMPTY_TEXT = 'Бот пустой. Команд и данных пока нет.';
const BOT_COMMANDS = [
  { command: 'start', description: 'Запуск' },
  { command: 'help', description: 'Помощь' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tg(method, payload = {}) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, description: `HTTP ${res.status}` };
  }
  if (!json.ok) {
    const error = new Error(`Telegram ${method}: ${json.description || res.status}`);
    error.code = json.error_code || res.status;
    error.description = json.description || '';
    error.parameters = json.parameters;
    throw error;
  }
  return json.result;
}

async function send(chatId, text) {
  if (!chatId) return null;
  try {
    return await tg('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  } catch (error) {
    if (error.code === 429) {
      await sleep(((error.parameters && error.parameters.retry_after) || 2) * 1000);
      return send(chatId, text);
    }
    console.error('[send]', error.message);
    return null;
  }
}

async function answer(callbackId) {
  try {
    await tg('answerCallbackQuery', { callback_query_id: callbackId });
  } catch (error) {
    console.error('[answer]', error.message);
  }
}

async function handleMessage(message) {
  const chatId = message.chat && message.chat.id;
  const raw = (message.text || '').trim();
  if (!raw.startsWith('/')) {
    if (message.chat && message.chat.type === 'private') await send(chatId, EMPTY_TEXT);
    return;
  }
  const command = raw.split(/\s+/)[0].split('@')[0].toLowerCase();
  if (command === '/start' || command === '/help') {
    await send(chatId, EMPTY_TEXT);
    return;
  }
  await send(chatId, EMPTY_TEXT);
}

async function handleUpdate(update) {
  try {
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await answer(update.callback_query.id);
  } catch (error) {
    console.error('[update]', error);
  }
}

let offset = 0;
let running = true;

async function pollLoop() {
  while (running) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      if (error.code === 401) {
        console.error('[!] Неверный токен бота (401 Unauthorized). Проверьте TELEGRAM_BOT_TOKEN.');
        process.exit(1);
      }
      if (error.code === 409) {
        console.error('[!] Конфликт: похоже, запущен другой экземпляр бота. Жду 10 секунд...');
        await sleep(10000);
        continue;
      }
      if (error.code === 429) {
        await sleep(((error.parameters && error.parameters.retry_after) || 3) * 1000);
        continue;
      }
      console.error('[poll]', error.message);
      await sleep(3000);
    }
  }
}

const PORT = process.env.PORT || (process.env.ENABLE_HTTP === 'true' ? 8080 : null);
let httpServer = null;

if (PORT) {
  httpServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'empty-bot',
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );
  });
  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[http] Health-check слушает порт :${PORT}`);
  });
}

async function start() {
  try {
    await tg('deleteWebhook', { drop_pending_updates: false });
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  const me = await tg('getMe');
  console.log(`\nБот запущен: @${me.username} (${me.first_name})`);
  console.log('Режим: long polling. Логики нет.');
  if (PORT) console.log(`Порт health-check: ${PORT}`);

  try {
    await tg('setMyCommands', { commands: BOT_COMMANDS });
  } catch (error) {
    console.error('[commands]', error.message);
  }

  await pollLoop();
}

function gracefulShutdown(signal) {
  running = false;
  console.log(`\n[bot] Остановка (${signal}).`);
  if (httpServer) {
    httpServer.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

start().catch((error) => {
  console.error('[start]', error.message || error);
  process.exit(1);
});
