export interface MiniAppGroupAccessDependencies<TGroup> {
  getManagedGroup(userId: number | string, groupId: string): TGroup | null | undefined;
  canManageGroup(userId: number | string, group: TGroup): boolean;
}

export type MiniAppGroupAccessResult<TGroup> =
  | { kind: 'forbidden'; message: string }
  | { kind: 'authorized'; group: TGroup };

/** Resolves the selected group and enforces the same manager-access gate used by Mini App routes. */
export function resolveMiniAppGroupAccess<TGroup>(
  userId: number | string,
  selectedGroupId: string,
  dependencies: MiniAppGroupAccessDependencies<TGroup>
): MiniAppGroupAccessResult<TGroup> {
  const group = dependencies.getManagedGroup(userId, selectedGroupId);
  if (!group || !dependencies.canManageGroup(userId, group)) {
    return {
      kind: 'forbidden',
      message: 'Нет доступа к выбранной группе. Обнови список групп.'
    };
  }
  return { kind: 'authorized', group };
}
