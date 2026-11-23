export interface MiniAppScheduleItem {
  date?: string;
  subject?: unknown;
  timeStart?: string;
}

export interface MiniAppScheduleResult<TItem extends MiniAppScheduleItem> {
  items: TItem[];
  loading: boolean;
}

export interface MiniAppScheduleState<TItem extends MiniAppScheduleItem> {
  items: TItem[];
  error: string;
  loading: boolean;
}

export type MiniAppScheduleLoader<TItem extends MiniAppScheduleItem> = (
  groupName: string,
  days: number
) => MiniAppScheduleResult<TItem>;

/** Loads schedule data while preserving the Mini App's legacy fallback on source errors. */
export function loadMiniAppSchedule<TItem extends MiniAppScheduleItem>(
  scheduleGroup: unknown,
  getSchedule: MiniAppScheduleLoader<TItem>,
  onError: (groupName: unknown, error: unknown) => void
): MiniAppScheduleState<TItem> {
  let items: TItem[] = [];
  let error = '';
  let loading = false;

  try {
    if (!scheduleGroup) {
      throw new Error('Для группы не указано расписание. Сначала настрой /setgroup.');
    }
    const result = getSchedule(String(scheduleGroup), 7);
    items = result.items;
    loading = result.loading;
  } catch (cause) {
    error = 'Расписание временно недоступно. Остальные данные кабинета загружены; попробуй обновить позже.';
    onError(scheduleGroup, cause);
  }

  return { items, error, loading };
}
