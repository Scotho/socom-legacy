import type { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import {
  EPH_STATUS_PREFIX, END_GRACE_MS, LOG_LINES, PACK_MAP, PACK_PATHS, REPAIR_PATTERNS, STATE_SLOTS, packPath, type PackBuild, type PackChord,
  type PackPadLayout,
} from './layout';
import { utcStamp } from '../../eph/runDir';
import type { BrowserChoice } from './state';

/**
 * The parity pack GUI's harness session: EPH run as a child process (PK-5; docs/specs/2026-11-03-parity-pack-design.md 5
 * and 10, "also settled": liveRun's signal and exit paths would otherwise end the GUI's server). Product track (OT.R53):
 * the GUI of a validation instrument, an adaptation, never changing the game's behaviour.
 *
 * The child is `<node> <harness.mjs> run <EPH args> --control stdio` (tools/eph/run.ts's protocol, its header): stdin takes
 * JSON lines ({"cmd":"pause"|"resume"|"end"|"mark"}, {"cmd":"record","on":bool}); stdout carries only `EPH-STATUS {json}`
 * lines (the session's status); stderr carries the plan and the log. A live session is `--live` at the build's shipped
 * state; the mark flow (design 10.2) is `--mark-state <slot>`: PCSX2 with the image and no state, `mark` saves it.
 */

export type SessionKind = 'live' | 'mark';

export interface SessionSpec {
  readonly kind: SessionKind;
  readonly packRoot: string;
  /** The node that runs the harness (the pack's runtime/node.exe: `process.execPath`). */
  readonly nodePath: string;
  /** `pack/harness/harness.mjs`. */
  readonly harnessEntry: string;
  readonly build: PackBuild;
  readonly layout: PackPadLayout;
  /** The light Triangle's chord modifier (EPH's --chord) and whether the modifier alone is one (--chord-solo), PK-8. */
  readonly chord: PackChord;
  readonly chordSolo: boolean;
  /** The pack's site server, `http://127.0.0.1:<port>/` (live only). */
  readonly siteUrl: string;
  /** The image in drop-here/. */
  readonly iso: string;
  readonly browser: BrowserChoice | null;
  /** VERSION.json's pageSha. */
  readonly pageSha: string;
}

/** The harness's arguments (after the node and the entry), as run.ts parseRunArgs reads them. */
export function sessionArgs(s: SessionSpec): string[] {
  const slot = String(STATE_SLOTS[s.build]);
  if (s.kind === 'mark') return ['run', '--mark-state', slot, '--build', s.build, '--control', 'stdio'];
  return ['run', '--live', '--map', PACK_MAP, '--state', slot, '--build', s.build, '--base', s.siteUrl, '--chord', s.chord,
    ...(s.chordSolo ? ['--chord-solo'] : []), '--pad-layout', s.layout, '--control', 'stdio'];
}

/** The child's environment: the pack's (design 4, START HERE.cmd), over the GUI's own; PATH with pack/runtime first. */
export function sessionEnv(s: SessionSpec, base: Readonly<Record<string, string | undefined>>, platform: string = process.platform): Record<string, string> {
  const env: Record<string, string> = {};
  let path = '';
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (k.toUpperCase() === 'PATH') { path = path || v; continue; }
    env[k] = v;
  }
  delete env.EPH_BROWSER_CHANNEL;
  delete env.PLAYWRIGHT_BROWSERS_PATH;
  const sep = platform === 'win32' ? ';' : ':';
  const runtime = packPath(s.packRoot, PACK_PATHS.runtime);
  env.PATH = path ? `${runtime}${sep}${path}` : runtime;
  env.EPH_PACK = s.packRoot.replace(/\\/g, '/');
  env.EPH_RUN_DIR = packPath(s.packRoot, PACK_PATHS.run);
  env.SOCOM_PC_ROOT = packPath(s.packRoot, PACK_PATHS.desktopStub);
  env.SOCOM_ISO = s.iso.replace(/\\/g, '/');
  env.EPH_PAGE_BUILD = s.pageSha;
  if (s.browser?.channel) env.EPH_BROWSER_CHANNEL = s.browser.channel;
  if (s.browser && !s.browser.channel && s.browser.browsersPath) env.PLAYWRIGHT_BROWSERS_PATH = s.browser.browsersPath;
  return env;
}

/** What the session needs of a child process (node's ChildProcess has it; a test scripts one). */
export interface SessionChild {
  readonly pid?: number;
  readonly stdin: { write(chunk: string): boolean; end(): void } | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  /** After the child exited and its stdio closed (so every last line is read first). */
  once(event: 'close', cb: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: 'error', cb: (err: Error) => void): unknown;
}

export type SpawnFn = (cmd: string, args: string[], opts: { env: Record<string, string>; stdio: ['pipe', 'pipe', 'pipe']; windowsHide: boolean }) => SessionChild;

export interface SessionDeps {
  readonly spawn: SpawnFn;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Kill the child and everything it started (taskkill /T /F on Windows), the last resort after END_GRACE_MS. */
  readonly killTree: (pid: number) => void;
  /** The newest run directory created at or after `since` (pack/run/runs/<stamp>), or null. */
  readonly newestRunDir?: (since: Date) => string | null;
  readonly now?: () => Date;
  readonly graceMs?: number;
  readonly platform?: string;
}

/** The session as the GUI shows it. */
export interface SessionView {
  readonly kind: SessionKind;
  /** The child's own phase (run.ts SessionPhase or MarkPhase), 'starting' before its first status, 'ended' after exit. */
  readonly phase: string;
  readonly paused: boolean;
  readonly recording: boolean;
  readonly clip: number | null;
  readonly clips: number;
  /**
   * The harness's active ms (its clock: wall ms since the pad went live less every pause), advanced from the last status
   * by the wall time since it while the session is live and not paused (PR #648 P2: the child reports on phase
   * changes, commands and log lines only, so an uninterrupted clip would otherwise read 00:00 until its end).
   */
  readonly activeMs: number;
  /** The mark flow's state saved. */
  readonly saved: boolean;
  /** The child's exit code, once it exited. */
  readonly exitCode: number | null;
  /** The shipped starting point did not load (REPAIR_PATTERNS matched a log line): offer the repair. */
  readonly repair: boolean;
  /** The last log line of a failed run (the refusal in the harness's words), or null. */
  readonly refusal: string | null;
  readonly lines: readonly string[];
}

export interface SessionEnd { readonly code: number | null; readonly runDir: string | null }

/**
 * The newest `pack/run/runs/<stamp>` (runDir.ts runLayout: `utcStamp`, YYYYMMDDTHHMMSSZ) stamped at or after `since`
 * less a second, or null: the run directory when the child's "written to" line was not seen.
 */
export function newestRunDirIn(runsDir: string, names: readonly string[], since: Date): string | null {
  const floor = utcStamp(new Date(since.getTime() - 1000));
  const stamps = names.filter((n) => /^\d{8}T\d{6}Z$/.test(n) && n >= floor).sort();
  return stamps.length ? `${runsDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${stamps[stamps.length - 1]}` : null;
}

const WRITTEN = /^EPH run \(.*\) written to (.+)$/;

export class HarnessSession {
  private child: SessionChild | null = null;
  private status: Record<string, unknown> = {};
  private readonly log: string[] = [];
  private exitCode: number | null = null;
  private exited = false;
  private runDir: string | null = null;
  private repair = false;
  private startedAt: Date = new Date(0);
  /** When the last status that carried activeMs arrived (the clock advances from it), or null before one. */
  private activeAt: Date | null = null;
  private readonly listeners = new Set<() => void>();
  private resolveEnded!: (e: SessionEnd) => void;
  readonly ended: Promise<SessionEnd>;

  constructor(readonly spec: SessionSpec, private readonly deps: SessionDeps) {
    this.ended = new Promise((ok) => { this.resolveEnded = ok; });
  }

  /** Starts the child; its status, log and exit are read from here on. */
  start(): void {
    if (this.child) throw new Error('the session is started already');
    this.startedAt = (this.deps.now ?? (() => new Date()))();
    const args = [this.spec.harnessEntry, ...sessionArgs(this.spec)];
    const child = this.deps.spawn(this.spec.nodePath, args, {
      env: sessionEnv(this.spec, this.deps.env, this.deps.platform), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.child = child;
    if (child.stdout) createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (l) => this.onStdout(l));
    if (child.stderr) createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', (l) => this.addLine(l));
    child.once('error', (err) => { this.addLine(`the harness could not start: ${err.message}`); this.onExit(1); });
    child.once('close', (code) => this.onExit(code));
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get running(): boolean { return this.child !== null && !this.exited; }

  view(): SessionView {
    const s = this.status;
    const num = (v: unknown, or: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : or);
    const failed = this.exited && this.exitCode !== 0;
    const phase = this.exited ? 'ended' : typeof s.phase === 'string' ? s.phase : 'starting';
    const paused = s.paused === true;
    const running = !this.exited && phase === 'live' && !paused && this.activeAt !== null;
    const since = running ? Math.max(0, (this.deps.now ?? (() => new Date()))().getTime() - this.activeAt!.getTime()) : 0;
    return {
      kind: this.spec.kind,
      phase,
      paused,
      recording: !this.exited && s.recording === true,
      clip: typeof s.clip === 'number' ? s.clip : null,
      clips: num(s.clips, 0),
      activeMs: num(s.activeMs, 0) + since,
      saved: s.saved === true,
      exitCode: this.exitCode,
      repair: this.repair,
      refusal: failed ? [...this.log].reverse().find((l) => l.trim() !== '') ?? 'the harness stopped' : null,
      lines: [...this.log],
    };
  }

  pause(): void { this.send({ cmd: 'pause' }); }
  resume(): void { this.send({ cmd: 'resume' }); }
  record(on: boolean): void { this.send({ cmd: 'record', on }); }
  mark(): void { this.send({ cmd: 'mark' }); }

  /**
   * Ends the session (Save, Stop and Reset alike): `{"cmd":"end"}` (the record written, outcome "complete (live session
   * ended by Save)"), stdin
   * closed, and after the grace the child's PID tree killed if it is still there. Resolves with the exit and the run dir.
   */
  end(): Promise<SessionEnd> {
    if (this.child && !this.exited) {
      this.send({ cmd: 'end' });
      try { this.child.stdin?.end(); } catch { /* gone */ }
      const pid = this.child.pid;
      const t = setTimeout(() => { if (!this.exited && pid) this.deps.killTree(pid); }, this.deps.graceMs ?? END_GRACE_MS);
      void this.ended.finally(() => clearTimeout(t));
    }
    return this.ended;
  }

  private send(c: object): void {
    if (!this.child || this.exited || !this.child.stdin) return;
    try {
      this.child.stdin.write(`${JSON.stringify(c)}\n`);
    } catch (err) {
      this.addLine(`the harness did not take the command: ${(err as Error).message}`);
    }
  }

  private onStdout(line: string): void {
    if (!line.startsWith(EPH_STATUS_PREFIX)) { this.addLine(line); return; }
    try {
      const v = JSON.parse(line.slice(EPH_STATUS_PREFIX.length)) as unknown;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const { line: _l, ...rest } = v as Record<string, unknown>;
        this.status = { ...this.status, ...rest };
        if (typeof rest.activeMs === 'number') this.activeAt = (this.deps.now ?? (() => new Date()))();
        this.changed();
      }
    } catch {
      this.addLine(line);
    }
  }

  private addLine(line: string): void {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.splice(0, this.log.length - LOG_LINES);
    const w = WRITTEN.exec(line.trim());
    if (w) this.runDir = w[1]!.trim().replace(/\\/g, '/');
    if (REPAIR_PATTERNS.some((p) => p.test(line))) this.repair = true;
    this.changed();
  }

  private onExit(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    this.exitCode = code;
    if (!this.runDir && this.spec.kind === 'live' && this.deps.newestRunDir) this.runDir = this.deps.newestRunDir(this.startedAt);
    this.changed();
    this.resolveEnded({ code, runDir: this.runDir });
  }

  private changed(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* a listener's own fault */ }
    }
  }
}
