import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type JsonRecord = Record<string, unknown>;

export interface JsonDatabase extends JsonRecord {
  users: JsonRecord;
  groups: JsonRecord;
}

export interface JsonStoreOptions {
  dataDir?: string;
  backupIntervalMs?: number;
  logger?: (message: string, error: unknown) => void;
}

export interface JsonStore {
  db: JsonDatabase;
  saveDb: () => void;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function describeError(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

function readUsers(usersFile: string, logger: (message: string, error: unknown) => void): JsonDatabase {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    if (!isRecord(parsed) ||
        (parsed.users != null && !isRecord(parsed.users)) ||
        (parsed.groups != null && !isRecord(parsed.groups))) {
      throw new Error('Некорректная структура users.json.');
    }
    try { fs.chmodSync(usersFile, 0o600); } catch {}
    return {
      ...parsed,
      users: isRecord(parsed.users) ? parsed.users : {},
      groups: isRecord(parsed.groups) ? parsed.groups : {}
    };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      if (fs.existsSync(usersFile + '.bak')) {
        throw new Error('Основной users.json отсутствует, но найдена резервная копия users.json.bak. Запуск остановлен для ручного восстановления.');
      }
      return { users: {}, groups: {} };
    }
    logger('[storage] Не удалось прочитать users.json. Запуск остановлен, чтобы не перезаписать данные пустой базой:', describeError(error));
    throw error;
  }
}

/** JSON-backed storage preserving the legacy users.json format and save guarantees. */
export function createJsonStore(options: JsonStoreOptions = {}): JsonStore {
  const dataDir = options.dataDir || '/data';
  const usersFile = path.join(dataDir, 'users.json');
  const backupIntervalMs = Number.isFinite(options.backupIntervalMs) && (options.backupIntervalMs ?? 60000) >= 0
    ? options.backupIntervalMs ?? 60000
    : 60000;
  const logger = options.logger || ((message, error) => console.error(message, error));

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (error) {
    logger('[storage] Не удалось создать каталог данных ' + dataDir + ':', describeError(error));
    throw error;
  }

  const db = readUsers(usersFile, logger);
  let lastBackupAt = 0;

  function saveDb(): void {
    const serialized = JSON.stringify(db, null, 2);
    const tempFile = usersFile + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
    const backupFile = usersFile + '.bak';
    let fd: number | undefined;

    try {
      if (fs.existsSync(usersFile) && Date.now() - lastBackupAt >= backupIntervalMs) {
        fs.copyFileSync(usersFile, backupFile);
        try { fs.chmodSync(backupFile, 0o600); } catch {}
        lastBackupAt = Date.now();
      }
      fd = fs.openSync(tempFile, 'w', 0o600);
      fs.writeFileSync(fd, serialized, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tempFile, usersFile);
      try { fs.chmodSync(usersFile, 0o600); } catch {}
      try {
        const dirFd = fs.openSync(dataDir, 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch {}
    } catch (error) {
      if (fd !== undefined) try { fs.closeSync(fd); } catch {}
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      throw error;
    }
  }

  return { db, saveDb };
}
