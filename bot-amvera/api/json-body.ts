import { Buffer } from 'node:buffer';

/** Reads and parses a bounded JSON request body without depending on HTTP server APIs. */
export async function readJsonBody(
  request: AsyncIterable<Uint8Array>,
  maxBytes = 32768
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('Слишком большой запрос.');
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) as unknown : {};
}
