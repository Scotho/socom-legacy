import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { SystemFacts } from './system';

/**
 * The parity pack's Save (PK-5; docs/specs/2026-11-03-parity-pack-design.md 5, "Save", and 10.5). Product track
 * (OT.R53): the GUI's record of a session, an adaptation. The session has ended (the server ends it first); here
 * `notes.txt` and `system.json` are written into the run directory, and one store-only zip is written to
 * `handoff/parity-<stamp>.zip`: `notes.txt`, `system.json`, `pcsx2-emulog.txt` (the copy's `logs/emulog.txt`, when
 * there is one) and `VERSION.json` at its top, and every other file of the run directory under `runs/<stamp>/`. The
 * writer is PK-4's streaming one (`../zipStream` writeZipFile), injected; its refusal (over 4 GB: ZIP64 is a LATER row)
 * is passed on in its own words with the run directory named, which keeps the session.
 */

export interface ZipEntry { readonly name: string; readonly path: string; readonly mtime?: Date }
export type WriteZipFile = (outPath: string, entries: ZipEntry[], opts?: { now?: Date }) => Promise<{ bytes: number; entries: number }>;

export interface SaveRequest {
  /** pack/run/runs/<stamp>. */
  readonly runDir: string;
  readonly notes: string;
  readonly system: SystemFacts;
  /** What the checklist found and the session used: the browser's name, the image's CRC, the build. */
  readonly session: Readonly<Record<string, unknown>>;
  /** pack/VERSION.json's path, and its parsed content (null when absent). */
  readonly versionPath: string;
  readonly version: Readonly<Record<string, unknown>> | null;
  /** pack/run/pcsx2/logs/emulog.txt. */
  readonly emulog: string;
  readonly handoffDir: string;
  readonly writeZipFile: WriteZipFile;
  readonly now: Date;
}

export class SaveRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveRefused';
  }
}

/** Every file under `dir`, relative, forward slashes, sorted. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, r)).isDirectory()) walk(r);
      else out.push(r);
    }
  };
  walk('');
  return out;
}

/** The zip's path: handoff/parity-<stamp>.zip, or -2, -3 ... when a Save of the same session is there already. */
export function zipPathFor(handoffDir: string, stamp: string, exists: (p: string) => boolean = existsSync): string {
  const base = `${handoffDir.replace(/\\/g, '/').replace(/\/+$/, '')}/parity-${stamp}`;
  if (!exists(`${base}.zip`)) return `${base}.zip`;
  for (let n = 2; ; n++) if (!exists(`${base}-${n}.zip`)) return `${base}-${n}.zip`;
}

/** The zip's entries, in order: the four top files, then the run directory under runs/<stamp>/. */
export function saveEntries(runDir: string, files: readonly string[], top: { emulog: string | null; versionPath: string | null }): ZipEntry[] {
  const dir = runDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const stamp = basename(dir);
  const entries: ZipEntry[] = [
    { name: 'notes.txt', path: `${dir}/notes.txt` },
    { name: 'system.json', path: `${dir}/system.json` },
  ];
  if (top.emulog) entries.push({ name: 'pcsx2-emulog.txt', path: top.emulog });
  if (top.versionPath) entries.push({ name: 'VERSION.json', path: top.versionPath });
  for (const f of files) {
    if (f === 'notes.txt' || f === 'system.json') continue;
    entries.push({ name: `runs/${stamp}/${f}`, path: `${dir}/${f}` });
  }
  return entries;
}

export async function save(r: SaveRequest): Promise<{ path: string; bytes: number; entries: number }> {
  const dir = r.runDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new SaveRefused(`the session's record was not found (${dir})`);
  const stamp = basename(dir);
  const notes = r.notes.replace(/\r?\n/g, '\r\n');
  writeFileSync(`${dir}/notes.txt`, notes.endsWith('\r\n') || notes === '' ? notes : `${notes}\r\n`);
  writeFileSync(`${dir}/system.json`, `${JSON.stringify({ ...r.system, ...r.session, version: r.version }, null, 2)}\n`);
  const files = filesUnder(dir);
  const entries = saveEntries(dir, files, {
    emulog: existsSync(r.emulog) ? r.emulog : null, versionPath: existsSync(r.versionPath) ? r.versionPath : null,
  });
  // The pack's zip carries no folder entries (PK-4): handoff/ may not exist after unzipping.
  mkdirSync(r.handoffDir, { recursive: true });
  const out = zipPathFor(r.handoffDir, stamp);
  let written: { bytes: number; entries: number };
  try {
    written = await r.writeZipFile(out, entries, { now: r.now });
  } catch (err) {
    throw new SaveRefused(`${(err as Error).message} -- the session is kept in ${dir}`);
  }
  return { path: out, bytes: written.bytes, entries: written.entries };
}
