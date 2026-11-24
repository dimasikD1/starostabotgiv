/** Configuration for a retryable asynchronous operation. */
export interface RetryOperationOptions<T> {
  operation: () => Promise<T>;
  attempts?: number;
  delayForAttempt?: (attempt: number) => number;
  wait: (milliseconds: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, attempts: number) => void;
  createFinalError: (lastError: unknown, attempts: number) => Error;
}

/** Run an asynchronous operation with bounded retries and injected waiting/logging. */
export async function executeWithRetry<T>(options: RetryOperationOptions<T>): Promise<T> {
  const attempts = options.attempts ?? 5;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('Retry attempts must be a positive integer');
  }
  const delayForAttempt = options.delayForAttempt ?? (attempt => Math.min(10_000, 1_500 * (2 ** (attempt - 1))));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await options.operation();
    } catch (error) {
      lastError = error;
      options.onRetry?.(error, attempt, attempts);
      if (attempt < attempts) {
        const delay = delayForAttempt(attempt);
        if (!Number.isFinite(delay) || delay < 0) {
          throw new RangeError('Retry delay must be a non-negative finite number');
        }
        await options.wait(delay);
      }
    }
  }
  throw options.createFinalError(lastError, attempts);
}
