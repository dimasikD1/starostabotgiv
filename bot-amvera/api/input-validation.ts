export interface ProfileNameValidation {
  ok: boolean;
  value?: string;
  reason?: 'length' | 'format';
}

/** Mirrors the Mini App profile rules while keeping validation independent of HTTP and storage. */
export function validateMiniAppProfileName(input: unknown): ProfileNameValidation {
  const fullName = String(input || '').replace(/\s+/g, ' ').trim();
  if (fullName.length < 5 || fullName.length > 100) {
    return { ok: false, reason: 'length' };
  }
  if (!/^[\p{L}][\p{L}\s.'’-]*$/u.test(fullName) || fullName.split(' ').filter(Boolean).length < 2) {
    return { ok: false, reason: 'format' };
  }
  const normalized = fullName
    .split(' ')
    .map(part => part[0].toLocaleUpperCase('ru-RU') + part.slice(1))
    .join(' ');
  return { ok: true, value: normalized };
}
