export interface GroupRegistryRecord {
  [key: string]: unknown;
  chatId?: string | number;
  title?: string;
  addedBy?: string | number;
  addedAt?: string;
  students?: unknown[];
  attendance?: Record<string, unknown>;
}

export interface GroupRegistryDatabase {
  groups: Record<string, GroupRegistryRecord>;
}

export interface GroupRegistryChat {
  id: string | number;
  title?: string;
}

export interface GroupRegistryActor {
  id: string | number;
}

export interface GroupRegistryDependencies {
  ensureStudyGroups: (group: GroupRegistryRecord) => unknown;
  saveDb: () => void;
  now?: () => Date;
}

export function registerGroup(
  db: GroupRegistryDatabase,
  chat: GroupRegistryChat,
  actor: GroupRegistryActor,
  deps: GroupRegistryDependencies
): GroupRegistryRecord {
  const id = String(chat.id);
  const old = db.groups[id] || {};
  const group: GroupRegistryRecord = {
    ...old,
    chatId: chat.id,
    title: chat.title || old.title || 'Группа без названия',
    addedBy: old.addedBy || actor.id,
    addedAt: old.addedAt || (deps.now || (() => new Date()))().toISOString(),
    students: old.students || [],
    attendance: old.attendance || {}
  };
  db.groups[id] = group;
  deps.ensureStudyGroups(group);
  deps.saveDb();
  return group;
}

export function removeGroup(
  db: GroupRegistryDatabase,
  chatId: string | number,
  saveDb: () => void
): void {
  delete db.groups[String(chatId)];
  saveDb();
}
