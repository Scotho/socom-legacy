import { createServer, connect, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startServerProcess, type ServerProcess, type ServerProcessOptions } from '../e2e/serverLifecycle';

/**
 * LATER 566 (a) the port wait, (b) the output surfaced (product track, the e2e harness -- no page's or server's game
 * behaviour changes): the menu specs' match server (`../e2e/menuMatch.ts` `startMenuServer`, its lifecycle
 * `../e2e/serverLifecycle.ts`) on a fixed port.
 * Measured on the AWS seat box, 2026-10-28: a stop gave the old server 5 s, the port stayed held 9-23 s after it, and a
 * spec that started 3-4 s after the previous one failed "the match server exited 70" before any page step, the server's
 * stderr unprinted. Held here with a stub server -- a `node -e` child that binds the port as central does (its bind
 * refused: a line on stderr, exit 70, central's last resort) -- and a holder in this process:
 * - (a) a start waits, bounded, until its port is free, then spawns; past the bound it throws naming the port;
 * - (a) a stop waits until the process has exited (a SIGTERM, then a SIGKILL past the grace) and its port accepts no
 *   connection; past the bound it throws naming the port and the pid;
 * - (b) a server that exits non-zero at its start or during the run says why: its output's last lines are in the error.
 */

const HOST = '127.0.0.1';
const POSIX = process.platform !== 'win32';

const holders: Server[] = [];
const started: ServerProcess[] = [];

afterEach(async () => {
  for (const h of holders.splice(0)) await new Promise<void>((ok) => h.close(() => ok()));
  for (const s of started.splice(0)) {
    if (s.pid === undefined) continue;
    try { if (POSIX) process.kill(-s.pid, 'SIGKILL'); else process.kill(s.pid, 'SIGKILL'); } catch { /* gone */ }
  }
});

/** A listener in this process on `port` (0: any free one); its port. */
async function hold(port = 0): Promise<{ server: Server; port: number }> {
  const server = createServer();
  holders.push(server);
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(port, HOST, () => ok()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return { server, port: addr.port };
}

async function release(server: Server): Promise<void> {
  const i = holders.indexOf(server);
  if (i >= 0) holders.splice(i, 1);
  await new Promise<void>((ok) => server.close(() => ok()));
}

/** A free port: one this process held for a moment. */
async function freePort(): Promise<number> {
  const { server, port } = await hold();
  await release(server);
  return port;
}

/** Whether `port` takes a connection now. */
function accepts(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = connect({ port, host: HOST });
    const done = (v: boolean): void => { s.destroy(); ok(v); };
    s.setTimeout(1000, () => done(true));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/**
 * The stub server's script: it binds `port` (when `bind`) and prints central's `"listening"` line; a refused bind is a
 * line on stderr and exit 70. `onTerm`: 'exit' (at once), 'linger' (closes and exits after `lingerMs`), 'ignore'.
 */
function stub(port: number, o: { bind?: boolean; onTerm?: 'exit' | 'linger' | 'ignore'; lingerMs?: number; crashAfterMs?: number; noisyFail?: boolean } = {}): string {
  return `
const net = require('node:net');
const port = ${port};
const keep = setInterval(() => {}, 1000);
let srv = null;
const listening = () => console.log(JSON.stringify({ level: 'info', msg: 'listening', port }));
${o.noisyFail ? `
for (let i = 0; i < 100; i++) console.error('l' + String(i).padStart(3, '0'));
console.error('fatal: boom');
clearInterval(keep);
process.exitCode = 70;
` : `
if (${o.bind ?? true}) {
  srv = net.createServer();
  srv.on('error', (e) => { console.error('listen failed: ' + e.code); clearInterval(keep); process.exitCode = 70; });
  srv.listen(port, '127.0.0.1', listening);
} else listening();
`}
${o.crashAfterMs !== undefined ? `setTimeout(() => { console.error('crash: kaboom'); clearInterval(keep); if (srv) srv.close(); process.exitCode = 70; }, ${o.crashAfterMs});` : ''}
process.on('SIGTERM', () => {
  ${o.onTerm === 'ignore' ? '' : o.onTerm === 'linger'
    ? `setTimeout(() => { clearInterval(keep); if (srv) srv.close(); process.exit(0); }, ${o.lingerMs ?? 0});`
    : 'clearInterval(keep); if (srv) srv.close(); process.exit(0);'}
});
`;
}

async function start(port: number, script: string, extra: Partial<ServerProcessOptions> = {}): Promise<ServerProcess> {
  const s = await startServerProcess({ name: 'the match server', command: process.execPath, args: ['-e', script], port, host: HOST, pollMs: 100, ...extra });
  started.push(s);
  return s;
}

describe('LATER 566: the e2e match server\'s port and lifecycle', () => {
  it('(a) a start waits until its port is free -- the holder closes 1.5 s in -- then spawns and listens', async () => {
    const { server: holder, port } = await hold();
    setTimeout(() => { void release(holder); }, 1500);
    const t0 = Date.now();
    const s = await start(port, stub(port), { boundMs: 15_000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
    expect(await accepts(port)).toBe(true);
    await s.stop();
    expect(await accepts(port)).toBe(false);
  }, 30_000);

  it('(a) a start whose port stays held past the bound throws naming the port, and spawns nothing', async () => {
    const { port } = await hold();
    const err = await start(port, stub(port), { boundMs: 800 }).then(() => null, (e: Error) => e);
    expect(err, 'the start must fail').not.toBeNull();
    expect(err!.message).toMatch(new RegExp(`port ${HOST}:${port}`));
    expect(err!.message).toMatch(/still held/);
    expect(err!.message).not.toMatch(/exited/);                       // nothing was spawned to exit
  }, 15_000);

  it.skipIf(!POSIX)('(a) (Linux and macOS only) a stop waits for a server that takes 6.5 s to go -- over the old 5 s -- until its port is free', async () => {
    const port = await freePort();
    const s = await start(port, stub(port, { onTerm: 'linger', lingerMs: 6500 }));
    const t0 = Date.now();
    await s.stop();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(6000);
    expect(await accepts(port)).toBe(false);
  }, 45_000);

  it.skipIf(!POSIX)('(a) (Linux and macOS only) a stop kills a server that ignores SIGTERM once the grace is past, then its port is free', async () => {
    const port = await freePort();
    const s = await start(port, stub(port, { onTerm: 'ignore' }), { graceMs: 1000, boundMs: 15_000 });
    const t0 = Date.now();
    await s.stop();
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(await accepts(port)).toBe(false);
  }, 30_000);

  it('(a) a stop whose port is still held past the bound throws naming the port and the pid', async () => {
    const port = await freePort();
    const s = await start(port, stub(port, { bind: false }), { boundMs: 1500 });
    await hold(port);                                                  // another process's listener, after the start
    const err = await s.stop().then(() => null, (e: Error) => e);
    expect(err, 'the stop must fail').not.toBeNull();
    expect(err!.message).toMatch(new RegExp(`port ${HOST}:${port}`));
    expect(err!.message).toMatch(new RegExp(`pid ${s.pid}\\b`));
  }, 20_000);

  it('(b) a server that exits 70 at its start: the error carries its last 80 lines, stderr included', async () => {
    const port = await freePort();
    const err = await start(port, stub(port, { noisyFail: true })).then(() => null, (e: Error) => e);
    expect(err, 'the start must fail').not.toBeNull();
    expect(err!.message).toMatch(/the match server exited 70/);
    expect(err!.message).toMatch(/fatal: boom/);
    expect(err!.message).toMatch(/l099/);
    expect(err!.message).not.toMatch(/l000/);                          // only the last 80 lines
  }, 15_000);

  it('(b) a server whose bind is refused says so: "listen failed: EADDRINUSE" is in the error', async () => {
    const port = await freePort();
    // The holder takes the port after the start's wait read it free and before the child binds: the measured race.
    const err = await start(port, stub(port), { boundMs: 2000, beforeSpawn: async () => { await hold(port); } })
      .then(() => null, (e: Error) => e);
    expect(err, 'the start must fail').not.toBeNull();
    expect(err!.message).toMatch(/the match server exited 70/);
    expect(err!.message).toMatch(/listen failed: EADDRINUSE/);
  }, 15_000);

  it('(b) a server that exits 70 during the run: the stop throws with its last lines', async () => {
    const port = await freePort();
    const s = await start(port, stub(port, { crashAfterMs: 300 }));
    await new Promise((ok) => setTimeout(ok, 1500));
    const err = await s.stop().then(() => null, (e: Error) => e);
    expect(err, 'the stop must fail').not.toBeNull();
    expect(err!.message).toMatch(/the match server exited 70/);
    expect(err!.message).toMatch(/crash: kaboom/);
  }, 15_000);
});
