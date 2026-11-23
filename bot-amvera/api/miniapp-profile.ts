export interface MiniAppProfileUser {
  fullName?: string;
  [key: string]: unknown;
}

export interface MiniAppStudentGroup<TStudent> {
  students?: TStudent[];
}

export type MiniAppProfileValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export interface MiniAppProfileDependencies {
  validateName(value: unknown): MiniAppProfileValidation;
  save(): void;
}

export type MiniAppProfileUpdateResult =
  | { ok: true; fullName: string }
  | { ok: false; status: 400; error: string };

/** Applies the legacy profile-name validation and persistence behavior. */
export function updateMiniAppProfile(
  user: MiniAppProfileUser,
  value: unknown,
  dependencies: MiniAppProfileDependencies
): MiniAppProfileUpdateResult {
  const validation = dependencies.validateName(value);
  if (!validation.ok && validation.reason === 'length') {
    return { ok: false, status: 400, error: 'Укажи ФИО длиной от 5 до 100 символов.' };
  }
  if (!validation.ok) {
    return { ok: false, status: 400, error: 'Укажи корректные фамилию и имя (при наличии — отчество).' };
  }
  user.fullName = validation.value;
  dependencies.save();
  return { ok: true, fullName: user.fullName };
}

/** Clears only the selected group's student roster and returns the removed count. */
export function clearMiniAppStudentRoster<TStudent>(
  group: MiniAppStudentGroup<TStudent>
): { deleted: number; empty: boolean } {
  const deleted = (group.students || []).length;
  if (deleted === 0) return { deleted: 0, empty: true };
  group.students = [];
  return { deleted, empty: false };
}
