import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramWebAppUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  [key: string]: unknown;
}

export interface TelegramWebAppAuthOptions {
  token: string;
  now?: () => number;
  maxAgeSeconds?: number;
  futureToleranceSeconds?: number;
}

export function verifyTelegramWebAppInitData(
  initData: unknown,
  options: TelegramWebAppAuthOptions
): TelegramWebAppUser {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) {
    throw new Error('Открой мини-приложение из Telegram.');
  }
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error('Некорректные данные Telegram.');
  }

  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(options.token).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  const received = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Не удалось подтвердить аккаунт Telegram.');
  }

  const authDate = Number(params.get('auth_date') || 0);
  const ageSeconds = ((options.now || Date.now)() / 1000) - authDate;
  const maxAge = options.maxAgeSeconds ?? 3600;
  const futureTolerance = options.futureToleranceSeconds ?? 30;
  if (!Number.isFinite(authDate) || ageSeconds < -futureTolerance || ageSeconds > maxAge) {
    throw new Error('Сессия устарела. Закрой и снова открой мини-приложение.');
  }

  let user: unknown;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }
  if (!user || typeof user !== 'object') {
    throw new Error('Telegram не передал корректные данные пользователя.');
  }
  const userRecord = user as Record<string, unknown>;
  const rawUserId = userRecord.id;
  const userId = typeof rawUserId === 'number'
    ? rawUserId
    : typeof rawUserId === 'string' && /^\d+$/.test(rawUserId)
      ? Number(rawUserId)
      : Number.NaN;
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Telegram не передал корректные данные пользователя.');
  }
  return user as TelegramWebAppUser;
}
