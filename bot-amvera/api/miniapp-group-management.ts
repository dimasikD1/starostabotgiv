export interface MiniAppRosterClearResult {
  deleted: number;
  empty: boolean;
}
export function getMiniAppAccessibleGroups<TGroup>(
  userId: string | number,
  listAccessibleGroups: (userId: string | number) => TGroup[]
): TGroup[] {
  return listAccessibleGroups(userId);
}
export function clearMiniAppRosterAndSave<TGroup extends { students?: unknown[] }>(
  group: TGroup,
  clearRoster: (group: TGroup) => MiniAppRosterClearResult,
  save: () => void,
  onCleared?: (result: MiniAppRosterClearResult) => void
): MiniAppRosterClearResult {
  const result = clearRoster(group);
  if (result.empty) return result;
  save();
  onCleared?.(result);
  return result;
}
