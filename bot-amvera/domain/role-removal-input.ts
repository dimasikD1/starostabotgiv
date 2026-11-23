export function parseRoleRemovalTargetId(commandText: unknown): string | undefined {
  const targetId = String(commandText || '').trim().split(/\s+/)[1] || '';
  return /^\d+$/.test(targetId) ? targetId : undefined;
}
