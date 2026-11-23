/** Extract the institution ID from /structure, preserving optional bot mentions. */
export function parseStructureInstitutionId(commandText: unknown): string {
  return String(commandText || '').replace(/^\\/structure(?:@\\S+)?/i, '').trim();
}
