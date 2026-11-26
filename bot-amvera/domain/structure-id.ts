export function buildStructureId(prefix: string, randomUUID: () => string): string {
  return prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 10);
}
