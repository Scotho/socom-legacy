import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { RunAborted } from '../eph/abort';
import { LineChild, type ProcLike } from '../eph/psChild';
import { FIND_WINDOW_POLL_MS, FIND_WINDOW_TIMEOUT_MS, WindowHelper, pollWindow, windowArgs, windowScript } from '../eph/window';

/**
 * The PCSX2 window helpers (EPH-2 fold round 2, finding A): one long-lived PowerShell child answers every window search
 * and placement, so no poll blocks the event loop (an execFileSync PowerShell with Add-Type blocked it for about 1 s a
 * poll, and a Ctrl+C relayed then went unanswered). Nothing here starts PowerShell: the child is a fake process.
 */

class FakeStream extends EventEmitter {
  encoding: string | null = null;
  readonly written: string[] = [];
  ended = false;
  setEncoding(e: string): this { this.encoding = e; return this; }
  write(s: string): boolean { this.written.push(s); return true; }
  end(): void { this.ended = true; }
}

class FakeProc extends EventEmitter implements ProcLike {
  readonly stdin = new FakeStream();
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  /** Answers one line on stdout, as the PowerShell loop does. */
  reply(line: string): void { this.stdout.emit('data', `${line}\r\n`); }
}

const tick = (): Promise<void> => new Promise((done) => setImmediate(done));

describe('LineChild: every stream of a spawned child is listened to', () => {
  it('reports the first failure once: a spawn error, a stdin EPIPE, a stdout error, an exit before close', () => {
    for (const fail of [
      (p: FakeProc) => p.emit('error', Object.assign(new Error('spawn powershell ENOENT'), { code: 'ENOENT' })),
      (p: FakeProc) => p.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })),
      (p: FakeProc) => p.stdout.emit('error', new Error('read ECONNRESET')),
      (p: FakeProc) => p.stderr.emit('error', new Error('read ECONNRESET')),
      (p: FakeProc) => p.emit('exit', 1, null),
    ]) {
      const p = new FakeProc();
      const fails: string[] = [];
      const c = new LineChild(p, 'the helper', { onLine: () => undefined, onFail: (err) => { fails.push(err.message); } });
      expect(() => fail(p)).not.toThrow();
      p.emit('exit', 1, null);
      expect(fails).toHaveLength(1);
      expect(fails[0]).toMatch(/^the helper/);
      expect(c.failure?.message).toBe(fails[0]);
      expect(() => c.write('x\n')).toThrow(fails[0]);
    }
  });

  it('splits stdout into lines across chunks, and an exit after close is not a failure', () => {
    const p = new FakeProc();
    const lines: string[] = [];
    const fails: Error[] = [];
    const c = new LineChild(p, 'the helper', { onLine: (l) => { lines.push(l); }, onFail: (err) => { fails.push(err); } });
    expect(p.stdout.encoding).toBe('utf8');
    p.stdout.emit('data', 'hwnd 1');
    p.stdout.emit('data', '2\r\nok 1\r\n');
    expect(lines).toEqual(['hwnd 12', 'ok 1']);
    c.write('find 1 x\n');
    expect(p.stdin.written).toEqual(['find 1 x\n']);
    c.close();
    expect(p.stdin.ended).toBe(true);
    p.stdin.emit('error', new Error('write EPIPE'));
    p.emit('exit', 0, null);
    expect(fails).toEqual([]);
  });
});

describe('the window helper: one PowerShell child, asynchronous calls', () => {
  it('runs one encoded script that compiles its type once and loops on stdin', () => {
    const s = windowScript();
    expect(s.match(/Add-Type/g)).toHaveLength(1);
    expect(s).toContain('[Console]::In.ReadLine()');
    expect(s).toContain('EnumWindows');
    expect(s).toContain('SetWindowPos');
    expect(windowArgs().slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  });

  it('find and place return promises settled by the child replies, in order; the child is spawned once', async () => {
    const procs: FakeProc[] = [];
    const w = new WindowHelper((cmd, args) => { expect([cmd, args]).toEqual(['powershell', windowArgs()]); const p = new FakeProc(); procs.push(p); return p; });
    const found = w.find('SOCOM II - U.S. Navy SEALs', 4242);
    const placed = w.place(77, { x: 0, y: 0, width: 656, height: 488 });
    expect(found).toBeInstanceOf(Promise);
    expect(placed).toBeInstanceOf(Promise);
    expect(procs).toHaveLength(1);
    const title64 = Buffer.from('SOCOM II - U.S. Navy SEALs', 'utf8').toString('base64');
    expect(procs[0]!.stdin.written).toEqual([`find 4242 ${title64}\n`, 'place 77 0 0 656 488\n']);
    let settled = false;
    void found.then(() => { settled = true; });
    await tick();
    expect(settled).toBe(false);
    procs[0]!.reply('hwnd 77');
    procs[0]!.reply('ok True');
    await expect(found).resolves.toBe(77);
    await expect(placed).resolves.toBeUndefined();
    const third = w.find('x', 1);
    expect(procs).toHaveLength(1);
    w.close();
    expect(procs[0]!.stdin.ended).toBe(true);
    await expect(third).rejects.toThrow('EPH window helper: closed');
  });

  it('video fix: topmost puts a window above every non-topmost one; above lists the visible windows over a region', async () => {
    const p = new FakeProc();
    const w = new WindowHelper(() => p);
    const top = w.topmost(77);
    const over = w.above({ x: 0, y: 0, width: 1624, height: 600 }, [77, 88]);
    expect(p.stdin.written).toEqual(['topmost 77\n', 'above 0 0 1624 600 77,88\n']);
    p.reply('ok True');
    const t1 = Buffer.from('Windows PowerShell', 'utf8').toString('base64');
    const t2 = Buffer.from('Notes', 'utf8').toString('base64');
    p.reply(`above 2 ${t1} ${t2}`);
    await expect(top).resolves.toBeUndefined();
    await expect(over).resolves.toEqual(['Windows PowerShell', 'Notes']);
    const none = w.above({ x: 0, y: 0, width: 1, height: 1 }, [77]);
    p.reply('above 0');
    await expect(none).resolves.toEqual([]);
  });

  it('video fix: the script sets HWND_TOPMOST, skips minimised and cloaked windows, and finds by title in any process (pid 0)', () => {
    const s = windowScript();
    expect(s).toContain('SetWindowPos([IntPtr][long]$p[1], [IntPtr](-1), 0, 0, 0, 0, 0x0043)');
    expect(s).toContain('IsIconic');
    expect(s).toContain('DwmGetWindowAttribute');
    expect(s).toContain('(pid != 0 && p != pid)');
  });

  it('a failing child rejects the call in flight and every later call, never throwing out of a listener', async () => {
    const p = new FakeProc();
    const w = new WindowHelper(() => p);
    const found = w.find('t', 1);
    expect(() => p.stdin.emit('error', new Error('write EPIPE'))).not.toThrow();
    await expect(found).rejects.toThrow(/EPIPE/);
    await expect(w.place(1, { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow(/EPIPE/);
    const q = new FakeProc();
    const w2 = new WindowHelper(() => q);
    const f2 = w2.find('t', 1);
    q.reply('err find 1');
    await expect(f2).rejects.toThrow(/err find 1/);
  });
});

describe('pollWindow: the search, pcsx2_ctl cmd_launch (120 s, a poll a second), never blocking', () => {
  it('keeps the pcsx2_ctl.py:154-156 bounds', () => {
    expect([FIND_WINDOW_TIMEOUT_MS, FIND_WINDOW_POLL_MS]).toEqual([120_000, 1000]);
  });

  it('polls the asynchronous find until a handle comes back', async () => {
    let calls = 0;
    const slept: number[] = [];
    const h = await pollWindow({ find: async () => (++calls < 3 ? 0 : 99) }, 't', 1, new AbortController().signal, {
      sleep: async (ms) => { slept.push(ms); }, now: () => 0,
    });
    expect([h, calls, slept]).toEqual([99, 3, [1000, 1000]]);
  });

  it('the abort ends the search between polls, with the abort error', async () => {
    const ctl = new AbortController();
    let calls = 0;
    const run = pollWindow({ find: async () => { calls++; return 0; } }, 't', 1, ctl.signal, {
      sleep: async (_ms, signal) => { await tick(); if (calls === 2) ctl.abort(new RunAborted('interrupted (Ctrl+C)')); if (signal?.aborted) throw signal.reason as Error; }, now: () => 0,
    });
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(calls).toBe(2);
  });

  it('the abort ends a find that never answers', async () => {
    const ctl = new AbortController();
    const run = pollWindow({ find: () => new Promise<number>(() => undefined) }, 't', 1, ctl.signal);
    await tick();
    ctl.abort(new RunAborted('interrupted (Ctrl+C)'));
    await expect(run).rejects.toBeInstanceOf(RunAborted);
  });

  it('fails with a clear line at the bound', async () => {
    let wall = 0;
    await expect(pollWindow({ find: async () => 0 }, 'SOCOM', 7, new AbortController().signal, {
      sleep: async (ms) => { wall += ms; }, now: () => wall,
    })).rejects.toThrow('EPH run: no "SOCOM" window for pid 7 after 120 s');
  });
});
