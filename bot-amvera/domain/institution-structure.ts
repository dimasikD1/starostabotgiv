export interface StructureNode {
  id: string;
  name: string;
  createdAt?: string;
  [key: string]: unknown;
}
export interface CourseNode extends StructureNode {
  groups?: Record<string, LinkedStudyGroup>;
}
export interface DirectionNode extends StructureNode {
  courses?: Record<string, CourseNode>;
}
export interface FacultyNode extends StructureNode {
  directions?: Record<string, DirectionNode>;
}
export interface InstitutionStructure {
  id: string;
  name?: string;
  faculties?: Record<string, FacultyNode>;
  [key: string]: unknown;
}
export interface LinkedStudyGroup {
  id: string;
  name: string;
  studyGroup: string;
  chatId: string;
  institutionId: string;
  facultyId: string;
  directionId: string;
  courseId: string;
  linkedAt: string;
}
export interface StudyGroupReference {
  id?: string;
  chatId?: string | number;
  institutionId?: string;
  studyGroup?: string;
  facultyId?: string;
  directionId?: string;
  courseId?: string;
  [key: string]: unknown;
}
export type StructureResult =
  | { ok: true; id: string; facultyName?: string; directionName?: string; courseName?: string }
  | { ok: false; reason: 'invalid_name' | 'duplicate' | 'faculty_not_found' | 'direction_not_found' | 'course_not_found' | 'institution_mismatch' | 'group_reference_invalid' };

export function ensureInstitutionStructure(institution: InstitutionStructure): Record<string, FacultyNode> {
  institution.faculties ||= {};
  return institution.faculties;
}

export function hasDuplicateStructureName(
  items: Record<string, StructureNode> | undefined,
  name: string
): boolean {
  const normalized = String(name || '').trim().toLocaleLowerCase('ru-RU');
  if (!normalized) return false;
  return Object.values(items || {}).some(item =>
    String(item?.name || '').trim().toLocaleLowerCase('ru-RU') === normalized
  );
}

export function createFaculty(
  institution: InstitutionStructure,
  name: string,
  id: string,
  createdAt: string
): StructureResult {
  const normalized = String(name || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_name' };
  const faculties = ensureInstitutionStructure(institution);
  if (hasDuplicateStructureName(faculties, normalized)) return { ok: false, reason: 'duplicate' };
  faculties[id] = { id, name: normalized.slice(0, 120), directions: {}, createdAt };
  return { ok: true, id };
}

export function createDirection(
  faculty: FacultyNode,
  name: string,
  id: string,
  createdAt: string
): StructureResult {
  const normalized = String(name || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_name' };
  faculty.directions ||= {};
  if (hasDuplicateStructureName(faculty.directions, normalized)) return { ok: false, reason: 'duplicate' };
  faculty.directions[id] = { id, name: normalized.slice(0, 120), courses: {}, createdAt };
  return { ok: true, id };
}

export function createCourse(
  direction: DirectionNode,
  name: string,
  id: string,
  createdAt: string
): StructureResult {
  const normalized = String(name || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_name' };
  direction.courses ||= {};
  if (hasDuplicateStructureName(direction.courses, normalized)) return { ok: false, reason: 'duplicate' };
  direction.courses[id] = { id, name: normalized.slice(0, 80), groups: {}, createdAt };
  return { ok: true, id };
}

export function linkStudyGroupToCourse(
  institution: InstitutionStructure,
  group: StudyGroupReference,
  courseId: string,
  linkedAt: string
): StructureResult {
  if (String(group.institutionId || '') !== String(institution.id)) {
    return { ok: false, reason: 'institution_mismatch' };
  }
  const faculties = Object.values(institution.faculties || {});
  for (const faculty of faculties) {
    for (const direction of Object.values(faculty.directions || {})) {
      const course = direction.courses?.[courseId];
      if (!course) continue;
      const chatId = String(group.chatId || '').trim();
      const studyGroup = String(group.studyGroup || '').trim();
      if (!chatId || !studyGroup) return { ok: false, reason: 'group_reference_invalid' };
      const linkId = chatId + '::' + studyGroup;
      for (const candidateFaculty of faculties) {
        for (const candidateDirection of Object.values(candidateFaculty.directions || {})) {
          for (const candidateCourse of Object.values(candidateDirection.courses || {})) {
            if (candidateCourse.groups?.[linkId]) delete candidateCourse.groups[linkId];
          }
        }
      }
      course.groups ||= {};
      course.groups[linkId] = {
        id: linkId,
        name: studyGroup,
        studyGroup,
        chatId,
        institutionId: String(group.institutionId),
        facultyId: faculty.id,
        directionId: direction.id,
        courseId: course.id,
        linkedAt
      };
      group.facultyId = faculty.id;
      group.directionId = direction.id;
      group.courseId = course.id;
      return { ok: true, id: linkId, facultyName: faculty.name, directionName: direction.name, courseName: course.name };
    }
  }
  return { ok: false, reason: 'course_not_found' };
}

export function unlinkStudyGroupFromStructure(institution: InstitutionStructure, group: StudyGroupReference): { ok: true; removed: number } | { ok: false; reason: 'institution_mismatch' | 'group_reference_invalid' } {
  if (String(group.institutionId || '') !== String(institution.id)) return { ok: false, reason: 'institution_mismatch' };
  const chatId = String(group.chatId || '').trim();
  const studyGroup = String(group.studyGroup || '').trim();
  if (!chatId || !studyGroup) return { ok: false, reason: 'group_reference_invalid' };
  const linkId = chatId + '::' + studyGroup;
  let removed = 0;
  for (const faculty of Object.values(institution.faculties || {})) {
    for (const direction of Object.values(faculty.directions || {})) {
      for (const course of Object.values(direction.courses || {})) {
        if (course.groups?.[linkId]) { delete course.groups[linkId]; removed += 1; }
      }
    }
  }
  delete group.facultyId; delete group.directionId; delete group.courseId;
  return { ok: true, removed };
}


export type StudyGroupLinkArguments =
  | { ok: true; groupNumber: '1' | '2'; courseId: string }
  | { ok: false; reason: 'invalid_group' | 'missing_course' };

export function parseStudyGroupLinkArguments(args: readonly unknown[]): StudyGroupLinkArguments {
  const groupNumber = String(args[0] ?? '').trim();
  const courseId = String(args[1] ?? '').trim();
  if (groupNumber !== '1' && groupNumber !== '2') return { ok: false, reason: 'invalid_group' };
  if (!courseId) return { ok: false, reason: 'missing_course' };
  return { ok: true, groupNumber, courseId };
}

export type StudyGroupUnlinkArguments =
  | { ok: true; groupNumber: '1' | '2' }
  | { ok: false; reason: 'invalid_group' };

export function parseStudyGroupUnlinkArguments(args: readonly unknown[]): StudyGroupUnlinkArguments {
  const groupNumber = String(args[0] ?? '').trim();
  if (groupNumber !== '1' && groupNumber !== '2') return { ok: false, reason: 'invalid_group' };
  return { ok: true, groupNumber };
}
