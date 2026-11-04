import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PLAT-31's golden capture manifest (web research 113): one row per front-end screen or state -> the capture(s) of the
 * original that show it, each a path RELATIVE to a named root -> the method (the driven run or script) that produced
 * it. The data is `docs/parity/golden-manifest.json`; this module reads it and validates it against PLAT-06's dialog
 * inventory (`tools/test/dialogInventory.pinned.json`, research 96). Every dialog of the inventory is either in a row
 * or in the "screens without a frame" list, which names the capture task that owes it (BOOT-01, OPT-19, ONL-32,
 * PLAT-36) or why none does, and how it is to be captured (a key of `owedMethods`): the sprint 9 plan's owner default 4.
 *
 * Nothing of a frame enters git -- no pixels, no crop, no hash: names, byte counts and pixel sizes only. The frames
 * stay where the PC project keeps them, under `SOCOM_PC_ROOT` (its `logs/parity/` and `scripts/parity/`) and under
 * the parity archive `SOCOM_PARITY_ARCHIVE` (the archived `logs/parity/` runs). Each root comes from its environment
 * variable only; a root that is unset skips its rows in the dev-host check.
 *
 * A capture recorded under `SOCOM_PC_ROOT` that the PC project has since moved off its tree (the 2026-10-18 cleanup
 * moved its run output older than 2026-10-11, `logs/parity/` runs among it, to an archive that keeps every path's
 * place relative to the PC project's root) is found at the same relative path under `SOCOM_PC_ARCHIVE`, the archived
 * copy of that tree, when the variable is set and the file is not under `SOCOM_PC_ROOT` -- the recorded root and
 * path stay as they are. `SOCOM_PARITY_ARCHIVE` is a different folder (it is itself a `logs/parity/`, its runs at
 * its top) and its captures are read under it alone.
 *
 * The reader and the validator are pure; `checkCaptures` takes its file system as a parameter (the real one by
 * default), so its rules are unit-tested without a host.
 */

/** Where the manifest lives, relative to `redotcom`. */
export const MANIFEST_PATH = 'docs/parity/golden-manifest.json';

export const ROOT_NAMES = ['SOCOM_PC_ROOT', 'SOCOM_PARITY_ARCHIVE'] as const;
export type RootName = (typeof ROOT_NAMES)[number];

/** The capture tasks that owe a frame (the roadmap's BOOT-01, OPT-19, ONL-32; PLAT-36 for what only a trace settles). */
export const CAPTURE_TASKS = ['BOOT-01', 'OPT-19', 'ONL-32', 'PLAT-36'] as const;
export type CaptureTask = (typeof CAPTURE_TASKS)[number];

export const SOURCES = ['pcsx2', 'recomp', 'owner-photo'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * How sure a row is of its screen: `seen` -- the frames were looked at and the dialog read off what they show (its
 * title or captions against the layout's message ids, `tools/dump-dialogs.ts --dialog`); `seen-flow` -- looked at, the
 * screen is as described, but the dialog drawing it is inferred from the flow (research 96's graph), not read off
 * the frame; `name-only` -- no frame of the row was looked at: mapped by its file name and the PC project's notes.
 */
export const CONFIDENCES = ['seen', 'seen-flow', 'name-only'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Whether PCSX2 reaches a screen offline: online screens need OUR server (R293; never another). */
export const REACH = ['yes', 'no-our-server', 'unknown', 'never'] as const;
export type Reach = (typeof REACH)[number];

export const SEGMENTS = ['boot', 'menu', 'campaign', 'options', 'card', 'online', 'match'] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface Capture {
  root: RootName;
  /** Relative to the root, forward slashes, no `..`. */
  path: string;
  bytes: number;
  width: number;
  height: number;
  source: Source;
  /** A key of `methods`. */
  method: string;
  /** Whether the frame was looked at when the row was written (research 113 §2). */
  looked: boolean;
  note?: string;
}

export interface Row {
  id: string;
  screen: string;
  /** The inventory's dialog names (with `.rdr`) the screen shows; empty for a state no dialog draws (the loader). */
  dialogs: string[];
  segment: Segment;
  confidence: Confidence;
  captures: Capture[];
  cites: string[];
  note?: string;
}

export interface Method {
  /** The script or run that produced the frames, as the PC project names it. */
  how: string;
  cites: string[];
}

export interface NoFrame {
  dialog: string;
  owedBy: CaptureTask | null;
  /** A key of `owedMethods`: how the frame is to be taken. Required for every inventory dialog; a dangling name has
   *  no file to draw, so it may name none. */
  method?: string;
  pcsx2Offline: Reach;
  why: string;
  /** Required when `owedBy` is null: why no task owes a frame (R1's campaign, a dangling name). */
  outOfScope?: string;
}

export interface StateNoFrame {
  id: string;
  state: string;
  owedBy: CaptureTask;
  pcsx2Offline: Reach;
  why: string;
  /** A key of `owedMethods`. */
  method: string;
}

export interface GoldenManifest {
  schema: 1;
  about: string;
  roots: Record<RootName, string>;
  methods: Record<string, Method>;
  /** How each owed screen or state is to be captured: the runs not yet taken, as the owing tasks' blocks describe them. */
  owedMethods: Record<string, Method>;
  rows: Row[];
  screensWithoutFrame: NoFrame[];
  statesWithoutFrame: StateNoFrame[];
}

export interface Inventory {
  /** The inventory's dialogs (`perDialog`'s keys: the 103 `dlg*` members of READERC). */
  dialogs: readonly string[];
  /** Names a dialog uses that no archive holds (`dlgStickSetup.rdr`). */
  dangling: readonly string[];
}

/** PLAT-06's dialog list from its pin (`tools/test/dialogInventory.pinned.json`). */
export function inventoryDialogs(pin: { perDialog: Record<string, unknown>; dangling: readonly string[] }): Inventory {
  return { dialogs: Object.keys(pin.perDialog), dangling: [...pin.dangling] };
}

/** Parse the manifest's text; throws unless it is JSON of schema 1 with the four lists. */
export function parseManifest(text: string): GoldenManifest {
  const m = JSON.parse(text) as Partial<GoldenManifest>;
  if (m?.schema !== 1) throw new Error(`golden manifest: schema ${String(m?.schema)}, expected 1`);
  for (const k of ['rows', 'screensWithoutFrame', 'statesWithoutFrame'] as const) {
    if (!Array.isArray(m[k])) throw new Error(`golden manifest: ${k} is not a list`);
  }
  if (!m.methods || typeof m.methods !== 'object') throw new Error('golden manifest: no methods');
  if (!m.owedMethods || typeof m.owedMethods !== 'object') throw new Error('golden manifest: no owedMethods');
  if (!m.roots || typeof m.roots !== 'object') throw new Error('golden manifest: no roots');
  return m as GoldenManifest;
}

export function readManifest(path: string): GoldenManifest {
  return parseManifest(readFileSync(path, 'utf8'));
}

/**
 * What no field may hold: a drive letter starting a path (raw, or JSON-escaped `C:\\x`), a POSIX home, a Windows user
 * folder. The drive letter stands alone (`slot:\"` in escaped prose is not one).
 */
export const ABSOLUTE_USER = /(?<!\w)[A-Za-z]:(?:\/|\\{1,2})\w|\/Users\/|\/home\/|\\Users\\/;
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const REL_PATH = /^[\w.-]+(?:\/[\w.-]+)*\.png$/;

/** Every dialog with a frame (in a row) and every dialog in the no-frame list, with the rows that show it. */
export function coverage(m: GoldenManifest): { framed: Map<string, string[]>; unframed: Set<string> } {
  const framed = new Map<string, string[]>();
  for (const r of m.rows) for (const d of r.dialogs) framed.set(d, [...(framed.get(d) ?? []), r.id]);
  return { framed, unframed: new Set(m.screensWithoutFrame.map((n) => n.dialog)) };
}

/** Every rule the manifest keeps; an empty list when it keeps them all. */
export function validateManifest(m: GoldenManifest, inv: Inventory): string[] {
  const errors: string[] = [];
  const err = (s: string): void => { errors.push(s); };

  if (ABSOLUTE_USER.test(JSON.stringify(m))) err('an absolute user path appears in the manifest');
  for (const k of ROOT_NAMES) if (!m.roots?.[k]) err(`root ${k} is not described`);
  for (const [k, meth] of Object.entries(m.methods)) {
    if (!meth.how) err(`method ${k} has no how`);
    if (!Array.isArray(meth.cites) || meth.cites.length === 0) err(`method ${k} cites nothing`);
  }
  for (const [k, meth] of Object.entries(m.owedMethods ?? {})) {
    if (!meth.how) err(`owed method ${k} has no how`);
    if (!Array.isArray(meth.cites) || meth.cites.length === 0) err(`owed method ${k} cites nothing`);
  }
  const owedMethod = (at: string, method: string | undefined, required: boolean): void => {
    if (!method) { if (required) err(`${at}: no capture method`); }
    else if (!m.owedMethods?.[method]) err(`${at}: method ${method} is not in owedMethods`);
  };

  const ids = new Set<string>();
  const paths = new Set<string>();
  const known = new Set(inv.dialogs);
  const dangling = new Set(inv.dangling);
  for (const id of [...m.rows.map((r) => r.id), ...m.statesWithoutFrame.map((s) => s.id)]) {
    if (!ID.test(id)) err(`id ${id} is not lower-case dotted`);
    if (ids.has(id)) err(`duplicate id ${id}`);
    ids.add(id);
  }

  for (const r of m.rows) {
    if (!r.screen) err(`${r.id}: no screen`);
    if (!SEGMENTS.includes(r.segment)) err(`${r.id}: segment ${r.segment}`);
    if (!CONFIDENCES.includes(r.confidence)) err(`${r.id}: confidence ${r.confidence}`);
    if (!Array.isArray(r.dialogs)) err(`${r.id}: dialogs is not a list`);
    for (const d of r.dialogs ?? []) if (!known.has(d)) err(`${r.id}: ${d} is not in the dialog inventory`);
    if (!r.captures?.length) err(`${r.id}: no capture`);
    for (const c of r.captures ?? []) {
      const at = `${r.id} ${c.root}:${c.path}`;
      if (!ROOT_NAMES.includes(c.root)) err(`${at}: root ${c.root}`);
      if (!c.path || !REL_PATH.test(c.path) || c.path.split('/').includes('..')) err(`${at}: path is not a relative .png path`);
      const key = `${c.root}:${c.path}`;
      if (paths.has(key)) err(`${at}: the same capture in two places`);
      paths.add(key);
      for (const n of ['bytes', 'width', 'height'] as const) {
        if (!Number.isInteger(c[n]) || c[n] <= 0) err(`${at}: ${n} ${String(c[n])}`);
      }
      if (!SOURCES.includes(c.source)) err(`${at}: source ${c.source}`);
      if (!c.method || !m.methods[c.method]) err(`${at}: method ${c.method} is not defined`);
      if (typeof c.looked !== 'boolean') err(`${at}: looked is not recorded`);
    }
    const looked = (r.captures ?? []).some((c) => c.looked);
    if (!looked && r.confidence !== 'name-only') err(`${r.id}: no frame looked at, so it is name-only`);
    if (looked && r.confidence === 'name-only') err(`${r.id}: a frame was looked at, so it is not name-only`);
  }

  const { framed } = coverage(m);
  const unframed = new Set<string>();
  for (const n of m.screensWithoutFrame) {
    if (unframed.has(n.dialog)) err(`${n.dialog}: twice in the no-frame list`);
    unframed.add(n.dialog);
    if (!known.has(n.dialog) && !dangling.has(n.dialog)) err(`${n.dialog}: not in the dialog inventory`);
    if (n.owedBy === null) {
      if (!n.outOfScope) err(`${n.dialog}: no owing task and no out-of-scope reason`);
    } else if (!CAPTURE_TASKS.includes(n.owedBy)) err(`${n.dialog}: owedBy ${String(n.owedBy)} is not a capture task`);
    if (!REACH.includes(n.pcsx2Offline)) err(`${n.dialog}: pcsx2Offline ${n.pcsx2Offline}`);
    if (!n.why) err(`${n.dialog}: no why`);
    owedMethod(n.dialog, n.method, !dangling.has(n.dialog));
  }
  for (const s of m.statesWithoutFrame) {
    if (!CAPTURE_TASKS.includes(s.owedBy)) err(`${s.id}: owedBy ${String(s.owedBy)} is not a capture task`);
    if (!REACH.includes(s.pcsx2Offline)) err(`${s.id}: pcsx2Offline ${s.pcsx2Offline}`);
    owedMethod(s.id, s.method, true);
  }
  for (const d of inv.dialogs) {
    const inRow = framed.has(d), inList = unframed.has(d);
    if (!inRow && !inList) err(`${d}: in neither a row nor the no-frame list`);
    if (inRow && inList) err(`${d}: in both a row (${framed.get(d)!.join(', ')}) and the no-frame list`);
  }
  return errors;
}

/** The width and height of a PNG from its first 24 bytes (the IHDR); null when it is not a PNG. */
export function pngSize(head: Uint8Array): { width: number; height: number } | null {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 24 || SIG.some((b, i) => head[i] !== b)) return null;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** The roots present on this host: each from its environment variable only, kept when the directory exists. */
export function presentRoots(env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  exists: (p: string) => boolean = existsSync): Partial<Record<RootName, string>> {
  const out: Partial<Record<RootName, string>> = {};
  for (const k of ROOT_NAMES) {
    const v = env[k];
    if (v && exists(v)) out[k] = v;
  }
  return out;
}

/** The environment variable naming the archived copy of the PC project's tree (laid out as `SOCOM_PC_ROOT` is). */
export const PC_ARCHIVE_VAR = 'SOCOM_PC_ARCHIVE';

/**
 * Where a root's moved files are kept: `SOCOM_PC_ROOT`'s at the same relative path under `SOCOM_PC_ARCHIVE`, taken from
 * that environment variable only and kept when the directory exists. No other root has one.
 */
export function pcArchiveRoot(env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  exists: (p: string) => boolean = existsSync): Partial<Record<RootName, string>> {
  const v = env[PC_ARCHIVE_VAR];
  return v && exists(v) ? { SOCOM_PC_ROOT: v } : {};
}

export interface CaptureFs {
  exists(p: string): boolean;
  size(p: string): number;
  /** The file's first 24 bytes (or fewer). */
  head(p: string): Uint8Array;
}

const realFs: CaptureFs = {
  exists: existsSync,
  size: (p) => statSync(p).size,
  head: (p) => {
    const fd = openSync(p, 'r');
    try {
      const b = new Uint8Array(24);
      const n = readSync(fd, b, 0, 24, 0);
      return b.subarray(0, n);
    } finally {
      closeSync(fd);
    }
  },
};

/**
 * Check each capture under a present root: it exists, with the recorded byte count and pixel size. A capture missing
 * under its root is looked up at the same relative path under that root's entry in `moved` (`pcArchiveRoot`), when
 * there is one; a file present under the root is always the one checked.
 */
export function checkCaptures(m: GoldenManifest, roots: Partial<Record<RootName, string>>, fs: CaptureFs = realFs,
  moved: Partial<Record<RootName, string>> = {}): { checked: number; skipped: string[]; errors: string[] } {
  let checked = 0;
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const r of m.rows) {
    for (const c of r.captures) {
      const key = `${c.root}:${c.path}`;
      const base = roots[c.root];
      if (!base) { skipped.push(key); continue; }
      checked++;
      const here = resolve(base, c.path);
      const away = moved[c.root];
      const p = fs.exists(here) || !away ? here : resolve(away, c.path);
      if (!fs.exists(p)) { errors.push(`${r.id} ${key}: missing`); continue; }
      const size = fs.size(p);
      if (size !== c.bytes) errors.push(`${r.id} ${key}: bytes ${size}, recorded ${c.bytes}`);
      const dim = pngSize(fs.head(p));
      if (!dim) errors.push(`${r.id} ${key}: not a PNG`);
      else if (dim.width !== c.width || dim.height !== c.height) {
        errors.push(`${r.id} ${key}: ${dim.width}x${dim.height}, recorded ${c.width}x${c.height}`);
      }
    }
  }
  return { checked, skipped, errors };
}
