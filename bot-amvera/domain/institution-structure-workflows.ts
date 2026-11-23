import {
  createFaculty,
  createDirection,
  createCourse,
  type InstitutionStructure,
  type FacultyNode,
  type DirectionNode,
  type StructureResult
} from './institution-structure.js';

export function createFacultyAndSave(
  institution: InstitutionStructure, name: string, id: string, createdAt: string, save: () => void
): StructureResult {
  const result = createFaculty(institution, name, id, createdAt);
  if (result.ok) save();
  return result;
}
export function createDirectionAndSave(
  faculty: FacultyNode, name: string, id: string, createdAt: string, save: () => void
): StructureResult {
  const result = createDirection(faculty, name, id, createdAt);
  if (result.ok) save();
  return result;
}
export function createCourseAndSave(
  direction: DirectionNode, name: string, id: string, createdAt: string, save: () => void
): StructureResult {
  const result = createCourse(direction, name, id, createdAt);
  if (result.ok) save();
  return result;
}
