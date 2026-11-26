/** Extract the institution ID from /structure, preserving optional bot mentions. */
export function parseStructureInstitutionId(commandText: unknown): string {
  return String(commandText || '').replace(/^[/]structure(?:@\S+)?/i, '').trim();
}


/** Parse pipe-delimited arguments from a named structure command, preserving legacy trimming. */
export function parseStructureCommandParts(commandText: unknown, command: string): string[] {
  return String(commandText || '')
    .replace(new RegExp('^\\\\/' + command + '(?:@\\\\S+)?', 'i'), '')
    .trim()
    .split('|')
    .map(value => value.trim());
}
