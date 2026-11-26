export type PollCommandInputResult =
  | { ok: true; question: string; options: string[] }
  | { ok: false; error: 'too_few_parts' | 'question_too_long' | 'option_too_long' | 'too_few_options' };

/** Parse and validate the legacy /poll payload without changing its input limits. */
export function parsePollCommandInput(input: string): PollCommandInputResult {
  const parts = input.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return { ok: false, error: 'too_few_parts' };

  const question = parts.shift()!;
  const options = parts.slice(0, 10);
  if (question.length > 300) return { ok: false, error: 'question_too_long' };
  if (options.some((option) => option.length > 100)) {
    return { ok: false, error: 'option_too_long' };
  }
  if (options.length < 2) return { ok: false, error: 'too_few_options' };

  return { ok: true, question, options };
}
