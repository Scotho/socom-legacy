import { Buffer } from 'node:buffer';
import { abortError, raceAbort, sleep as abortableSleep } from './abort';
import { LineChild, spawnProc, type ProcSpawn } from './psChild';

/**
 * The PCSX2 window helpers of the emulator parity harness (EPH-2 fold round 2, finding A). Product track (OT.R53): a
 * validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * Ported, read only: desktop@be5578311:tools_py/parity/pcsx2_ctl.py:146-166 -- cmd_launch finds the window by its title
 * and pid (winshot.find_window), polling once a second for up to 120 s (:154-156), then places it.
 *
 * One long-lived PowerShell child (./psChild LineChild) compiles its type once and answers each `find` and `place`
 * line, so every call is a promise and no poll blocks the event loop. (The earlier execFileSync PowerShell with Add-Type
 * on every poll held the loop for about a second each time; a Ctrl+C then went unanswered, and a launcher that relays
 * the signal -- tsx's CLI -- killed the run past its `finally`, leaving PCSX2 running.)
 */

/** pcsx2_ctl.py:154: the window search's bound, 120 s. */
export const FIND_WINDOW_TIMEOUT_MS = 120_000;
/** pcsx2_ctl.py:156: a poll a second. */
export const FIND_WINDOW_POLL_MS = 1000;

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** The window calls, asynchronous. */
export interface WindowCalls {
  /** The visible window of `pid` whose title contains `title`, or 0. */
  find(title: string, pid: number): Promise<number>;
  /** SetWindowPos to `r`, SWP_SHOWWINDOW. */
  place(hwnd: number, r: Rect): Promise<void>;
  /** SetWindowPos HWND_TOPMOST, not moved or sized: above every window that is not topmost (the video fix). */
  topmost(hwnd: number): Promise<void>;
  /**
   * The titles of the visible windows over `r` that sit above any of `ours` in the z order (minimised and cloaked
   * windows skipped; ours never listed): what would cover the capture (the video fix, run #111 on).
   */
  above(r: Rect, ours: readonly number[]): Promise<string[]>;
  close(): void;
}

/** The helper's PowerShell: the type compiled once, then `find <pid> <title base64>` and `place <hwnd> x y w h` lines. */
export function windowScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;',
    'public static class EphWin {',
    '  public delegate bool EnumProc(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);',
    '  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);',
    '  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);',
    '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }',
    '  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);',
    '  public static string Above(int x, int y, int w, int hh, long[] ours) {',
    '    List<string> hits = new List<string>(); int left = ours.Length;',
    '    EnumWindows(delegate (IntPtr h, IntPtr l) {',
    '      if (Array.IndexOf(ours, h.ToInt64()) >= 0) { left--; return left > 0; }',
    '      if (!IsWindowVisible(h) || IsIconic(h)) return true;',
    '      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4); if (cloaked != 0) return true;',
    '      RECT r; if (!GetWindowRect(h, out r) || r.R <= x || r.L >= x + w || r.B <= y || r.T >= y + hh) return true;',
    '      StringBuilder sb = new StringBuilder(512); GetWindowTextW(h, sb, 512);',
    '      hits.Add(Convert.ToBase64String(Encoding.UTF8.GetBytes(sb.Length > 0 ? sb.ToString() : "(untitled)"))); return true; }, IntPtr.Zero);',
    '    return "above " + hits.Count + (hits.Count > 0 ? " " + String.Join(" ", hits.ToArray()) : "");',
    '  }',
    '  public static long Find(string title, uint pid) {',
    '    long found = 0;',
    '    EnumWindows(delegate (IntPtr h, IntPtr l) { uint p; GetWindowThreadProcessId(h, out p);',
    '      if ((pid != 0 && p != pid) || !IsWindowVisible(h)) return true;',
    '      StringBuilder sb = new StringBuilder(512); GetWindowTextW(h, sb, 512);',
    '      if (sb.ToString().Contains(title)) { found = h.ToInt64(); return false; } return true; }, IntPtr.Zero);',
    '    return found;',
    '  }',
    '}',
    '"@',
    'while ($null -ne ($line = [Console]::In.ReadLine())) {',
    "  $p = $line.Trim().Split(' ')",
    "  if ($p.Length -eq 3 -and $p[0] -eq 'find') {",
    '    $t = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[2]))',
    '    [Console]::Out.WriteLine("hwnd $([EphWin]::Find($t, [uint32]$p[1]))")',
    "  } elseif ($p.Length -eq 6 -and $p[0] -eq 'place') {",
    '    $ok = [EphWin]::SetWindowPos([IntPtr][long]$p[1], [IntPtr]::Zero, [int]$p[2], [int]$p[3], [int]$p[4], [int]$p[5], 0x0040)',
    '    [Console]::Out.WriteLine("ok $ok")',
    "  } elseif ($p.Length -eq 2 -and $p[0] -eq 'topmost') {",
    '    $ok = [EphWin]::SetWindowPos([IntPtr][long]$p[1], [IntPtr](-1), 0, 0, 0, 0, 0x0043)',
    '    [Console]::Out.WriteLine("ok $ok")',
    "  } elseif ($p.Length -eq 6 -and $p[0] -eq 'above') {",
    "    $ours = [long[]]($p[5].Split(','))",
    '    [Console]::Out.WriteLine([EphWin]::Above([int]$p[1], [int]$p[2], [int]$p[3], [int]$p[4], $ours))',
    '  } else {',
    '    [Console]::Out.WriteLine("err $line")',
    '  }',
    '  [Console]::Out.Flush()',
    '}',
  ].join('\n');
}

/** The helper's arguments: the script as -EncodedCommand (UTF-16LE base64), stdin free for the requests. */
export function windowArgs(): string[] {
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowScript(), 'utf16le').toString('base64')];
}

interface Pending {
  readonly done: (reply: string) => void;
  readonly fail: (err: Error) => void;
}

/** The host's WindowCalls: one PowerShell child, spawned at the first call, its replies matched to the calls in order. */
export class WindowHelper implements WindowCalls {
  private child: LineChild | null = null;
  private readonly queue: Pending[] = [];
  private failed: Error | null = null;

  constructor(private readonly spawn: ProcSpawn = spawnProc) {}

  find(title: string, pid: number): Promise<number> {
    const t64 = Buffer.from(title, 'utf8').toString('base64');
    return this.call(`find ${pid} ${t64}\n`, (reply) => {
      const m = /^hwnd (\d+)$/.exec(reply);
      if (!m) throw new Error(`EPH window helper: unexpected reply "${reply}"`);
      return Number(m[1]);
    });
  }

  place(hwnd: number, r: Rect): Promise<void> {
    return this.call(`place ${hwnd} ${r.x} ${r.y} ${r.width} ${r.height}\n`, (reply) => {
      if (!reply.startsWith('ok ')) throw new Error(`EPH window helper: unexpected reply "${reply}"`);
    });
  }

  topmost(hwnd: number): Promise<void> {
    return this.call(`topmost ${hwnd}\n`, (reply) => {
      if (!reply.startsWith('ok ')) throw new Error(`EPH window helper: unexpected reply "${reply}"`);
    });
  }

  above(r: Rect, ours: readonly number[]): Promise<string[]> {
    return this.call(`above ${r.x} ${r.y} ${r.width} ${r.height} ${ours.join(',')}\n`, (reply) => {
      const m = /^above (\d+)((?: \S+)*)$/.exec(reply);
      if (!m) throw new Error(`EPH window helper: unexpected reply "${reply}"`);
      const titles = m[2]!.trim() ? m[2]!.trim().split(' ').map((b) => Buffer.from(b, 'base64').toString('utf8')) : [];
      if (titles.length !== Number(m[1])) throw new Error(`EPH window helper: unexpected reply "${reply}"`);
      return titles;
    });
  }

  close(): void {
    this.child?.close();
    this.reject(new Error('EPH window helper: closed'));
  }

  private call<T>(line: string, parse: (reply: string) => T): Promise<T> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise<T>((resolve, reject) => {
      const done = (reply: string): void => {
        if (reply.startsWith('err ')) { reject(new Error(`EPH window helper: ${reply}`)); return; }
        try { resolve(parse(reply)); } catch (err) { reject(err as Error); }
      };
      this.queue.push({ done, fail: reject });
      try {
        this.start().write(line);
      } catch (err) {
        this.reject(err as Error);
      }
    });
  }

  private start(): LineChild {
    this.child ??= new LineChild(this.spawn('powershell', windowArgs()), 'the window helper (PowerShell)', {
      onLine: (l) => { this.queue.shift()?.done(l); },
      onFail: (err) => { this.reject(err); },
    });
    return this.child;
  }

  /** Fails the calls in flight and every later one. */
  private reject(err: Error): void {
    this.failed ??= err;
    for (const p of this.queue.splice(0)) p.fail(this.failed);
  }
}

export interface PollWindowOptions {
  readonly timeoutMs?: number;
  readonly pollMs?: number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

/**
 * pcsx2_ctl cmd_launch's window search over asynchronous calls: `find` until it gives a handle, a poll a second, up to
 * 120 s; the abort ends it at once -- between polls, or during a find that never answers.
 */
export async function pollWindow(
  calls: Pick<WindowCalls, 'find'>, title: string, pid: number, signal: AbortSignal, o: PollWindowOptions = {},
): Promise<number> {
  const timeoutMs = o.timeoutMs ?? FIND_WINDOW_TIMEOUT_MS;
  const pollMs = o.pollMs ?? FIND_WINDOW_POLL_MS;
  const wait = o.sleep ?? abortableSleep;
  const now = o.now ?? Date.now;
  const t0 = now();
  for (;;) {
    if (signal.aborted) throw abortError(signal);
    const h = await raceAbort(calls.find(title, pid), signal);
    if (h > 0) return h;
    if (now() - t0 >= timeoutMs) throw new Error(`EPH run: no "${title}" window for pid ${pid} after ${timeoutMs / 1000} s`);
    await wait(pollMs, signal);
  }
}
