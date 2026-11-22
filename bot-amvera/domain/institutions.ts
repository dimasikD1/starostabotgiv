export interface InstitutionRecord {
  id: string;
  name: string;
  shortName?: string;
  city?: string;
  status?: 'active' | 'inactive' | string;
  createdAt?: string;
  adminIds?: Array<string | number>;
  faculties?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface InstitutionGroupRecord {
  institutionId?: string;
  [key: string]: unknown;
}
export type InstitutionResult =
  | { ok: true; status: 'created' | 'renamed' | 'activated' | 'deactivated' | 'deleted'; id: string }
  | { ok: false; reason: 'invalid_id' | 'invalid_name' | 'duplicate_id' | 'duplicate_name' | 'not_found' | 'has_groups' | 'protected' };

export function listInstitutions(institutions: Record<string, InstitutionRecord> | undefined): InstitutionRecord[] {
  return Object.values(institutions || {}).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ru')
  );
}
export function hasInstitutionName(institutions: Record<string, InstitutionRecord> | undefined, name: string, exceptId = '', city?: string): boolean {
  const normalized = String(name || '').trim().toLocaleLowerCase('ru-RU');
  if (!normalized) return false;
  return Object.entries(institutions || {}).some(([id, item]) =>
    id !== exceptId && String(item?.name || '').trim().toLocaleLowerCase('ru-RU') === normalized && (city === undefined || String(item?.city || '').trim().toLocaleLowerCase('ru-RU') === String(city || '').trim().toLocaleLowerCase('ru-RU'))
  );
}
export function createInstitution(
  institutions: Record<string, InstitutionRecord>, record: InstitutionRecord
): InstitutionResult {
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  if (!/^inst_[a-zA-Z0-9_-]+$/.test(id)) return { ok: false, reason: 'invalid_id' };
  if (!name) return { ok: false, reason: 'invalid_name' };
  if (institutions[id]) return { ok: false, reason: 'duplicate_id' };
  if (hasInstitutionName(institutions, name, '', record.city)) return { ok: false, reason: 'duplicate_name' };
  institutions[id] = { ...record, id, name: name.slice(0, 160), status: record.status || 'active', faculties: record.faculties || {} };
  return { ok: true, status: 'created', id };
}
export function renameInstitution(
  institutions: Record<string, InstitutionRecord>, id: string, name: string
): InstitutionResult {
  const institution = institutions[String(id)];
  if (!institution) return { ok: false, reason: 'not_found' };
  const normalized = String(name || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_name' };
  if (hasInstitutionName(institutions, normalized, String(id), institution.city)) return { ok: false, reason: 'duplicate_name' };
  institution.name = normalized.slice(0, 160);
  return { ok: true, status: 'renamed', id: String(id) };
}
export function setInstitutionActive(
  institutions: Record<string, InstitutionRecord>, id: string, active: boolean
): InstitutionResult {
  const institution = institutions[String(id)];
  if (!institution) return { ok: false, reason: 'not_found' };
  institution.status = active ? 'active' : 'inactive';
  return { ok: true, status: active ? 'activated' : 'deactivated', id: String(id) };
}
export function deleteInstitution(
  institutions: Record<string, InstitutionRecord>,
  id: string,
  groups: Record<string, InstitutionGroupRecord> | undefined,
  protectedIds: Array<string | number> = []
): InstitutionResult {
  const key = String(id);
  if (!institutions[key]) return { ok: false, reason: 'not_found' };
  if (protectedIds.some(value => String(value) === key)) return { ok: false, reason: 'protected' };
  const visited = new Set<object>();
  const containsInstitutionGroup = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const objectValue = value as Record<string, unknown>;
    if (visited.has(objectValue)) return false;
    visited.add(objectValue);
    if (String(objectValue.institutionId || '') === key) return true;
    return Object.values(objectValue).some(containsInstitutionGroup);
  };
  const hasGroups = Object.values(groups || {}).some(containsInstitutionGroup);
  if (hasGroups) return { ok: false, reason: 'has_groups' };
  delete institutions[key];
  return { ok: true, status: 'deleted', id: key };
}
