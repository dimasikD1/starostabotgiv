import { buildMiniAppAttendanceLessons } from './attendance-core.js';
import { buildAttendanceStatistics, addAttendanceStudentNames } from './attendance-statistics.js';
import { buildHomeworkCompletionStatistics } from './homework.js';
import { getRecentAnnouncements } from './announcements.js';

export interface MiniAppGroupDataInput<TLesson, TStudent> {
  scheduleItems: readonly TLesson[];
  students: readonly TStudent[];
  lessonAttendance: unknown;
  today: string;
  getLessonKey: (lesson: TLesson) => string;
  getStudentKey: (student: TStudent) => string;
  getStudentName: (student: TStudent) => string;
  homework: unknown;
  users: unknown;
  announcements: unknown;
  nowMs?: number;
}

/** Compose the existing Mini App group-data sections from typed domain calculations. */
export function buildMiniAppGroupData<TLesson, TStudent>(
  input: MiniAppGroupDataInput<TLesson, TStudent>
) {
  const lessonData = buildMiniAppAttendanceLessons(
    input.scheduleItems,
    input.students,
    input.lessonAttendance,
    input.today,
    input.getLessonKey,
    student => input.getStudentKey(student as TStudent)
  );
  const homeworkStatistics = buildHomeworkCompletionStatistics(
    input.homework,
    input.students,
    input.users,
    student => input.getStudentName(student as TStudent),
    input.nowMs
  );
  const attendanceStatistics = buildAttendanceStatistics(
    input.lessonAttendance,
    input.students,
    lessonData.todayLessons,
    input.today,
    student => input.getStudentKey(student as TStudent),
    input.nowMs
  );

  return {
    lessons: lessonData.todayLessons,
    scheduleLessons: lessonData.scheduleLessons,
    students: addAttendanceStudentNames(
      attendanceStatistics.students,
      input.students,
      student => input.getStudentName(student as TStudent)
    ),
    announcements: getRecentAnnouncements(
      Array.isArray(input.announcements) ? input.announcements : undefined,
      30
    ),
    homework: homeworkStatistics.items,
    homeworkStats: {
      week: homeworkStatistics.week,
      all: homeworkStatistics.all
    },
    attendanceHistory: attendanceStatistics.attendanceHistory
  };
}
