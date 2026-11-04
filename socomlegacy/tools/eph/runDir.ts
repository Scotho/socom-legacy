import { isAbsolute } from 'node:path';

/**
 * The emulator parity harness's run directory (EPH-2 step 3; docs/specs/2026-10-30-emulator-parity-harness-design.md,
 * EPH.R2). Product track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game.
 *
 * Everything git must never hold -- the PCSX2 copy with its BIOS, memory cards and save states, the run outputs -- goes
 * under `EPH_RUN_DIR`, which must be outside every clone and worktree (the clone, the worktree the harness runs from,
 * any `wt-*` sibling) and outside the desktop tree, which is read only (nothing here writes into it). Pure: paths in,
 * a layout or a refusal out; the copy itself is run.ts's live step.
 */

export class RunDirError extends Error {
  constructor(what: string) {
    super(`EPH run dir: ${what}`);
    this.name = 'RunDirError';
  }
}

export interface RunDirWorld {
  /** The worktree (or clone) the harness runs from. */
  readonly repo: string;
  /** Every other clone of the repository on the host (the main clone a worktree hangs off). */
  readonly clones: readonly string[];
  /** The folder the `wt-*` worktrees sit in (the clone's parent). */
  readonly worktreeParent: string;
  /** SOCOM_PC_ROOT, read only. */
  readonly desktop: string | null;
}

/** Forward slashes, no trailing slash. */
export function slash(p: string): string {
  const s = p.replace(/\\/g, '/');
  return s.length > 3 && s.endsWith('/') ? s.slice(0, -1) : s;
}

const key = (p: string): string => slash(p).toLowerCase();
const within = (p: string, root: string): boolean => key(p) === key(root) || key(p).startsWith(key(root) + '/');

/** The run directory from `EPH_RUN_DIR`, checked; forward slashes. */
export function checkRunDir(raw: string | undefined, w: RunDirWorld): string {
  if (raw === undefined || raw.trim() === '') throw new RunDirError('EPH_RUN_DIR is not set: name a folder outside the clone, its worktrees and SOCOM_PC_ROOT');
  const p = slash(raw.trim());
  if (!isAbsolute(p) && !/^[A-Za-z]:\//.test(p)) throw new RunDirError(`EPH_RUN_DIR must be an absolute path, not "${raw}"`);
  for (const [root, what] of [[w.repo, 'the worktree'], ...w.clones.map((c) => [c, 'a clone'] as const)] as const) {
    if (within(p, root)) throw new RunDirError(`${p} is inside ${what} (${slash(root)}): git must never hold the PCSX2 copy`);
  }
  const parent = key(w.worktreeParent);
  const k = key(p);
  if (k.startsWith(parent + '/')) {
    const first = k.slice(parent.length + 1).split('/')[0]!;
    if (first.startsWith('wt-')) throw new RunDirError(`${p} is inside a worktree (${slash(w.worktreeParent)}/${first})`);
  }
  if (w.desktop && within(p, w.desktop)) throw new RunDirError(`${p} is inside SOCOM_PC_ROOT (${slash(w.desktop)}), which is read only`);
  return p;
}

/** The UTC moment as `YYYYMMDDTHHMMSSZ`. */
export function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export interface RunLayout {
  readonly runDir: string;
  /** `$SOCOM_PC_ROOT/tools/pcsx2`, copied whole (EPH.R2). */
  readonly pcsx2Source: string;
  readonly pcsx2Dir: string;
  readonly exe: string;
  /** The copy's ini (portable mode), rewritten with the harness's [Pad1]. */
  readonly ini: string;
  readonly runsDir: string;
  /** This run's outputs. */
  readonly outDir: string;
}

export function runLayout(runDir: string, socomPcRoot: string, now: Date): RunLayout {
  const r = slash(runDir);
  const pcsx2Dir = `${r}/pcsx2`;
  return {
    runDir: r,
    pcsx2Source: `${slash(socomPcRoot)}/tools/pcsx2`,
    pcsx2Dir,
    exe: `${pcsx2Dir}/pcsx2-qt.exe`,
    ini: `${pcsx2Dir}/inis/PCSX2.ini`,
    runsDir: `${r}/runs`,
    outDir: `${r}/runs/${utcStamp(now)}`,
  };
}

export interface CopyPlan {
  readonly copy: boolean;
  readonly from: string;
  readonly to: string;
  readonly what: 'the whole folder' | 'already copied';
}

/** Copy the whole PCSX2 folder when the run has none; a missing source is refused. */
export function copyPlan(l: RunLayout, exists: (p: string) => boolean): CopyPlan {
  if (exists(l.pcsx2Dir)) return { copy: false, from: l.pcsx2Source, to: l.pcsx2Dir, what: 'already copied' };
  if (!exists(l.pcsx2Source)) throw new RunDirError(`no PCSX2 at ${l.pcsx2Source} (SOCOM_PC_ROOT's tools/pcsx2) to copy`);
  return { copy: true, from: l.pcsx2Source, to: l.pcsx2Dir, what: 'the whole folder' };
}
