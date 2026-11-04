import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  PCSX2_VK, PCSX2_WINDOW_TITLE, PostMessageInjector, WM_KEYDOWN, WM_KEYUP, injectorArgs, injectorLine,
  XdotoolInjector, createKeyInjector, injectorScript, isExtendedKey, keyLParam, xdotoolArgs, xdotoolKeysym,
} from '../eph/keys';

/**
 * The PCSX2 key path (EPH-2), ported from desktop@be5578311:tools_py/parity/keys.py (MAPS["pcsx2"], press()) and
 * pcsx2_ctl.py's stick and L3/R3 keys. No PowerShell is spawned here: the injector is given a fake child.
 */
describe('the PCSX2 key map', () => {
  it('carries keys.py MAPS["pcsx2"] for every script input', () => {
    expect(PCSX2_VK).toEqual({
      up: 0x26, down: 0x28, left: 0x25, right: 0x27,
      cross: 0x4b, circle: 0x4c, square: 0x4a, triangle: 0x49,
      start: 0x0d, select: 0x08, l1: 0x51, r1: 0x45, l2: 0x31, r2: 0x33, l3: 0x32, r3: 0x34,
      lup: 0x57, ldown: 0x53, lleft: 0x41, lright: 0x44, rup: 0x54, rdown: 0x47, rleft: 0x46, rright: 0x48,
    });
    expect(PCSX2_WINDOW_TITLE).toBe('SOCOM II - U.S. Navy SEALs');
    expect([WM_KEYDOWN, WM_KEYUP]).toEqual([0x100, 0x101]);
  });
});

describe('the WM_KEYDOWN and WM_KEYUP lParam', () => {
  it('is (scan << 16) | 1 down and (scan << 16) | 0xC0000001 up, as keys.py press()', () => {
    expect(keyLParam(0x49, 0x17, true)).toBe(0x00170001);
    expect(keyLParam(0x49, 0x17, false)).toBe(0xc0170001);
  });

  it('sets the extended bit (1 << 24) for the arrows only', () => {
    expect([0x25, 0x26, 0x27, 0x28].every(isExtendedKey)).toBe(true);
    expect(isExtendedKey(0x49)).toBe(false);
    expect(keyLParam(0x26, 0x48, true)).toBe(0x01480001);
    expect(keyLParam(0x26, 0x48, false)).toBe(0xc1480001);
  });
});

describe('the PowerShell injector', () => {
  it('sends one line per key, down or up, to the window handle', () => {
    expect(injectorLine('down', 0x1a2b, 0x49)).toBe('down 6699 73\n');
    expect(injectorLine('up', 0x1a2b, 0x49)).toBe('up 6699 73\n');
    expect(() => injectorLine('down', 0, 0x49)).toThrow(/window handle/);
    expect(() => injectorLine('down', 1, 0x1ff)).toThrow(/virtual key/);
  });

  it('runs the script as an encoded command of powershell -NoProfile, mirroring keys.py in C#', () => {
    const args = injectorArgs();
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(Buffer.from(args[3]!, 'base64').toString('utf16le')).toBe(injectorScript());
    const s = injectorScript();
    expect(s).toContain('Add-Type');
    expect(s).toContain('PostMessageW');
    expect(s).toContain('MapVirtualKeyW(vk, 0)');
    expect(s).toContain('EnumChildWindows');
    expect(s).toContain('0xC0000001u');
    expect(s).toContain('1u << 24');
    expect(s).toContain('[Console]::In.ReadLine()');
  });

  it('writes the lines to the child stdin and closes it', () => {
    const written: string[] = [];
    let ended = false;
    let spawned: { cmd: string; args: readonly string[] } | undefined;
    const inj = new PostMessageInjector(0x1a2b, {
      spawn: (cmd, args) => {
        spawned = { cmd, args };
        return { write: (s: string) => { written.push(s); }, end: () => { ended = true; } };
      },
    });
    inj.down(0x49);
    inj.up(0x49);
    inj.close();
    expect(spawned?.cmd).toBe('powershell');
    expect(spawned?.args).toEqual(injectorArgs());
    expect(written).toEqual(['down 6699 73\n', 'up 6699 73\n']);
    expect(ended).toBe(true);
    expect(() => inj.down(0x49)).toThrow(/closed/);
  });

  it('listens to the PowerShell child: a spawn error, a stdin EPIPE or an exit mid-run reports one failure, never an uncaught throw', () => {
    for (const fail of [
      (p: FakeProc) => p.emit('error', new Error('spawn powershell ENOENT')),
      (p: FakeProc) => p.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })),
      (p: FakeProc) => p.emit('exit', 1, null),
    ]) {
      const p = new FakeProc();
      const fails: string[] = [];
      const out: string[] = [];
      const inj = new PostMessageInjector(0x1a2b, {
        spawnProcess: (cmd, args) => { expect([cmd, args]).toEqual(['powershell', injectorArgs()]); return p; },
        onFail: (err) => { fails.push(err.message); },
        onOutput: (l) => { out.push(l); },
      });
      inj.down(0x49);
      expect(p.stdin.written).toEqual(['down 6699 73\n']);
      p.stdout.emit('data', 'ok down 73 2\r\n');
      p.stderr.emit('data', 'warn\r\n');
      expect(out).toEqual(['ok down 73 2', 'stderr warn']);
      expect(() => fail(p)).not.toThrow();
      p.emit('exit', 1, null);
      expect(fails).toHaveLength(1);
      expect(fails[0]).toMatch(/^the key injector/);
      expect(() => inj.up(0x49)).toThrow(/the key injector/);
      expect(() => inj.close()).not.toThrow();
    }
  });

  it('an exit after close is not a failure', () => {
    const p = new FakeProc();
    const fails: Error[] = [];
    const inj = new PostMessageInjector(1, { spawnProcess: () => p, onFail: (err) => { fails.push(err); } });
    inj.close();
    expect(p.stdin.ended).toBe(true);
    p.emit('exit', 0, null);
    expect(fails).toEqual([]);
  });
});

class FakeStream extends EventEmitter {
  readonly written: string[] = [];
  ended = false;
  setEncoding(): this { return this; }
  write(s: string): boolean { this.written.push(s); return true; }
  end(): void { this.ended = true; }
}

class FakeProc extends EventEmitter {
  readonly stdin = new FakeStream();
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
}

/**
 * The Linux key path (the HD texture-dump job on the AWS seat box, Xvfb :99, PCSX2 v2.8.2 AppImage; agent-mail/
 * evidence/hd-gsdump-plan/RECIPE.md section 4): `xdotool keydown|keyup --window <wid> <keysym>` behind the same
 * KeyInjector, DISPLAY honoured, the events run one at a time in order. No xdotool here: the runner is a fake.
 */
describe('the xdotool injector (Linux)', () => {
  const fakeRun = (fail?: (args: readonly string[]) => Error | null) => {
    const calls: { cmd: string; args: readonly string[]; display: string | undefined }[] = [];
    let open = 0, most = 0;
    const run = async (cmd: string, args: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<void> => {
      open++; most = Math.max(most, open);
      calls.push({ cmd, args, display: env.DISPLAY });
      await new Promise((r) => setTimeout(r, 1));
      open--;
      const err = fail?.(args) ?? null;
      if (err) throw err;
    };
    return { calls, run, most: () => most };
  };

  it('names every harness key as an X keysym: letters lower case, digits, Return, BackSpace, the arrows', () => {
    expect(xdotoolKeysym(PCSX2_VK.cross)).toBe('k');
    expect(xdotoolKeysym(PCSX2_VK.lup)).toBe('w');
    expect(xdotoolKeysym(PCSX2_VK.l2)).toBe('1');
    expect(xdotoolKeysym(PCSX2_VK.start)).toBe('Return');
    expect(xdotoolKeysym(PCSX2_VK.select)).toBe('BackSpace');
    expect([PCSX2_VK.up, PCSX2_VK.down, PCSX2_VK.left, PCSX2_VK.right].map(xdotoolKeysym)).toEqual(['Up', 'Down', 'Left', 'Right']);
    // The prepared pressure macros (./padIni PREPARED: Keyboard/7, 8, 9, 0, 5, 6, U, O, P) map the same way.
    expect([0x37, 0x38, 0x39, 0x30, 0x35, 0x36, 0x55, 0x4f, 0x50].map(xdotoolKeysym)).toEqual(['7', '8', '9', '0', '5', '6', 'u', 'o', 'p']);
    for (const vk of Object.values(PCSX2_VK)) expect(() => xdotoolKeysym(vk)).not.toThrow();
    expect(() => xdotoolKeysym(0x70)).toThrow(/no X keysym for virtual key 112/);
  });

  it('builds keydown / keyup --window <wid> <keysym>; without the window flag, the focused window', () => {
    expect(xdotoolArgs('down', 4194307, PCSX2_VK.triangle)).toEqual(['keydown', '--window', '4194307', 'i']);
    expect(xdotoolArgs('up', 4194307, PCSX2_VK.triangle)).toEqual(['keyup', '--window', '4194307', 'i']);
    expect(xdotoolArgs('down', null, PCSX2_VK.lleft)).toEqual(['keydown', 'a']);
    expect(() => xdotoolArgs('down', 0, 0x41)).toThrow(/bad X window id 0/);
  });

  it('runs xdotool on DISPLAY (the option, else the env), one event at a time, in order', async () => {
    const f = fakeRun();
    const inj = new XdotoolInjector(4194307, { run: f.run, env: { DISPLAY: ':99' } });
    inj.down(PCSX2_VK.lup);
    inj.down(PCSX2_VK.cross);
    inj.up(PCSX2_VK.lup);
    await inj.flush();
    expect(f.calls.map((c) => [c.cmd, c.args.join(' '), c.display])).toEqual([
      ['xdotool', 'keydown --window 4194307 w', ':99'],
      ['xdotool', 'keydown --window 4194307 k', ':99'],
      ['xdotool', 'keyup --window 4194307 w', ':99'],
    ]);
    expect(f.most()).toBe(1);
    const g = fakeRun();
    const two = new XdotoolInjector(5, { run: g.run, env: { DISPLAY: ':0' }, display: ':99' });
    two.down(PCSX2_VK.square);
    await two.flush();
    expect(g.calls[0]!.display).toBe(':99');
  });

  it('a failed xdotool is reported once through onFail, and later sends throw; close ends it', async () => {
    const f = fakeRun((args) => (args[0] === 'keyup' ? new Error('xdotool exited 1: Can\'t open display') : null));
    const fails: string[] = [];
    const inj = new XdotoolInjector(5, { run: f.run, env: { DISPLAY: ':99' }, onFail: (e) => fails.push(e.message) });
    inj.down(PCSX2_VK.cross);
    inj.up(PCSX2_VK.cross);
    inj.up(PCSX2_VK.square);
    await inj.flush();
    expect(fails).toEqual(["the key injector (xdotool): xdotool exited 1: Can't open display"]);
    expect(() => inj.down(PCSX2_VK.cross)).toThrow(/xdotool/);
    const ok = new XdotoolInjector(5, { run: fakeRun().run, env: {} });
    ok.close();
    expect(() => ok.down(PCSX2_VK.cross)).toThrow(/the injector is closed/);
  });

  it('review F3: batch sends one moment as ONE xdotool call, the ups then the downs chained, and resolves when it exits', async () => {
    const f = fakeRun();
    const inj = new XdotoolInjector(4194307, { run: f.run, env: { DISPLAY: ':99' } });
    await inj.batch([{ action: 'up', vk: PCSX2_VK.lleft }, { action: 'down', vk: PCSX2_VK.lright }]);
    expect(f.calls.map((c) => c.args.join(' '))).toEqual(['keyup --window 4194307 a keydown --window 4194307 d']);
    await inj.batch([]);
    expect(f.calls).toHaveLength(1);
  });

  it('review F3: the xtest option sends to the focused window (no --window) though a window id is known', async () => {
    const f = fakeRun();
    const inj = new XdotoolInjector(4194307, { run: f.run, env: { DISPLAY: ':99' }, xtest: true });
    inj.down(PCSX2_VK.cross);
    await inj.flush();
    expect(f.calls[0]!.args).toEqual(['keydown', 'k']);
  });

  it('review F3: the PostMessage injector batches as its downs and ups in order, at once', async () => {
    const lines: string[] = [];
    const inj = new PostMessageInjector(77, { spawn: () => ({ write: (s) => { lines.push(s); }, end: () => undefined }) });
    await inj.batch([{ action: 'up', vk: PCSX2_VK.lleft }, { action: 'down', vk: PCSX2_VK.lright }]);
    expect(lines).toEqual([`up 77 ${PCSX2_VK.lleft}\n`, `down 77 ${PCSX2_VK.lright}\n`]);
  });

  it('createKeyInjector picks PostMessage on Windows and xdotool elsewhere, or the kind asked for', () => {
    const spawn = () => ({ write: () => undefined, end: () => undefined });
    expect(createKeyInjector({ platform: 'win32', window: 5, spawn })).toBeInstanceOf(PostMessageInjector);
    expect(createKeyInjector({ platform: 'linux', window: 5, run: fakeRun().run })).toBeInstanceOf(XdotoolInjector);
    expect(createKeyInjector({ platform: 'win32', kind: 'xdotool', window: 5, run: fakeRun().run })).toBeInstanceOf(XdotoolInjector);
  });
});
