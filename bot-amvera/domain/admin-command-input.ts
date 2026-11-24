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


export interface InstitutionAdminCommandInput {
  institutionId: string;
  userId: string;
}

/** Extract the institution and Telegram user IDs from owner admin commands. */
export function parseInstitutionAdminCommandInput(
  commandText: unknown,
  command: 'setinstadmin' | 'removeinstadmin'
): InstitutionAdminCommandInput {
  if (typeof commandText !== 'string') return { institutionId: '', userId: '' };
  const args = commandText
    .replace(new RegExp('^\\/' + command + '(?:@\\S+)?', 'i'), '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { institutionId: args[0] || '', userId: args[1] || '' };
}


export interface AddInstitutionCommandInput {
  hasInput: boolean;
  name: string;
  shortName: string;
  city: string;
}

/** Parse the pipe-separated fields of /addinstitution using the existing limits. */
export function parseAddInstitutionCommandInput(commandText: unknown): AddInstitutionCommandInput {
  if (typeof commandText !== 'string') {
    return { hasInput: false, name: '', shortName: '', city: '' };
  }
  const raw = commandText.replace(/^\/addinstitution(?:@\S+)?/i, '').trim();
  if (!raw) return { hasInput: false, name: '', shortName: '', city: '' };
  const parts = raw.split('|').map(value => value.trim());
  return {
    hasInput: true,
    name: String(parts[0] || '').slice(0, 120).trim(),
    shortName: String(parts[1] || '').slice(0, 40).trim(),
    city: String(parts[2] || '').slice(0, 80).trim()
  };
}

/** Read a single institution ID from a command such as /deleteinstitution or /instadmins. */
export function parseInstitutionIdCommandInput(
  commandText: unknown,
  command: 'deleteinstitution' | 'instadmins'
): string {
  if (typeof commandText !== 'string') return '';
  return commandText.replace(new RegExp('^\\/' + command + '(?:@\\S+)?', 'i'), '').trim();
}
