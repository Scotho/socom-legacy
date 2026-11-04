import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { startRecordingProxy } from './proxy';

describe('in-memory native HTTP MCP recording', () => {
  it('records JSON and SSE tool results without headers, and closes resources', async () => {
    const upstream = createServer((req, res) => {
      expect(req.headers.authorization).toBe(`Bearer ${['synthetic', 'test', 'token'].join('-')}`);
      let raw = ''; req.on('data', chunk => { raw += chunk; }); req.on('end', () => {
        const request = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'agent_status' }] } })}\n\n`);
      });
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const port = (upstream.address() as { port: number }).port;
    const proxy = await startRecordingProxy(`http://127.0.0.1:${port}`, 'synthetic-test-token');
    try {
      const response = await fetch(proxy.endpoint, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
      expect(response.ok).toBe(true); await response.text();
      expect(proxy.events).toEqual([{ method: 'tools/list', params: undefined, result: { tools: [{ name: 'agent_status' }] } }]);
      expect(JSON.stringify(proxy.events)).not.toMatch(/Bearer|synthetic-test-token/);
      expect((await fetch(proxy.endpoint, { method: 'POST', headers: { Origin: 'https://unrelated.invalid' }, body: '{}' })).status).toBe(403);
    } finally { await proxy.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
    await expect(fetch(proxy.endpoint)).rejects.toThrow();
  });
  it('records partial transport failures without inventing tool success', async () => {
    const proxy = await startRecordingProxy('http://127.0.0.1:1', 'synthetic-test-token');
    try {
      const response = await fetch(proxy.endpoint, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_request' } }) });
      expect(response.status).toBe(502); expect(proxy.events[0]?.error).toBe(true);
      expect(JSON.stringify(proxy.events)).not.toContain('synthetic-test-token');
    } finally { await proxy.close(); }
  });
});
