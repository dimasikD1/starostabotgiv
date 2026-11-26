export interface ScheduleCacheAccess<TItem> {
  get(group: string, days?: number): Promise<TItem[]>;
  getImmediate(group: string, days?: number): { items: TItem[]; loading: boolean };
}

/** Keeps schedule-cache key normalization and default horizon consistent at call sites. */
export function getCachedSchedule<TItem>(
  cache: ScheduleCacheAccess<TItem>,
  group: unknown,
  days = 7
): Promise<TItem[]> {
  return cache.get(String(group), days);
}

/** Returns the current cache snapshot and starts background refresh when needed. */
export function getImmediateSchedule<TItem>(
  cache: ScheduleCacheAccess<TItem>,
  group: unknown,
  days = 7
): { items: TItem[]; loading: boolean } {
  return cache.getImmediate(String(group), days);
}
