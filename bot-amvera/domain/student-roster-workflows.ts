import {
  addTelegramStudent,
  addNamedStudent,
  removeStudentAt,
  type StudentRosterGroup,
  type AddStudentResult
} from './student-management.js';

export function addTelegramStudentAndSave(
  group: StudentRosterGroup,
  student: { name: string; telegramId: string; username?: string },
  save: () => void
): AddStudentResult {
  const result = addTelegramStudent(group, student);
  if (result === 'added' || result === 'updated') save();
  return result;
}

export function addNamedStudentAndSave(
  group: StudentRosterGroup,
  name: string,
  save: () => void
): AddStudentResult {
  const result = addNamedStudent(group, name);
  if (result === 'added') save();
  return result;
}

export function removeStudentAtAndSave(
  group: StudentRosterGroup,
  index: number,
  save: () => void
): unknown | undefined {
  const result = removeStudentAt(group, index);
  if (result !== undefined) save();
  return result;
}
