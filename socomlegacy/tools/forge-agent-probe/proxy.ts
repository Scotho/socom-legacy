/** Product adaptation: native HTTP MCP proxy; bearer credentials and transcripts stay in memory. */
import { createServer, type IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import type { Exchange } from './acceptance';

const MAX_BODY = 4 * 1024 * 1024;
async function readBody(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of source) { size += chunk.length; if (size > MAX_BODY) throw Error('PROXY_BODY_LIMIT'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function responses(body: string): any[] {
  try { const parsed = JSON.parse(body); return Array.isArray(parsed) ? parsed : [parsed]; } catch { /* SSE is the other standard MCP response. */ }
  return body.split(/\r?\n\r?\n/).flatMap(frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    try { return data ? [JSON.parse(data)] : []; } catch { return []; }
  });
}
export async function startRecordingProxy(gateway: string, token: string, port = 0) {
  const destination = new URL(gateway);
  if (destination.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(destination.hostname)
    || destination.username || destination.password || destination.search || destination.hash || destination.pathname !== '/') throw Error('LOCAL_GATEWAY_REQUIRED');
  const events: Exchange[] = [];
  const aborters = new Set<AbortController>();
  let recordedBytes = 0, closed = false;
  const server = createServer(async (request: IncomingMessage, response) => {
    if (closed || request.url !== '/mcp') { response.writeHead(404).end(); return; }
    // Native clients have no browser Origin. This loopback-only proxy is never a page API.
    if (request.headers.origin) { response.writeHead(403).end(); return; }
    if (!['POST', 'GET', 'DELETE'].includes(request.method ?? '')) { response.writeHead(405).end(); return; }
    let exchange: Exchange | undefined;
    const abort = new AbortController(); aborters.add(abort);
    const timer = setTimeout(() => abort.abort(), 40_000);
    try {
      const body = request.method === 'POST' ? await readBody(request) : undefined;
      if (body?.length) {
        const message = JSON.parse(body.toString('utf8'));
        exchange = { method: message.method, params: message.params };
        if (typeof message.method !== 'string' || Array.isArray(message)) throw Error('PROXY_REQUEST_INVALID');
        if (events.length >= 512 || recordedBytes > 24 * 1024 * 1024) throw Error('PROXY_RECORD_LIMIT');
        events.push(exchange);
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream' };
      for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']) {
        const value = request.headers[name]; if (typeof value === 'string') headers[name] = value;
      }
      const upstream = await fetch(new URL('/mcp', destination), { method: request.method, headers,
        ...(body ? { body: new Uint8Array(body) } : {}), signal: abort.signal, redirect: 'error' });
      // Streamable HTTP GET streams are not tool responses and must not hold cleanup open.
      if (request.method === 'GET') { await upstream.body?.cancel(); response.writeHead(upstream.status).end(); return; }
      const data = upstream.body ? await readBody(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>)) : Buffer.alloc(0);
      recordedBytes += data.length;
      if (exchange) {
        const message = JSON.parse(body!.toString('utf8'));
        const reply = responses(data.toString('utf8')).find(reply => reply.id === message.id);
        if (reply?.result !== undefined) exchange.result = reply.result;
        if (!upstream.ok || reply?.error || (message.id !== undefined && !reply)) exchange.error = true;
      }
      const outgoing: Record<string, string> = {};
      for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) {
        const value = upstream.headers.get(name); if (value) outgoing[name] = value;
      }
      response.writeHead(upstream.status, outgoing).end(data);
    } catch {
      if (exchange) exchange.error = true;
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Local acceptance proxy failed' }));
    } finally { clearTimeout(timer); aborters.delete(abort); }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const actualPort = (server.address() as { port: number }).port;
  return { endpoint: `http://127.0.0.1:${actualPort}/mcp`, events,
    async close() { closed = true; for (const controller of aborters) controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
