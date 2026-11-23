export interface AttachedGroupSummary {
  title?: unknown;
}

/** Format the private /groups response without changing group ordering or names. */
export function buildAttachedGroupsMessage(groups: readonly AttachedGroupSummary[]): string {
  if (groups.length === 0) {
    return 'Нет прикреплённых групп. Добавь бота в группу и выполни /attach.';
  }
  return '👥 Прикреплённые группы:\n\n' +
    groups.map((group, index) =>
      String(index + 1) + '. ' + String(group.title || 'Группа без названия')
    ).join('\n');
}
