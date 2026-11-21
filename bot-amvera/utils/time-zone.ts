/** Resolve an IANA time zone while preserving the bot's legacy fallback behavior. */
export function resolveTimeZone(
  value: unknown,
  fallback = 'Europe/Moscow',
  warn: (message: string) => void = (message) => console.warn(message)
): string {
  const zone = String(value || '').trim() || fallback;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    warn('[time] Неизвестный часовой пояс «' + zone + '», использую ' + fallback);
    return fallback;
  }
}
