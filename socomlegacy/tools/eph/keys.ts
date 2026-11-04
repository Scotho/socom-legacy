import { Buffer } from 'node:buffer';
import { spawn as nodeSpawn } from 'node:child_process';
import { LineChild, spawnProc, type ProcSpawn } from './psChild';
import type { Input } from './script';

/**
 * The PCSX2 key path of the emulator parity harness (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md).
 * Product track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game.
 *
 * Ported from the desktop recompilation, read only, never run from here:
 * - desktop@be5578311:tools_py/parity/keys.py:18-34 -- WM_KEYDOWN/WM_KEYUP, the arrows, MAPS["pcsx2"];
 * - desktop@be5578311:tools_py/parity/keys.py:43 -- WINDOW_TITLES["pcsx2"];
 * - desktop@be5578311:tools_py/parity/keys.py:58-69 -- press(): scan = MapVirtualKeyW(vk, 0), the extended bit for the
 *   arrows, lParam (scan << 16) | ext | 1 down and (scan << 16) | ext | 0xC0000001 up, posted to the main window and
 *   every child window (child_windows, keys.py:46-55);
 * - desktop@be5578311:tools_py/parity/pcsx2_ctl.py:44-48 -- the stick halves (W S A D, T G F H) and L3/R3 (2, 4).
 *
 * The live part is a long-lived `powershell -NoProfile` child that reads `down <hwnd> <vk>` / `up <hwnd> <vk>` lines on
 * its stdin and posts the key with the same lParam (its C# mirrors keyLParam below). It is Windows-only (the design
 * note's option (b)); a Linux box uses XdotoolInjector below, behind the same KeyInjector interface (createKeyInjector).
 */

export const WM_KEYDOWN = 0x0100;
export const WM_KEYUP = 0x0101;

/** keys.py _ARROWS: the arrows are the extended keys. */
export const ARROW_VK = { up: 0x26, down: 0x28, left: 0x25, right: 0x27 } as const;

/** keys.py MAPS["pcsx2"] (the digital buttons) with pcsx2_ctl.py's stick halves and L3/R3, by script input name. */
export const PCSX2_VK: Readonly<Record<Input, number>> = {
  ...ARROW_VK,
  cross: 0x4b, circle: 0x4c, square: 0x4a, triangle: 0x49,
  start: 0x0d, select: 0x08, l1: 0x51, r1: 0x45, l2: 0x31, r2: 0x33, l3: 0x32, r3: 0x34,
  lup: 0x57, ldown: 0x53, lleft: 0x41, lright: 0x44, rup: 0x54, rdown: 0x47, rleft: 0x46, rright: 0x48,
};

/** keys.py WINDOW_TITLES["pcsx2"]: the PCSX2 game window's title. */
export const PCSX2_WINDOW_TITLE = 'SOCOM II - U.S. Navy SEALs';

export function isExtendedKey(vk: number): boolean {
  return (Object.values(ARROW_VK) as number[]).includes(vk);
}

/** keys.py press(): the WM_KEYDOWN / WM_KEYUP lParam for `vk` with scan code `scan`, as an unsigned 32-bit number. */
export function keyLParam(vk: number, scan: number, down: boolean): number {
  const ext = isExtendedKey(vk) ? 1 << 24 : 0;
  return ((scan << 16) | ext | (down ? 1 : 0xc0000001)) >>> 0;
}

/** The injector's input: one line per key event. */
export function injectorLine(action: 'down' | 'up', hwnd: number, vk: number): string {
  if (!Number.isSafeInteger(hwnd) || hwnd <= 0) throw new Error(`EPH key path: bad window handle ${hwnd}`);
  if (!Number.isInteger(vk) || vk < 1 || vk > 0xfe) throw new Error(`EPH key path: bad virtual key ${vk}`);
  return `${action} ${hwnd} ${vk}\n`;
}

/** The PowerShell the child runs: keys.py press() in C#, one key event per stdin line, an `ok`/`err` line back. */
export function injectorScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Runtime.InteropServices;',
    'public static class EphKeys {',
    '  [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);',
    '  [DllImport("user32.dll")] static extern uint MapVirtualKeyW(uint code, uint type);',
    '  public delegate bool EnumProc(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);',
    '  public static int Post(long hwnd, bool down, uint vk) {',
    '    uint scan = MapVirtualKeyW(vk, 0);',
    '    uint ext = (vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28) ? (1u << 24) : 0u;',
    '    uint lp = (scan << 16) | ext | (down ? 1u : 0xC0000001u);',
    '    IntPtr main = new IntPtr(hwnd);',
    '    List<IntPtr> all = new List<IntPtr>();',
    '    all.Add(main);',
    '    EnumChildWindows(main, delegate (IntPtr h, IntPtr l) { all.Add(h); return true; }, IntPtr.Zero);',
    '    foreach (IntPtr h in all) PostMessageW(h, down ? 0x0100u : 0x0101u, new IntPtr(vk), new IntPtr((long)lp));',
    '    return all.Count;',
    '  }',
    '}',
    '"@',
    'while ($null -ne ($line = [Console]::In.ReadLine())) {',
    "  $p = $line.Trim().Split(' ')",
    "  if ($p.Length -eq 3 -and ($p[0] -eq 'down' -or $p[0] -eq 'up')) {",
    "    $n = [EphKeys]::Post([long]$p[1], $p[0] -eq 'down', [uint32]$p[2])",
    '    [Console]::Out.WriteLine("ok $($p[0]) $($p[2]) $n")',
    '  } else {',
    '    [Console]::Out.WriteLine("err $line")',
    '  }',
    '  [Console]::Out.Flush()',
    '}',
  ].join('\n');
}

/** The child's arguments: the script as -EncodedCommand (UTF-16LE base64), so stdin stays free for the key lines. */
export function injectorArgs(): string[] {
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(injectorScript(), 'utf16le').toString('base64')];
}

/** One client's key path; the PostMessage one below, an xdotool one on a Linux box. */
export interface KeyInjector {
  down(vk: number): void;
  up(vk: number): void;
  /**
   * One moment's key actions as one change (review F3): the PostMessage path posts them back to back; xdotool chains them
   * in one invocation. Resolves once they are sent (xdotool: once it exits), so the firing is stamped after.
   */
  batch(actions: readonly KeyStroke[]): Promise<void>;
  close(): void;
}

/** One key action of a batch. */
export interface KeyStroke {
  readonly action: 'down' | 'up';
  readonly vk: number;
}

/** The child's stdin, as much of it as the injector uses. */
export interface InjectorChild {
  write(s: string): void;
  end(): void;
}

export interface PostMessageInjectorOptions {
  /** Starts a bare child (its stdin only, a fake in the tests); when given, `spawnProcess` and `onFail` are not used. */
  readonly spawn?: (cmd: string, args: readonly string[]) => InjectorChild;
  /** Starts the PowerShell process, every stream listened to (./psChild LineChild); default the host's spawn. */
  readonly spawnProcess?: ProcSpawn;
  readonly onOutput?: (line: string) => void;
  /**
   * The child failing -- a spawn error, an EPIPE on its stdin, a stream error, an exit before close() -- reported once.
   * The run aborts on it (./run RunStopped); without a listener these were uncaught exceptions that skipped the run's
   * `finally` (fold round 2, finding C).
   */
  readonly onFail?: (err: Error) => void;
}

/** keys.py press() split into its down and its up, posted by a long-lived PowerShell child to window `hwnd`. */
export class PostMessageInjector implements KeyInjector {
  private child: InjectorChild | null;

  constructor(readonly hwnd: number, opts: PostMessageInjectorOptions = {}) {
    const start = opts.spawn ?? ((cmd: string, args: readonly string[]): InjectorChild => {
      const out = opts.onOutput ?? (() => undefined);
      const c = new LineChild((opts.spawnProcess ?? spawnProc)(cmd, args), 'the key injector (PowerShell)', {
        onLine: out,
        onStderr: (l) => out(`stderr ${l}`),
        onFail: opts.onFail ?? (() => undefined),
      });
      return { write: (s) => { c.write(s); }, end: () => { c.close(); } };
    });
    this.child = start('powershell', injectorArgs());
  }

  down(vk: number): void { this.send('down', vk); }
  up(vk: number): void { this.send('up', vk); }

  async batch(actions: readonly KeyStroke[]): Promise<void> {
    for (const a of actions) this.send(a.action, a.vk);
  }

  close(): void {
    this.child?.end();
    this.child = null;
  }

  private send(action: 'down' | 'up', vk: number): void {
    if (!this.child) throw new Error('EPH key path: the injector is closed');
    this.child.write(injectorLine(action, this.hwnd, vk));
  }
}

/**
 * The X keysym of a harness virtual key, for xdotool (PCSX2's Qt build reads the same key a `Keyboard/<name>` bind
 * names, ./padIni pcsx2KeyName): A-Z as lower-case letters, 0-9, Return, BackSpace and the four arrows -- every key of
 * PCSX2_VK and of the prepared pressure macros (./padIni PREPARED), which are plain keys bound to [Pad1] Macro<N>.
 */
export function xdotoolKeysym(vk: number): string {
  const named: Record<number, string> = { 0x0d: 'Return', 0x08: 'BackSpace', 0x26: 'Up', 0x28: 'Down', 0x25: 'Left', 0x27: 'Right' };
  if (named[vk]) return named[vk]!;
  if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk);
  if (vk >= 0x41 && vk <= 0x5a) return String.fromCharCode(vk + 0x20);
  throw new Error(`EPH key path: no X keysym for virtual key ${vk}`);
}

/**
 * xdotool's argv for one key event: `keydown|keyup --window <wid> <keysym>` (an XSendEvent to that window), or with a
 * null window `keydown|keyup <keysym>` (XTEST, to the focused window: the fallback should PCSX2's Qt window ignore sent
 * events).
 */
export function xdotoolArgs(action: 'down' | 'up', window: number | null, vk: number): string[] {
  const sym = xdotoolKeysym(vk);
  const cmd = action === 'down' ? 'keydown' : 'keyup';
  if (window === null) return [cmd, sym];
  if (!Number.isSafeInteger(window) || window <= 0) throw new Error(`EPH key path: bad X window id ${window}`);
  return [cmd, '--window', String(window), sym];
}

/** Runs one command to its exit; rejects on a spawn error or a non-zero exit. */
export type CommandRun = (cmd: string, args: readonly string[], env: Readonly<Record<string, string | undefined>>) => Promise<void>;

/** The host's runner: no shell, stdio ignored but stderr, which the failure quotes. */
export const runCommand: CommandRun = (cmd, args, env) => new Promise<void>((resolve, reject) => {
  const p = nodeSpawn(cmd, [...args], { env: Object.assign({}, env), stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr?.setEncoding('utf8');
  p.stderr?.on('data', (d: string) => { err += d; });
  p.on('error', reject);
  p.on('exit', (code, sig) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code ?? sig}${err.trim() ? `: ${err.trim()}` : ''}`))));
});

export interface XdotoolInjectorOptions {
  /** The X display; default the env's DISPLAY (the seat box: Xvfb :99). */
  readonly display?: string;
  /** The environment xdotool runs in; default process.env. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Runs xdotool (a fake in the tests); default runCommand. */
  readonly run?: CommandRun;
  /** The first failure, once; the run aborts on it as on the PowerShell injector's. */
  readonly onFail?: (err: Error) => void;
  /**
   * Send to the focused window by XTEST (no `--window`), the window id kept for the record only: the fallback should
   * PCSX2's Qt window ignore XSendEvent's synthetic events (review F3).
   */
  readonly xtest?: boolean;
}

/**
 * The Linux key path: each key event one `xdotool keydown|keyup --window <wid> <keysym>`, run one at a time in the
 * order sent (a down and its up never race), on DISPLAY. Same KeyInjector as the PostMessage one; the pressure macros
 * are keys like any other. A window of null sends to the focused window (XTEST) instead.
 */
export class XdotoolInjector implements KeyInjector {
  private queue: Promise<void> = Promise.resolve();
  private failed: Error | null = null;
  private closed = false;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly run: CommandRun;

  constructor(readonly window: number | null, private readonly opts: XdotoolInjectorOptions = {}) {
    const base = opts.env ?? process.env;
    this.env = { ...base, DISPLAY: opts.display ?? base.DISPLAY };
    this.run = opts.run ?? runCommand;
  }

  down(vk: number): void { this.send('down', vk); }
  up(vk: number): void { this.send('up', vk); }

  /** One xdotool invocation for the moment: each action's argv chained (xdotool runs a command chain in order). */
  batch(actions: readonly KeyStroke[]): Promise<void> {
    if (actions.length === 0) return this.queue;
    return this.enqueue(actions.flatMap((a) => xdotoolArgs(a.action, this.target(), a.vk)));
  }

  close(): void { this.closed = true; }

  /** Resolves once every event sent so far has run (or the injector failed). */
  flush(): Promise<void> { return this.queue; }

  private target(): number | null { return this.opts.xtest ? null : this.window; }

  private send(action: 'down' | 'up', vk: number): void {
    void this.enqueue(xdotoolArgs(action, this.target(), vk));
  }

  private enqueue(args: readonly string[]): Promise<void> {
    if (this.failed) throw this.failed;
    if (this.closed) throw new Error('EPH key path: the injector is closed');
    return this.queue = this.queue.then(async () => {
      if (this.failed) return;
      try {
        await this.run('xdotool', args, this.env);
      } catch (err) {
        this.failed = new Error(`the key injector (xdotool): ${(err as Error).message}`);
        this.opts.onFail?.(this.failed);
      }
    });
  }
}

export interface CreateKeyInjectorOptions extends Omit<PostMessageInjectorOptions, 'onFail'>, Omit<XdotoolInjectorOptions, 'onFail'> {
  /** The target window: a Win32 HWND, or an X window id (null: the focused X window). */
  readonly window: number | null;
  /** Which path; default PostMessage on Windows and xdotool elsewhere. */
  readonly kind?: 'postmessage' | 'xdotool';
  readonly platform?: NodeJS.Platform;
  readonly onFail?: (err: Error) => void;
}

/** The key path for the host: PostMessage (PowerShell) on Windows, xdotool elsewhere, or the kind asked for. */
export function createKeyInjector(o: CreateKeyInjectorOptions): KeyInjector {
  const kind = o.kind ?? ((o.platform ?? process.platform) === 'win32' ? 'postmessage' : 'xdotool');
  if (kind === 'xdotool') return new XdotoolInjector(o.window, { display: o.display, env: o.env, run: o.run, onFail: o.onFail, xtest: o.xtest });
  if (o.window === null) throw new Error('EPH key path: PostMessage needs a window handle');
  return new PostMessageInjector(o.window, { spawn: o.spawn, spawnProcess: o.spawnProcess, onOutput: o.onOutput, onFail: o.onFail });
}
