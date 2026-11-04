/** Product adaptation: a real loopback OAuth callback; no token/code is logged, stored or echoed. */
import { createServer } from 'node:http';
import { once } from 'node:events';

export async function withCallbackServer<T>(work: (redirect: string) => Promise<T>): Promise<T> {
  const server = createServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/fcw-callback') { response.writeHead(404).end(); return; }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'" });
    response.end('Local acceptance callback complete.');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const port = (server.address() as { port: number }).port;
    return await work(`http://127.0.0.1:${port}/fcw-callback`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
