import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';

/**
 * LATER 566 (product track, the e2e harness -- no page's or server's game behaviour changes): the lifecycle of a server
 * process a spec starts for itself -- its spawn, its readiness, its stop -- lifted out of `./menuMatch`'s
 * `startMenuServer` so it can be unit-tested without the match server (`../test/e2eServerLifecycle.test.ts`).
 *
 * Measured on the AWS seat box, 2026-10-28: the menu specs' server sits on a fixed port (`./menuMatch`
 * `MENU_MATCH_PORT`, 5351 at worker 0); its stop gave the old process 5 s, the port stayed held 9-23 s after it, and a
 * spec started 3-4 s after the previous one failed "the match server exited 70" (central's last resort, its bind
 * refused) before any page step, with nothing of the server's output said. So:
 * - (a) **the port wait**: a start waits, bounded (`SERVER_PORT_BOUND_MS`), until its port is free (no connection
 *   accepted, a bind taken and let go) before it spawns -- for a crash that skipped a stop -- and a stop waits until
 *   the process has exited (SIGTERM; SIGKILL past `SERVER_STOP_GRACE_MS`) and its port is free, with the same bound. Past
 *   the bound each throws naming the port, a stop the pid too.
 * - (b) **the output surfaced**: a process that exits before it listens, or on its own during the run (non-zero or by a
 *   signal), throws with its output's last `SERVER_TAIL_LINES` lines, stdout and stderr in arrival order -- the start
 *   at once, the run's at the stop (and printed on this process's stderr when it happens).
 * The port stays fixed: the specs and their pages name `MENU_MATCH_PORT` across the e2e tree (`openMenuPage`'s
 * `server=` link, the invite links, `oneWorkerPass`'s marker), so a system-assigned port would change every spec.
 */

/** The bound on each wait for the port (a start's before its spawn, a stop's after the exit), ms. */
export const SERVER_PORT_BOUND_MS = 30_000;
/** A stop's SIGTERM grace before SIGKILL, ms (central's shutdown flushes its store; the data directory is a temp). */
export const SERVER_STOP_GRACE_MS = 10_000;
/** The port's poll, ms. */
export const SERVER_PORT_POLL_MS = 250;
/** The output lines an error carries. */
export const SERVER_TAIL_LINES = 80;
/** How long a start waits for the `"listening"` line, ms (today's 60 s). */
export const SERVER_START_MS = 60_000;

export interface ServerProcessOptions {
  /** What the errors call it ("the match server"). */
  name?: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** The port it listens on. */
  port: number;
  /** The host it listens on (the loopback). */
  host?: string;
  /** How long it has to print its `"listening"` line, ms. */
  startMs?: number;
  /** The bound on each wait for the port, ms. */
  boundMs?: number;
  /** How long a stop gives it before it is killed, ms. */
  graceMs?: number;
  /** The port's poll, ms. */
  pollMs?: number;
  /** The output lines an error carries. */
  tailLines?: number;
  /** Run just before the spawn (a test's seam: `../test/e2eServerLifecycle.test.ts` takes the port there). */
  beforeSpawn?: () => Promise<void>;
}

export interface ServerProcess { lines: string[]; pid: number | undefined; stop(): Promise<void> }

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/** Whether `host:port` takes a connection now (a probe unanswered within a second counts as held). */
export function portAcceptsConnection(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((ok) => {
    const s = connect({ port, host });
    const done = (v: boolean): void => { s.destroy(); ok(v); };
    s.setTimeout(1000, () => done(true));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** Whether `host:port` can be bound now (taken and let go at once). */
export function portBindable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((ok) => {
    const probe = createServer();
    probe.once('error', () => ok(false));
    probe.listen({ port, host, exclusive: true }, () => probe.close(() => ok(true)));
  });
}

/**
 * Wait until `host:port` is free -- it accepts no connection and a bind on it succeeds -- polling every `pollMs`, for
 * at most `boundMs`; past it, throw naming the port (and `holder`, what was expected to let it go).
 */
export async function waitPortFree(port: number, o: { host?: string; boundMs?: number; pollMs?: number; holder?: string } = {}): Promise<void> {
  const host = o.host ?? '127.0.0.1';
  const bound = o.boundMs ?? SERVER_PORT_BOUND_MS;
  const until = Date.now() + bound;
  for (;;) {
    if (!(await portAcceptsConnection(port, host)) && await portBindable(port, host)) return;
    if (Date.now() >= until) {
      throw new Error(`port ${host}:${port} still held after ${bound} ms${o.holder ? ` (${o.holder})` : ''} (LATER 566, e2e/serverLifecycle.ts)`);
    }
    await sleep(Math.min(o.pollMs ?? SERVER_PORT_POLL_MS, Math.max(0, until - Date.now())));
  }
}

export async function startServerProcess(o: ServerProcessOptions): Promise<ServerProcess> {
  const name = o.name ?? 'the match server';
  const host = o.host ?? '127.0.0.1';
  const bound = o.boundMs ?? SERVER_PORT_BOUND_MS;
  const grace = o.graceMs ?? SERVER_STOP_GRACE_MS;
  const pollMs = o.pollMs ?? SERVER_PORT_POLL_MS;
  const tailN = o.tailLines ?? SERVER_TAIL_LINES;
  const group = process.platform !== 'win32';

  // (a) A crash that skipped its stop, or another run's server, still on the port: wait for it, bounded.
  await waitPortFree(o.port, { host, boundMs: bound, pollMs, holder: `before ${name} starts: something still listens there` });

  const lines: string[] = [];
  await o.beforeSpawn?.();
  const server: ChildProcess = spawn(o.command, o.args, { cwd: o.cwd, stdio: 'pipe', detached: group, env: o.env });
  const pid = server.pid;

  // Both streams by line, in arrival order; stderr's lines marked (`lines` is the specs' read of the server's log).
  const partial = { out: '', err: '' };
  const take = (which: 'out' | 'err', d: Buffer): string[] => {
    partial[which] += d.toString();
    const parts = partial[which].split('\n');
    partial[which] = parts.pop() ?? '';
    const got = parts.map((l) => l.replace(/\r$/, '')).filter(Boolean).map((l) => (which === 'err' ? `stderr: ${l}` : l));
    lines.push(...got);
    return got;
  };
  const tail = (): string => {
    const rest = [partial.out, partial.err && `stderr: ${partial.err}`].filter(Boolean);
    const all = [...lines, ...rest];
    const last = all.slice(-tailN);
    return `its last ${last.length} of ${all.length} output lines:\n${last.join('\n')}`;
  };

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((ok) => {
    server.once('exit', (code, signal) => ok({ code, signal }));
  });
  // Stdio closed: every byte the process wrote has been read (or a second has passed since its exit).
  const drained = new Promise<void>((ok) => { server.once('close', () => ok()); });
  const settled = async (): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
    const how = await exited;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([drained, new Promise<void>((ok) => { timer = setTimeout(ok, 1000); })]);
    clearTimeout(timer);                                               // drained first: no timer holds a worker alive
    return how;
  };
  const alive = (): boolean => server.exitCode === null && server.signalCode === null;
  const signal = (sig: NodeJS.Signals): void => {
    if (pid === undefined) return;
    try { if (group) process.kill(-pid, sig); else server.kill(sig); } catch { /* gone */ }
  };
  const exitedWithin = async (ms: number): Promise<boolean> => {
    if (!alive()) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([exited.then(() => true), new Promise<boolean>((ok) => { timer = setTimeout(() => ok(false), Math.max(0, ms)); })]);
    clearTimeout(timer);
    return r;
  };
  const said = (how: { code: number | null; signal: NodeJS.Signals | null }): string => (how.code !== null ? `exited ${how.code}` : `exited by ${how.signal}`);

  let stopping = false;
  let ready = false;
  let crash: Error | null = null;

  // (b) An exit nobody asked for, during the run: said now on this process's stderr, thrown at the stop.
  void settled().then((how) => {
    if (!ready || stopping || (how.code === 0 && how.signal === null)) return;
    crash = new Error(`${name} ${said(how)} (pid ${pid}) on its own during the run; ${tail()}`);
    process.stderr.write(`${crash.message}\n`);
  });

  try {
    await new Promise<void>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`${name} (pid ${pid}, port ${host}:${o.port}) did not start within ${o.startMs ?? SERVER_START_MS} ms; ${tail()}`)), o.startMs ?? SERVER_START_MS);
      const seen = (d: Buffer): void => {
        if (take('out', d).some((l) => l.includes('"listening"')) || partial.out.includes('"listening"')) { clearTimeout(timer); ready = true; ok(); }
      };
      server.stdout!.on('data', seen);
      server.stderr!.on('data', (d: Buffer) => { take('err', d); });
      server.once('error', (e) => { clearTimeout(timer); fail(new Error(`${name} did not spawn: ${e.message}`)); });
      // (b) It exits before it listens: wait for its output to drain, then say why.
      void settled().then((how) => { if (!ready) { clearTimeout(timer); fail(new Error(`${name} ${said(how)} (pid ${pid}) before it listened on port ${host}:${o.port}; ${tail()}`)); } });
    });
  } catch (e) {
    // A start that failed leaves nothing running on the port.
    if (alive()) { signal('SIGKILL'); await exitedWithin(grace); }
    throw e;
  }

  return {
    lines,
    pid,
    stop: async () => {
      stopping = true;
      const t0 = Date.now();
      const left = (): number => Math.max(0, bound - (Date.now() - t0));
      const faults: Error[] = [];
      // (a) SIGTERM; SIGKILL past the grace; the exit awaited, bounded.
      if (alive()) {
        signal('SIGTERM');
        if (!(await exitedWithin(Math.min(grace, left())))) {
          signal('SIGKILL');
          if (!(await exitedWithin(left()))) faults.push(new Error(`${name} (pid ${pid}, port ${host}:${o.port}) did not exit within ${bound} ms of its stop`));
        }
      }
      // (a) Then its port, bounded by what is left of the same bound.
      if (faults.length === 0) {
        try { await waitPortFree(o.port, { host, boundMs: Math.max(left(), pollMs), pollMs, holder: `after ${name} pid ${pid} was stopped` }); }
        catch (e) { faults.push(e as Error); }
      }
      if (crash) faults.unshift(crash);
      if (faults.length > 0) throw new Error(faults.map((f) => f.message).join('\n'));
    },
  };
}
