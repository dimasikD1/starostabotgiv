/** Parse the numbered study-group argument used by role assignment commands. */
export type StudyGroupNumber = '1' | '2';

export function parseStudyGroupNumber(commandText: unknown): StudyGroupNumber | null {
  if (typeof commandText !== 'string') return null;
  const parts = commandText.trim().split(/\s+/).filter(Boolean);
  const number = parts[1];
  return number === '1' || number === '2' ? number : null;
}
