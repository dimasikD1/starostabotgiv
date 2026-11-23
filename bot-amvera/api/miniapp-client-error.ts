export interface MiniAppClientErrorDiagnostic {
  kind: string;
  message: string;
  source: string;
  line: number;
  column: number;
  stage: string;
  stack: string;
  receivedAt: string;
}

/** Sanitizes untrusted browser diagnostics before they are written to server logs. */
export function sanitizeMiniAppClientError(
  value: unknown,
  receivedAt = new Date().toISOString()
): MiniAppClientErrorDiagnostic {
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const clean = (item: unknown, max: number): string =>
    String(item ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
  const safeInteger = (item: unknown): number =>
    Number.isSafeInteger(Number(item)) ? Number(item) : 0;

  return {
    kind: clean(input.kind || 'error', 40),
    message: clean(input.message || 'unknown', 500),
    source: clean(input.source || '', 500),
    line: safeInteger(input.line),
    column: safeInteger(input.column),
    stage: clean(input.stage || 'unknown', 120),
    stack: clean(input.stack || '', 2500),
    receivedAt
  };
}
