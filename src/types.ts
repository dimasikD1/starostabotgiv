export interface BotFile {
  path: string;
  name: string;
  content: string;
  size: number;
  category: 'code' | 'amvera' | 'docs' | 'config' | 'data';
}

export interface GroupMeta {
  code: string;
  faculty: string;
  course: number;
  university: string;
  curatorName: string;
  region: string;
  year: number;
}

export interface StudentUser {
  id: string;
  name: string;
  username: string;
  role: 'starosta' | 'proforg' | 'student' | 'curator';
  roleTitle: string;
  subgroup: number;
  phone?: string;
  telegram?: string;
}

export interface ScheduleItem {
  id: string;
  dayOfWeek: number;
  pairNumber: number;
  timeStart: string;
  timeEnd: string;
  subject: string;
  teacher: string;
  room: string;
  type: 'lecture' | 'practice' | 'lab';
  subgroup?: number;
}

export interface HomeworkItem {
  id: string;
  subject: string;
  task: string;
  deadline: string;
  subgroup?: number;
  completedByUserIds: string[];
}

export interface PollOption {
  id: string;
  text: string;
  votedUserIds: string[];
}

export interface PollItem {
  id: string;
  question: string;
  options: PollOption[];
  isMultiple: boolean;
  isClosed: boolean;
}

export interface AnnouncementItem {
  id: string;
  authorId: string;
  title: string;
  content: string;
  timestamp: string;
  pinned: boolean;
  category: 'important' | 'info' | 'event';
}

export interface AttendanceRecord {
  id: string;
  date: string;
  pairNumber: number;
  subject: string;
  teacher?: string;
  records: Record<string, 'present' | 'absent' | 'excused' | 'late'>;
  updatedAt: string;
}

export interface GroupDatabase {
  meta: {
    version: number;
    updatedAt: string;
    tgOffset: number;
  };
  groupMeta: GroupMeta;
  starostaMandate?: {
    isSigned: boolean;
    signatureText: string;
    orderNumber: string;
  };
  users: StudentUser[];
  botUsers: Record<string, { userId: string; username?: string; name?: string; boundAt: string }>;
  schedule: ScheduleItem[];
  homework: HomeworkItem[];
  polls: PollItem[];
  announcements: AnnouncementItem[];
  attendance: AttendanceRecord[];
}

export interface BotMeInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}
