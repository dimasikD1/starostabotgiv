export interface AsyncJobLock {
  readonly locked: boolean;
  tryAcquire(): boolean;
  release(): void;
}

/**
 * Prevent overlapping executions of a background job.
 * The caller owns the acquired lock and must release it in a finally block.
 */
export function createAsyncJobLock(): AsyncJobLock {
  let locked = false;

  return {
    get locked() {
      return locked;
    },
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    }
  };
}
