export interface RoleReportSourceGroup {
  [key: string]: unknown;
  institutionId?: unknown;
  studyGroup?: unknown;
  title?: unknown;
  chatId?: unknown;
  starostaId?: unknown;
  zamId?: unknown;
}

export interface RoleReportGroup extends RoleReportSourceGroup {
  _sourceGroups: RoleReportSourceGroup[];
}

/**
 * Merge duplicate chat registrations into one institution + study-group card.
 * Keeps the first record's display fields and the original source order.
 */
export function groupRoleReportSources(
  groups: readonly RoleReportSourceGroup[]
): RoleReportGroup[] {
  const grouped = new Map<string, RoleReportGroup>();
  for (const group of groups) {
    const key = String(group.institutionId || '') + '::' +
      String(group.studyGroup || group.title || '');
    const existing = grouped.get(key);
    if (existing) {
      existing._sourceGroups.push(group);
    } else {
      grouped.set(key, { ...group, _sourceGroups: [group] });
    }
  }
  return [...grouped.values()];
}

export function roleReportSourceChatIds(group: RoleReportGroup): Set<string> {
  return new Set(group._sourceGroups.map(source => String(source.chatId || '')));
}

export function firstAssignedRoleId(
  group: RoleReportGroup,
  role: 'starostaId' | 'zamId'
): string {
  return group._sourceGroups.map(source => String(source[role] || '')).find(Boolean) || '';
}

/** Restrict role report source groups to the institutions visible to the requester. */
export function filterRoleReportGroups<T extends RoleReportSourceGroup>(
  groups: readonly T[],
  isPlatformOwner: boolean,
  allowedInstitutionIds: readonly string[]
): T[] {
  if (isPlatformOwner) return [...groups];
  const allowed = new Set(allowedInstitutionIds.map(String));
  return groups.filter(group => allowed.has(String(group.institutionId || '')));
}
