export interface UserRecord {
  [key: string]: unknown;
  role?: unknown;
  students?: unknown;
  attendance?: unknown;
  subscriptionUntil?: unknown;
  paymentHistory?: unknown;
  createdAt?: unknown;
}

/** Apply the legacy defaults to a user record without replacing existing truthy values. */
export function normalizeUser(user: UserRecord): UserRecord {
  user.role ||= 'student';
  user.students ||= [];
  user.attendance ||= {};
  user.subscriptionUntil ||= 0;
  user.paymentHistory ||= [];
  user.createdAt ||= null;
  return user;
}
