export interface InstitutionAdminRecord {
  id: string;
  name?: string;
  adminIds?: Array<string | number>;
  [key: string]: unknown;
}

export type AdminChangeResult =
  | { ok: true; status: 'added' | 'already_exists' | 'removed' | 'not_found' }
  | { ok: false; reason: 'invalid_user_id' | 'platform_owner' };

export function isInstitutionAdminId(
  institution: InstitutionAdminRecord | undefined,
  userId: string | number,
  isPlatformOwner = false
): boolean {
  if (isPlatformOwner) return true;
  if (!institution || !Array.isArray(institution.adminIds)) return false;
  return institution.adminIds.some(id => String(id) === String(userId));
}

export function addInstitutionAdmin(
  institution: InstitutionAdminRecord,
  userId: string | number,
  platformOwnerIds: Array<string | number> = []
): AdminChangeResult {
  const normalizedId = String(userId || '').trim();
  if (!/^\d+$/.test(normalizedId)) return { ok: false, reason: 'invalid_user_id' };
  if (platformOwnerIds.some(id => String(id) === normalizedId)) return { ok: false, reason: 'platform_owner' };
  institution.adminIds ||= [];
  if (institution.adminIds.some(id => String(id) === normalizedId)) {
    return { ok: true, status: 'already_exists' };
  }
  institution.adminIds.push(normalizedId);
  return { ok: true, status: 'added' };
}

export function removeInstitutionAdmin(
  institution: InstitutionAdminRecord,
  userId: string | number
): AdminChangeResult {
  const normalizedId = String(userId || '').trim();
  if (!/^\d+$/.test(normalizedId)) return { ok: false, reason: 'invalid_user_id' };
  institution.adminIds ||= [];
  const before = institution.adminIds.length;
  institution.adminIds = institution.adminIds.filter(id => String(id) !== normalizedId);
  return { ok: true, status: institution.adminIds.length === before ? 'not_found' : 'removed' };
}

export function listInstitutionAdmins(institution: InstitutionAdminRecord | undefined): string[] {
  if (!institution || !Array.isArray(institution.adminIds)) return [];
  return institution.adminIds.map(String);
}

export type InstitutionAccessResult =
  | { allowed: true; role: 'platform_owner' | 'institution_admin' }
  | { allowed: false; reason: 'institution_not_found' | 'institution_inactive' | 'forbidden' };

export function checkInstitutionAccess(
  institution: InstitutionAdminRecord | undefined,
  userId: string | number,
  platformOwnerIds: Array<string | number> = []
): InstitutionAccessResult {
  const normalizedId = String(userId);
  if (platformOwnerIds.some(id => String(id) === normalizedId)) {
    return { allowed: true, role: 'platform_owner' };
  }
  if (!institution) return { allowed: false, reason: 'institution_not_found' };
  if (institution.status === 'inactive') return { allowed: false, reason: 'institution_inactive' };
  if (!isInstitutionAdminId(institution, normalizedId)) {
    return { allowed: false, reason: 'forbidden' };
  }
  return { allowed: true, role: 'institution_admin' };
}
