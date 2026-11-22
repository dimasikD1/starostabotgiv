export interface ScheduleCacheResult<T> {
  items: T[];
  loading: boolean;
}

interface CacheEntry<T> {
  items: T[];
  expiresAt: number;
}

export interface ScheduleCacheLogger {
  log(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface ScheduleCacheOptions<T> {
  load(group: string, days: number): Promise<T[]>;
  ttlMs?: number;
  now?: () => number;
  logger?: ScheduleCacheLogger;
}

/** In-memory schedule cache with request deduplication and stale-on-error fallback. */
export class ScheduleCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T[]>>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly logger: ScheduleCacheLogger;

  constructor(private readonly options: ScheduleCacheOptions<T>) {
    this.ttlMs = options.ttlMs ?? 3 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;
  }

  private key(group: string, days: number): string {
    return `${String(group)}:${Number(days)}`;
  }

  private load(group: string, days: number, cacheKey: string, stale: CacheEntry<T> | undefined): Promise<T[]> {
    const startedAt = this.now();
    const request = this.options.load(String(group), days).then(items => {
      const safeItems = Array.isArray(items) ? items : [];
      this.cache.set(cacheKey, { items: safeItems, expiresAt: this.now() + this.ttlMs });
      this.logger.log('[schedule cache] loaded:', cacheKey, 'items:', safeItems.length, 'ms:', this.now() - startedAt);
      return safeItems;
    }).catch(error => {
      this.logger.error('[schedule cache] failed:', cacheKey, error instanceof Error ? error.message : error);
      if (stale && Array.isArray(stale.items)) {
        this.logger.warn('[schedule cache] serving expired cache after source failure:', cacheKey);
        return stale.items;
      }
      throw error;
    }).finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, request);
    return request;
  }

  async get(group: string, days = 7): Promise<T[]> {
    const cacheKey = this.key(group, days);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {
      this.logger.log('[schedule cache] hit:', cacheKey);
      return cached.items;
    }
    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      this.logger.log('[schedule cache] waiting for in-flight request:', cacheKey);
      return pending;
    }
    this.logger.log('[schedule cache] loading:', cacheKey);
    return this.load(group, days, cacheKey, cached);
  }

  getImmediate(group: string, days = 7): ScheduleCacheResult<T> {
    const cacheKey = this.key(group, days);
    const cached = this.cache.get(cacheKey);
    const fresh = Boolean(cached && cached.expiresAt > this.now());
    if (!fresh && !this.inFlight.has(cacheKey)) {
      const request = this.options.load(String(group), days).then(items => {
        const safeItems = Array.isArray(items) ? items : [];
        this.cache.set(cacheKey, { items: safeItems, expiresAt: this.now() + this.ttlMs });
        this.logger.log('[schedule cache] background refresh complete:', cacheKey, 'items:', safeItems.length);
        return safeItems;
      }).catch(error => {
        this.logger.error('[schedule cache] background refresh failed:', cacheKey, error instanceof Error ? error.message : error);
        return cached?.items ?? [];
      }).finally(() => this.inFlight.delete(cacheKey));
      this.inFlight.set(cacheKey, request);
    }
    return { items: cached?.items ?? [], loading: !fresh };
  }
}
