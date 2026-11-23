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

/** Format a calendar date using the same locale and IANA-zone semantics as the legacy runtime. */
export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

/** Return the localized numeric date/time parts used by attendance scheduling. */
export function getTimeZoneParts(
  date: Date = new Date(),
  timeZone = 'Europe/Moscow'
): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}
