import fs from 'node:fs';
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
    '\n[!] Не задан токен Telegram-бота.\n' +
      '    Создайте .env рядом с index.mjs:\n' +
      '    TELEGRAM_BOT_TOKEN="123456789:AA..."\n' +
      '    Затем: npm start\n'
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

async function handleMessage(message) {
  const chatId = message.chat && message.chat.id;
  const raw = (message.text || '').trim();
  if (!raw.startsWith('/')) {
    if (message.chat && message.chat.type === 'private') await send(chatId, EMPTY_TEXT);
    return;
  }
  await send(chatId, EMPTY_TEXT);
}

let offset = 0;
let running = true;

async function pollLoop() {
  while (running) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
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

async function start() {
  try {
    await tg('deleteWebhook', { drop_pending_updates: false });
  } catch (error) {
    console.error('[webhook]', error.message);
  }

  const me = await tg('getMe');
  console.log(`\nБот запущен: @${me.username} (${me.first_name})`);
  console.log('Режим: long polling. Логики нет.');
  console.log('Остановка: Ctrl+C\n');

  try {
    await tg('setMyCommands', { commands: BOT_COMMANDS });
  } catch (error) {
    console.error('[commands]', error.message);
  }

  await pollLoop();
}

process.on('SIGINT', () => {
  running = false;
  console.log('\n[bot] Остановлен.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  running = false;
  process.exit(0);
});

start().catch((error) => {
  console.error('[start]', error.message || error);
  process.exit(1);
});
