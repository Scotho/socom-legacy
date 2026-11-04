import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { runForgeAgent, type ForgeAgentDevDeps } from '../forge-agent-dev';

/** Product adaptation: process and HTTP fakes only; this file never launches or probes a real service. */
const importEffects = vi.hoisted(() => ({
  spawn: vi.fn(() => { throw Error('Import must not spawn a process.'); }),
  listen: vi.fn(() => { throw Error('Import must not bind a listener.'); }),
}));
vi.mock('node:child_process', async original => ({
  ...await original<typeof import('node:child_process')>(), spawn: importEffects.spawn,
}));
vi.mock('node:net', async original => ({
  ...await original<typeof import('node:net')>(), createServer: importEffects.listen,
}));
const ROOT = resolve('/project with spaces/socomlegacy');
const NODE = resolve('/runtime with spaces/node.exe');
const TSX = resolve('/dependencies with spaces/tsx/dist/loader.mjs');
const VITE = resolve('/dependencies with spaces/vite/bin/vite.js');
const pageHtml = '<!doctype html><html><body><canvas id="view"></canvas><script type="module" src="/src/entry.ts"></script></body></html>';

type Child = { -readonly [Key in keyof ChildProcess]: ChildProcess[Key] } & { kills: number };
function child(): Child {
  const c = new EventEmitter() as Child;
  c.exitCode = null; c.signalCode = null; c.kills = 0;
  c.kill = (() => {
    c.kills++; c.signalCode = 'SIGTERM'; c.emit('exit', null, 'SIGTERM'); return true;
  }) as ChildProcess['kill'];
  return c;
}
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
/** Fetch remains pending until its supplied signal aborts; there is no immediate HTTP failure to poll past. */
function pendingHttp() {
  const signals: AbortSignal[] = [], rejects = new Set<(reason: Error) => void>();
  let closed = false;
  const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    if (closed) { reject(Error('test request released')); return; }
    const signal = init?.signal;
    if (!signal) { reject(Error('missing bounded request signal')); return; }
    signals.push(signal); rejects.add(reject);
    const abort = () => { rejects.delete(reject); reject(signal.reason ?? Error('request aborted')); };
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  }));
  return { fetch, signals, release() {
    closed = true; for (const reject of rejects) reject(Error('test request released')); rejects.clear();
  } };
}
function rig(options: {
  busy?: number[];
  answer?: (url: string) => Response | Promise<Response>;
  onSpawn?: (c: Child, index: number) => void;
} = {}) {
  let time = 0;
  const spawned: { command: string; args: readonly string[]; options: SpawnOptions; child: Child }[] = [];
  const output: string[] = [], errors: string[] = [];
  const interrupts: (() => Promise<void>)[] = [];
  const deps: ForgeAgentDevDeps = {
    root: ROOT, execPath: NODE, tsxBin: TSX, viteBin: VITE, env: {},
    spawn(command, args, spawnOptions) {
      const c = child(); spawned.push({ command, args, options: spawnOptions, child: c });
      options.onSpawn?.(c, spawned.length - 1); return c;
    },
    portFree: vi.fn(async port => !(options.busy ?? []).includes(port)),
    fetch: vi.fn(async (url, init) => {
      expect(new URL(url).hostname).toBe('127.0.0.1');
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (options.answer) return options.answer(url);
      if (url.endsWith('/health')) return Response.json({ ok: true });
      if (url.includes('/.well-known/')) return Response.json({
        resource: 'http://127.0.0.1:5360/mcp', authorization_servers: ['http://127.0.0.1:5360/'],
        issuer: 'http://127.0.0.1:5360',
      });
      if (url.endsWith('/src/agent/install.ts')) return new Response(
        'import.meta.env = {"DEV":true,"VITE_S2U_AGENT_URL":"http://127.0.0.1:5360"};',
      );
      return new Response(pageHtml);
    }),
    now: () => time,
    sleep: async ms => { time += ms; },
    log: line => output.push(line), error: line => errors.push(line),
    onInterrupt: stop => { interrupts.push(stop); },
  };
  return { deps, spawned, output, errors, interrupts };
}

describe('FCW-02b: one-command local agent setup', () => {
  it('can be imported without starting a process or binding a listener', () => {
    expect(importEffects.spawn).not.toHaveBeenCalled(); expect(importEffects.listen).not.toHaveBeenCalled();
  });

  it('skips each pair if either port is occupied and keeps gateway/page addresses consistent', async () => {
    const r = rig({ busy: [5360, 5363] });
    // Report the selected pair back through the fake services, never use the first occupied pair.
    r.deps.fetch = vi.fn(async (url, init) => {
      expect(init?.redirect).toBe('error');
      if (url.endsWith('/health')) return Response.json({ ok: true });
      if (url.includes('/.well-known/')) return Response.json({
        resource: 'http://127.0.0.1:5364/mcp', issuer: 'http://127.0.0.1:5364',
        authorization_servers: ['http://127.0.0.1:5364/'],
      });
      return new Response(url.endsWith('/src/agent/install.ts')
        ? 'import.meta.env = {"DEV":true,"VITE_S2U_AGENT_URL":"http://127.0.0.1:5364"};' : pageHtml);
    });
    const running = await runForgeAgent([], r.deps);
    try {
      expect(typeof running).toBe('object');
      expect(r.spawned).toHaveLength(2);
      const gateway = r.spawned.find(s => s.args.includes(join(ROOT, 'packages/forge-agent/src/main.ts')))!;
      const page = r.spawned.find(s => s.args.includes(VITE))!;
      expect(gateway.options.env).toMatchObject({ FORGE_AGENT_DEVELOPMENT: '1', FORGE_AGENT_PORT: '5364',
        FORGE_AGENT_ISSUER: 'http://127.0.0.1:5364', FORGE_AGENT_ORIGINS: 'http://127.0.0.1:5365' });
      expect(page.options.env?.VITE_S2U_AGENT_URL).toBe('http://127.0.0.1:5364');
      expect(page.args).toEqual(expect.arrayContaining([
        '--config', join(ROOT, 'packages/viewer/vite.config.ts'), '--host', '127.0.0.1', '--port', '5365', '--strictPort',
      ]));
      expect(r.output.join('\n')).toContain('http://127.0.0.1:5365/forge');
      expect(r.output.join('\n')).toContain('claude mcp add --transport http --scope user socom2legacy http://127.0.0.1:5364/mcp');
      expect(r.output.join('\n')).toContain('Or, for this project only:\nclaude mcp add --transport http --scope local socom2legacy http://127.0.0.1:5364/mcp');   // LATER 425
      expect(r.output.join('\n')).toContain('codex mcp add socom2legacy --url http://127.0.0.1:5364/mcp');
    } finally { if (typeof running !== 'number') await running.stop(); }
  });

  it('passes paths with spaces as structured argv without a shell or package installation', async () => {
    const r = rig();
    const running = await runForgeAgent([], r.deps);
    try {
      for (const s of r.spawned) {
        expect(s.command).toBe(NODE); expect(s.options.cwd).toBe(ROOT);
        expect(s.options.shell ?? false).toBe(false);
        expect(s.args.some(a => /^['"]/.test(a))).toBe(false);
        expect(s.args).not.toEqual(expect.arrayContaining(['install', 'mcp', 'login']));
      }
      expect(r.spawned[0]?.args).toEqual(expect.arrayContaining(['--import', pathToFileURL(TSX).href]));
    } finally { if (typeof running !== 'number') await running.stop(); }
  });

  it('cleans only its own already-started child when the second spawn fails', async () => {
    const r = rig();
    const spawn = r.deps.spawn;
    r.deps.spawn = (command, args, options) => {
      if (r.spawned.length === 1) throw Error('spawn failure');
      return spawn(command, args, options);
    };
    expect(await runForgeAgent([], r.deps)).toBe(1);
    expect(r.spawned).toHaveLength(1); expect(r.spawned[0]!.child.kills).toBe(1);
    expect(r.errors.join('\n')).toContain('spawn failure');
    expect(r.output.join('\n')).not.toContain('claude mcp add');
  });

  it('reports an owned bind failure instead of accepting a foreign listener as readiness', async () => {
    const r = rig({ onSpawn(c, index) {
      if (index === 0) queueMicrotask(() => { c.exitCode = 1; c.emit('exit', 1, null); });
    } });
    expect(await runForgeAgent([], r.deps)).toBe(1);
    expect(r.errors.join('\n')).toMatch(/gateway.*(exit|bind|start)/i);
    expect(r.output.join('\n')).not.toContain('claude mcp add');
    expect(r.spawned.every(s => s.child.exitCode !== null || s.child.kills > 0)).toBe(true);
  });

  it('bounds missing readiness and cleans both children without printing a ready command', async () => {
    const r = rig({ answer: () => new Response('not ready', { status: 503 }) });
    expect(await runForgeAgent([], r.deps)).toBe(1);
    expect(r.errors.join('\n')).toMatch(/(timed out|timeout|not ready)/i);
    expect(r.spawned).toHaveLength(2);
    expect(r.spawned.every(s => s.child.kills === 1)).toBe(true);
    expect(r.output.join('\n')).not.toContain('claude mcp add');
  });

  it('bounds a pending abort-aware HTTP request and stops both owned children at the readiness timeout', async () => {
    vi.useFakeTimers(); const r = rig(), http = pendingHttp();
    r.deps.fetch = http.fetch; r.deps.now = Date.now;
    r.deps.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result: unknown, completed = false;
    const launch = runForgeAgent([], r.deps).then(
      value => { result = value; completed = true; }, error => { result = error; completed = true; },
    );
    try {
      await settle(); expect(r.spawned).toHaveLength(2); expect(http.signals.length).toBeGreaterThan(0);
      expect(http.signals[0]!.aborted).toBe(false); expect(completed).toBe(false);
      // An outer test ceiling, not a claimed launcher timeout value: startup must have a finite smaller budget.
      await vi.advanceTimersByTimeAsync(120_000); await settle();
      expect(completed).toBe(true); expect(result).toBe(1);
      expect(http.signals.every(signal => signal.aborted)).toBe(true);
      expect(r.spawned.every(s => s.child.kills === 1)).toBe(true);
      expect(r.errors.join('\n')).toMatch(/(timed out|timeout|not ready)/i);
      expect(r.output.join('\n')).not.toContain('claude mcp add');
      await launch;
    } finally {
      http.release(); for (const s of r.spawned) if (s.child.signalCode === null && s.child.exitCode === null) s.child.kill();
      await settle(); vi.clearAllTimers(); vi.useRealTimers();
    }
  });

  it('interrupts a pending readiness request and stops only the children it started', async () => {
    vi.useFakeTimers(); const r = rig(), http = pendingHttp();
    r.deps.fetch = http.fetch; r.deps.now = Date.now;
    r.deps.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let result: unknown, completed = false;
    const launch = runForgeAgent([], r.deps).then(
      value => { result = value; completed = true; }, error => { result = error; completed = true; },
    );
    try {
      await settle(); expect(r.spawned).toHaveLength(2); expect(http.signals.length).toBeGreaterThan(0);
      expect(completed).toBe(false); expect(r.interrupts).toHaveLength(1);
      await r.interrupts[0]!(); await settle();
      expect(http.signals.every(signal => signal.aborted)).toBe(true);
      expect(completed).toBe(true); expect(typeof result).toBe('number');
      expect(r.spawned.map(s => s.child.kills)).toEqual([1, 1]);
      expect(r.output.join('\n')).not.toContain('claude mcp add');
      await launch;
    } finally {
      http.release(); for (const s of r.spawned) if (s.child.signalCode === null && s.child.exitCode === null) s.child.kill();
      await settle(); vi.clearAllTimers(); vi.useRealTimers();
    }
  });

  it('handles an asynchronous child error after its sibling starts and cleans both owned children', async () => {
    let unhandled: unknown;
    const r = rig({ onSpawn(_child, index) {
      if (index === 1) queueMicrotask(() => {
        try { r.spawned[0]!.child.emit('error', Error('EADDRINUSE asynchronous gateway bind failure')); }
        catch (error) { unhandled = error; }
      });
    } });
    const result = await runForgeAgent([], r.deps);
    try {
      expect(unhandled).toBeUndefined(); expect(result).toBe(1); expect(r.spawned).toHaveLength(2);
      expect(r.errors.join('\n')).toContain('EADDRINUSE');
      expect(r.spawned.map(s => s.child.kills)).toEqual([1, 1]);
      expect(r.output.join('\n')).not.toContain('claude mcp add');
    } finally { if (typeof result !== 'number') await result.stop(); }
  });

  it('signal cleanup is idempotent and retains no listener discovered by port', async () => {
    const r = rig();
    const running = await runForgeAgent([], r.deps);
    expect(typeof running).toBe('object'); expect(r.interrupts).toHaveLength(1);
    await r.interrupts[0]!(); await r.interrupts[0]!();
    if (typeof running !== 'number') await running.stop();
    expect(r.spawned.map(s => s.child.kills)).toEqual([1, 1]);
  });

  it.each([
    { label: 'bare Vite /forge 404', html: 'Not found', status: 404 },
    { label: 'unrelated SPA HTTP 200 fallback', html: '<!doctype html><script src="/src/main.ts"></script>', status: 200 },
  ])('--check rejects $label and names the viewer config', async ({ html, status }) => {
    const r = rig({ answer: url => url.endsWith('/forge')
      ? new Response(html, { status }) : url.endsWith('/health') ? Response.json({ ok: true })
        : new Response('import.meta.env = {"VITE_S2U_AGENT_URL":"http://127.0.0.1:5360"};'),
    });
    expect(await runForgeAgent(['--check'], r.deps)).toBe(1);
    expect(r.spawned).toHaveLength(0); expect(r.interrupts).toHaveLength(0);
    expect([...r.output, ...r.errors].join('\n')).toMatch(/wrong.config|viewer.*config/i);
    expect([...r.output, ...r.errors].join('\n')).toContain('packages/viewer/vite.config.ts');
  });

  it('--check reports configured/listening addresses and the served page gateway without starting children', async () => {
    const r = rig();
    expect(await runForgeAgent(['--check'], r.deps)).toBe(0);
    const text = r.output.join('\n');
    expect(text).toContain('http://127.0.0.1:5360/mcp'); expect(text).toContain('http://127.0.0.1:5361/forge');
    expect(text).toMatch(/(page|viewer).*(uses|gateway|configured).*5360/i);
    expect(text).toMatch(/listening/i); expect(r.spawned).toHaveLength(0);
  });

  it('--check refuses a page configured for another gateway even when both HTTP endpoints answer', async () => {
    const r = rig(); const fetcher = r.deps.fetch;
    r.deps.fetch = (url, init) => url.endsWith('/src/agent/install.ts')
      ? Promise.resolve(new Response('import.meta.env = {"VITE_S2U_AGENT_URL":"http://127.0.0.1:5390"};'))
      : fetcher(url, init);
    expect(await runForgeAgent(['--check'], r.deps)).toBe(1);
    expect([...r.output, ...r.errors].join('\n')).toMatch(/(mismatch|different gateway|wrong.*gateway)/i);
    expect(r.spawned).toHaveLength(0);
  });
});
