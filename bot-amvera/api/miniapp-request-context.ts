import type { TelegramWebAppUser } from './telegram-webapp-auth.js';

export interface MiniAppRequestRateResult {
  limited: boolean;
  retryAfter?: number;
}

export type MiniAppRequestContext<U> =
  | { kind: 'unauthorized'; message: string }
  | { kind: 'rate-limited'; retryAfter?: number }
  | { kind: 'authenticated'; telegramUser: TelegramWebAppUser; user: U };

export interface MiniAppRequestContextDependencies<U> {
  verifyInitData(initData: unknown): TelegramWebAppUser;
  getUser(userId: string | number): unknown;
  normalizeUser(value: unknown): U;
  checkRate(userId: string | number, method: string): MiniAppRequestRateResult;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error || 'Не удалось подтвердить аккаунт Telegram.');
}

/**
 * Resolves the authenticated Mini App request context.
 * Ordering intentionally matches the legacy handler: verify, load/normalize
 * the local user record, then consume the per-user rate-limit bucket.
 */
export function resolveMiniAppRequestContext<U>(
  initData: unknown,
  method: string,
  dependencies: MiniAppRequestContextDependencies<U>
): MiniAppRequestContext<U> {
  let telegramUser: TelegramWebAppUser;
  try {
    telegramUser = dependencies.verifyInitData(initData);
  } catch (error) {
    return { kind: 'unauthorized', message: errorMessage(error) };
  }

  const user = dependencies.normalizeUser(dependencies.getUser(telegramUser.id));
  const rate = dependencies.checkRate(telegramUser.id, method);
  if (rate.limited) {
    return { kind: 'rate-limited', retryAfter: rate.retryAfter };
  }

  return { kind: 'authenticated', telegramUser, user };
}
