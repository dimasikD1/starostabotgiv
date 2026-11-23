import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OutgoingHttpHeaders } from 'node:http';

export type HttpResponseHeaders = OutgoingHttpHeaders;

/** Sends a JSON response with the same no-cache and nosniff headers as the legacy server. */
export function sendJsonResponse(
  response: ServerResponse,
  status: number,
  data: unknown,
  headers: HttpResponseHeaders = {}
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(data));
}

/** Sends UTF-8 plain text and preserves HEAD semantics without transmitting the body. */
export function sendTextResponse(
  request: Pick<IncomingMessage, 'method'>,
  response: ServerResponse,
  status: number,
  text: unknown,
  headers: HttpResponseHeaders = {}
): void {
  const body = Buffer.from(String(text), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}
