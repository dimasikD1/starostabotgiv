import {
  assignStudyGroupRoleByNumber,
  removeGroupRolesAndSetStudent,
  clearStudyGroupRoles,
  setStudentRole,
  type StudentRosterGroup,
  type StudentUser,
  type GroupRoleAssignmentResult,
  type RemoveGroupRolesResult
} from './student-management.js';

export function assignAndPersistStudyGroupRole(
  groups: StudentRosterGroup[],
  user: StudentUser,
  role: 'starosta' | 'zam',
  userId: string | number,
  groupNumber: string,
  studyGroupNames: Record<string, string>,
  options: { username?: string; chatId: string | number; institutionId: string },
  save: () => void
): GroupRoleAssignmentResult {
  const result = assignStudyGroupRoleByNumber(
    groups, user, role, userId, groupNumber, studyGroupNames, options
  );
  if (result.status === 'assigned') save();
  return result;
}

export function removeAndPersistStudyGroupRoles(
  groups: StudentRosterGroup[],
  user: StudentUser,
  userId: string | number,
  chatId: string | number | undefined,
  save: () => void
): RemoveGroupRolesResult {
  const result = removeGroupRolesAndSetStudent(groups, user, userId, chatId);
  save();
  return result;
}

/** Let a user relinquish every group-level role and persist the student profile. */
export function setSelfAsStudentAndSave(
  groups: StudentRosterGroup[],
  user: StudentUser,
  userId: string | number,
  save: () => void
): number {
  const removed = clearStudyGroupRoles(groups, userId, undefined, false);
  setStudentRole(user);
  save();
  return removed;
}
