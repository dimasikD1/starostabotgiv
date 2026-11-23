export interface MiniAppAttendanceGroup<TStudent> {
  students?: TStudent[];
  lessonAttendance?: Record<string, Record<string, string>>;
}
export interface MiniAppAttendanceValidation {
  ok: boolean;
  studentIndex?: number;
  status?: string;
  lessonKey?: string;
}
export type MiniAppAttendanceResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'lesson-not-found' };
export interface MiniAppAttendanceDependencies<TStudent, TLesson> {
  validate(body: unknown, studentCount: number): MiniAppAttendanceValidation;
  getTodayLessons(): Promise<TLesson[]>;
  getLessonKey(lesson: TLesson): string;
  getStudentKey(student: TStudent): string;
  save(): void;
}
/** Validates and persists one per-lesson attendance mark without changing legacy storage keys. */
export async function updateMiniAppAttendance<TStudent, TLesson>(
  group: MiniAppAttendanceGroup<TStudent>,
  body: unknown,
  dependencies: MiniAppAttendanceDependencies<TStudent, TLesson>
): Promise<MiniAppAttendanceResult> {
  const validation = dependencies.validate(body, (group.students || []).length);
  if (!validation.ok || validation.studentIndex === undefined ||
      validation.status === undefined || validation.lessonKey === undefined) {
    return { ok: false, reason: 'invalid' };
  }
  const lessons = await dependencies.getTodayLessons();
  const lesson = lessons.find(item => dependencies.getLessonKey(item) === validation.lessonKey);
  if (!lesson) return { ok: false, reason: 'lesson-not-found' };
  const student = (group.students || [])[validation.studentIndex];
  if (student === undefined) return { ok: false, reason: 'invalid' };
  group.lessonAttendance ||= {};
  group.lessonAttendance[validation.lessonKey] ||= {};
  const studentKey = dependencies.getStudentKey(student);
  if (validation.status === 'unmarked') delete group.lessonAttendance[validation.lessonKey][studentKey];
  else group.lessonAttendance[validation.lessonKey][studentKey] = validation.status;
  dependencies.save();
  return { ok: true };
}
