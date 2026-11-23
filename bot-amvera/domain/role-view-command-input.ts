export type RoleViewCommandAction = 'show' | 'student' | 'invalid';

/** Preserve the /role and /roles argument semantics of the Telegram handler. */
export function parseRoleViewAction(commandText: unknown): RoleViewCommandAction {
  const value = String(commandText ?? '').trim().split(/\s+/).slice(1).join(' ').toLowerCase();
  if (!value) return 'show';
  return value === 'student' ? 'student' : 'invalid';
}
