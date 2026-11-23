import {
  createInstitution,
  deleteInstitution,
  type InstitutionRecord,
  type InstitutionGroupRecord,
  type InstitutionResult
} from './institutions.js';
import {
  addInstitutionAdmin,
  removeInstitutionAdmin,
  type InstitutionAdminRecord,
  type AdminChangeResult
} from './institution-admins.js';

export function createInstitutionAndSave(
  institutions: Record<string, InstitutionRecord>,
  record: InstitutionRecord,
  save: () => void
): InstitutionResult {
  const result = createInstitution(institutions, record);
  if (result.ok) save();
  return result;
}

export function deleteInstitutionAndSave(
  institutions: Record<string, InstitutionRecord>,
  id: string,
  groups: Record<string, InstitutionGroupRecord> | undefined,
  protectedIds: Array<string | number>,
  save: () => void
): InstitutionResult {
  const result = deleteInstitution(institutions, id, groups, protectedIds);
  if (result.ok) save();
  return result;
}

export function addInstitutionAdminAndSave(
  institution: InstitutionAdminRecord,
  userId: string | number,
  platformOwnerIds: Array<string | number>,
  save: () => void
): AdminChangeResult {
  const result = addInstitutionAdmin(institution, userId, platformOwnerIds);
  if (result.ok && result.status === 'added') save();
  return result;
}

export function removeInstitutionAdminAndSave(
  institution: InstitutionAdminRecord,
  userId: string | number,
  save: () => void
): AdminChangeResult {
  const result = removeInstitutionAdmin(institution, userId);
  if (result.ok && result.status === 'removed') save();
  return result;
}
