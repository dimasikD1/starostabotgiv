import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedData } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Определение директории хранения данных для Amvera Cloud:
 * 1. Переменная окружения DATA_DIR (например, /data)
 * 2. Стандартный путь постоянного хранилища Amvera /data (если доступен для записи)
 * 3. Локальная папка ./data в каталоге проекта
 */
function resolveDataDir() {
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }
  try {
    if (fs.existsSync('/data')) {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data';
    }
  } catch {
    // /data недоступна для записи или отсутствует
  }
  return path.join(__dirname, 'data');
}

export const DATA_DIR = resolveDataDir();
export const DB_FILE = path.join(DATA_DIR, 'db.json');

function read() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Если файл БД еще не существует в персистентной директории Amvera
  if (!fs.existsSync(DB_FILE)) {
    const templateFile = path.join(__dirname, 'data', 'db.json');
    let initial;
    if (fs.existsSync(templateFile) && path.resolve(templateFile) !== path.resolve(DB_FILE)) {
      try {
        console.log(`[db] Копирование начальной базы из репозитория: ${templateFile} -> ${DB_FILE}`);
        initial = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      } catch (err) {
        console.warn('[db] Ошибка чтения шаблона data/db.json, используется seedData():', err.message);
        initial = seedData();
      }
    } else {
      console.log(`[db] Генерация новой базы seedData() -> ${DB_FILE}`);
      initial = seedData();
    }
    write(initial);
    return initial;
  }

  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error(`[db] Ошибка чтения ${DB_FILE}:`, err.message);
    const initial = seedData();
    write(initial);
    return initial;
  }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

let db = read();

export function getDb() {
  return db;
}

export function saveDb() {
  db.meta.updatedAt = new Date().toISOString();
  db.meta.version += 1;
  write(db);
  return db;
}

export function todayIso() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function dowOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function todayDow() {
  return dowOf(todayIso());
}

export function students() {
  return db.users.filter((u) => u.role !== 'curator');
}

export function getUser(userId) {
  return db.users.find((u) => u.id === userId);
}

export function resolveUser(from) {
  const bound = db.botUsers[String(from.id)];
  if (!bound) return { userId: `tg:${from.id}`, name: from.first_name || 'Гость', bound: null };
  const user = getUser(bound.userId);
  return {
    userId: bound.userId,
    name: user?.name || bound.name || `tg:${from.id}`,
    bound,
  };
}

export function bindUser(from, userId) {
  const user = getUser(userId);
  if (!user) return null;
  db.botUsers[String(from.id)] = {
    userId: user.id,
    username: from.username,
    name: from.first_name,
    boundAt: new Date().toISOString(),
  };
  saveDb();
  return user;
}

export function currentAttendance() {
  const today = todayIso();
  const todayRecords = db.attendance
    .filter((r) => r.date === today)
    .sort((a, b) => a.pairNumber - b.pairNumber);
  if (todayRecords.length) return todayRecords[0];
  return db.attendance
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.pairNumber - a.pairNumber)[0];
}

export function attendanceFor(date, pairNumber) {
  let record = db.attendance.find((r) => r.date === date && r.pairNumber === pairNumber);
  if (!record) {
    const lesson =
      db.schedule.find((s) => s.dayOfWeek === dowOf(date) && s.pairNumber === pairNumber) ||
      db.schedule.find((s) => s.pairNumber === pairNumber) ||
      db.schedule[0];
    const records = {};
    students().forEach((s) => {
      records[s.id] = 'present';
    });
    record = {
      id: `att-${date}-${pairNumber}`,
      date,
      pairNumber,
      subject: lesson?.subject || 'Текущее занятие',
      teacher: lesson?.teacher || '',
      records,
      updatedAt: new Date().toISOString(),
    };
    db.attendance.push(record);
  }
  return record;
}

const STATUS_CYCLE = ['present', 'absent', 'excused', 'late'];

export function cycleStatus(record, userId) {
  const current = record.records[userId] || 'present';
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
  record.records[userId] = next;
  record.updatedAt = new Date().toISOString();
  saveDb();
  return next;
}

export function setAllStatus(record, status) {
  students().forEach((s) => {
    record.records[s.id] = status;
  });
  record.updatedAt = new Date().toISOString();
  saveDb();
}

export function votePoll(pollId, optionId, userId) {
  const poll = db.polls.find((p) => p.id === pollId);
  if (!poll || poll.isClosed) return null;
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) return null;
  const already = option.votedUserIds.includes(userId);
  poll.options.forEach((o) => {
    if (!poll.isMultiple || o.id === optionId) {
      o.votedUserIds = o.votedUserIds.filter((id) => id !== userId);
    }
  });
  if (!already) option.votedUserIds.push(userId);
  saveDb();
  return { poll, option, already };
}

export function toggleHomework(taskId, userId) {
  const task = db.homework.find((h) => h.id === taskId);
  if (!task) return null;
  const has = task.completedByUserIds.includes(userId);
  task.completedByUserIds = has
    ? task.completedByUserIds.filter((id) => id !== userId)
    : [...task.completedByUserIds, userId];
  saveDb();
  return { task, done: !has };
}

export function addAnnouncement(authorId, text) {
  const announcement = {
    id: `ann-${Date.now()}`,
    authorId,
    title: '📢 Объявление из Telegram',
    content: text,
    timestamp: 'Только что',
    pinned: false,
    category: 'important',
  };
  db.announcements.unshift(announcement);
  saveDb();
  return announcement;
}

export function activePoll() {
  return db.polls.find((p) => !p.isClosed);
}

export function formatDateRu(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'short', timeZone: 'UTC' });
}
