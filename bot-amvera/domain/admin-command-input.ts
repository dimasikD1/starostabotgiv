export type GrantCommandInput = {
  targetId: string;
  forever: boolean;
  days: number | null;
};

/** Parse and validate the owner-only /grant command arguments. */
export function parseGrantCommandInput(
  commandText: unknown,
  defaultDays: number
): GrantCommandInput | null {
  if (typeof commandText !== 'string') return null;
  const args = commandText.replace(/^\/grant(?:@\S+)?/i, '').trim().split(/\s+/).filter(Boolean);
  const targetId = args[0];
  const duration = args[1];
  const forever = ['forever', 'lifetime', 'навсегда', 'пожизненно'].includes((duration || '').toLowerCase());
  const days = duration === undefined ? defaultDays : Number(duration);
  if (!targetId || !/^\d+$/.test(targetId)) return null;
  if (!forever && (!Number.isSafeInteger(days) || days < 1 || days > 3650)) return null;
  return { targetId, forever, days: forever ? null : days };
}

/** Extract a numeric Telegram user ID from an owner-only admin command. */
export function parseAdminTargetId(
  commandText: unknown,
  command: 'revoke' | 'subinfo'
): string | null {
  if (typeof commandText !== 'string') return null;
  const targetId = commandText.replace(new RegExp('^\\/' + command + '(?:@\\S+)?', 'i'), '').trim();
  return /^\d+$/.test(targetId) ? targetId : null;
}
