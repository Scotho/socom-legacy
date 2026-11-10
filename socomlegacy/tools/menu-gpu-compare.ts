/**
 * GM-11c (the GPU menus plan, row GM-11c; research 380 §1, the C class): the menus' capture rows scored on frames the
 * browser wrote out, by the same scorer functions the vitest scorers use (`test/menuCaptureScore.ts`, the one shared
 * score table `MENU_C_ROWS`).
 *
 *   node ../node_modules/tsx/dist/cli.mjs tools/menu-gpu-compare.ts --frames <dir> [--root <SOCOM_PC_ROOT>] [--out <dir>]
 *
 * `--frames`: a directory of GM-11b frame files (`e2e/uiGpuParityRecord.ts`: a JSON header line, then RGBA, top row
 * first; `*.rgba`). Only the header line of each is read until a row asks for its frame. A frame scores a row when its
 * header's `dialog` is the row's `frame`, at scale 1, opaque; every such frame (GPU or CPU, each blend) is its own line.
 * The frame names a writer must emit are `MENU_C_FRAMES` (`test/menuCaptureScore.ts`): `dlgMenu.rdr`,
 * `dlgMenu.rdr hide LoadGameBack` (the same frame with that node hidden) and `dlgCreateGame.rdr`.
 * `--root` (else `SOCOM_PC_ROOT`): where the rows' references are; read only. `--out` (else the OS temp directory's
 * `s2u-menu-gpu-compare`): the table written as `menu-gpu-compare.json` and `.md`; an `--out` inside the root is refused.
 *
 * The pass rule is the scorer's own: a row passes when every field it pins (score, control, matched) is equal at the
 * scorer's printed digit (`judge` rounds to one decimal). The software column is the pin: the software frame's score,
 * held by the scorer's own test. No reference, no root, or no frame file for a row is skipped by name, never passed; a
 * frame file whose header cannot be read, a truncated frame or a wrong-size reference is an `error` line by name.
 *
 * Exit codes (`MENU_GPU_COMPARE_EXIT`), first match wins:
 *   2 usage: no `--frames`, a `--frames` directory missing or holding no `*.rgba`, or an `--out` inside the root;
 *   1 fail: a row scored and a pinned digit moved (a parity regression);
 *   4 error: a bad input (an unreadable frame file, a truncated frame, a wrong-size reference) -- never read as a fail;
 *   3 nothing scored: every row skipped -- never read as a pass;
 *   0 pass: at least one row scored, none failed, no error.
 * A capture comparison: what it prints is that evidence kind, kept apart from the browser run that wrote the frames.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFrameFile, UI_GPU_PARITY_FRAME_FORMAT, type UiGpuFrameHeader } from '../packages/viewer/e2e/uiGpuParityRecord';
import { rgbaToRgb, type Rgb } from './captureImage';
import { MENU_C_ROWS, pinHolds, pinnedOf, readReference, scoreCRow, type MenuCPin, type MenuCRow } from './test/menuCaptureScore';

export const MENU_GPU_COMPARE_EXIT = Object.freeze({ pass: 0, fail: 1, usage: 2, nothingScored: 3, error: 4 } as const);

/** The `row` of a line that is about a frame file, not a row: an unreadable header. */
export const FRAME_FILE_LINE = '(frame file)';
/** How much of a frame file is read for its header line. */
export const HEADER_READ_BYTES = 4096;

export interface CompareLine {
  row: string;
  /** The frame file's name in `--frames`, or null where none was scored. */
  file: string | null;
  which: 'gpu' | 'cpu' | null;
  blend: string | null;
  renderer: string | null;
  /** The presenter's path for the frame (`gpu`, or `software` for an L1 frame): said, so an L1 frame is never read as a GPU one. */
  path: string | null;
  /** The pin: the score on the software frame, at the scorer's digits (null on a frame-file line). */
  pinned: MenuCPin | null;
  got: MenuCPin | null;
  delta: { score: number; control?: number } | null;
  status: 'pass' | 'fail' | 'skipped' | 'error';
  why: string;
}

type Header = UiGpuFrameHeader & { format: string };

/** The header line of a frame file, without reading its pixels; or why it cannot be read. */
function readHeader(path: string): { h: Header } | { why: string } {
  let fd: number;
  try { fd = openSync(path, 'r'); } catch (e) { return { why: `cannot open: ${(e as Error).message}` }; }
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const nl = buf.subarray(0, n).indexOf(10);
    if (nl < 0) return { why: `no header line in the first ${HEADER_READ_BYTES} bytes` };
    let h: Header;
    try { h = JSON.parse(buf.subarray(0, nl).toString('utf8')) as Header; } catch (e) { return { why: `header is not JSON: ${(e as Error).message}` }; }
    if (h === null || typeof h !== 'object' || h.format !== UI_GPU_PARITY_FRAME_FORMAT) {
      return { why: `format ${JSON.stringify((h as { format?: unknown } | null)?.format)}, not ${UI_GPU_PARITY_FRAME_FORMAT}` };
    }
    return { h };
  } catch (e) { return { why: `cannot read: ${(e as Error).message}` }; } finally { closeSync(fd); }
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** The `*.rgba` files of a frames directory, sorted; empty when the directory is missing. */
export function frameFiles(frames: string): string[] {
  return existsSync(frames) && statSync(frames).isDirectory() ? readdirSync(frames).filter((f) => f.endsWith('.rgba')).sort() : [];
}

export function compareFrames(o: { frames: string; root: string | null; rows?: readonly MenuCRow[] }): CompareLine[] {
  const rows = o.rows ?? MENU_C_ROWS;
  const line = (row: MenuCRow, status: CompareLine['status'], why: string, file: string | null = null, h: Header | null = null): CompareLine => ({
    row: row.id, file, which: h?.which ?? null, blend: h?.blend ?? null, renderer: h?.renderer ?? null, path: h?.path ?? null,
    pinned: row.pin, got: null, delta: null, status, why,
  });
  const out: CompareLine[] = [];
  const headers: { file: string; h: Header }[] = [];
  for (const file of frameFiles(o.frames)) {
    const r = readHeader(join(o.frames, file));
    if ('h' in r) headers.push({ file, h: r.h });
    else out.push({ row: FRAME_FILE_LINE, file, which: null, blend: null, renderer: null, path: null, pinned: null, got: null, delta: null, status: 'error', why: `unreadable frame file: ${r.why}` });
  }
  if (o.root === null) return [...out, ...rows.map((r) => line(r, 'skipped', 'no SOCOM_PC_ROOT'))];
  const frameCache = new Map<string, Rgb>();
  const frameOf = (file: string): Rgb => {
    let f = frameCache.get(file);
    if (!f) {
      const { header, rgba } = decodeFrameFile(new Uint8Array(readFileSync(join(o.frames, file))));
      f = rgbaToRgb(header.width, header.height, rgba);
      frameCache.set(file, f);
    }
    return f;
  };
  for (const row of rows) {
    const refPath = resolve(o.root, row.ref);
    if (!existsSync(refPath)) { out.push(line(row, 'skipped', `no reference ${row.ref} under SOCOM_PC_ROOT`)); continue; }
    const named = headers.filter((x) => x.h.dialog === row.frame);
    const usable = named.filter((x) => x.h.scale === 1 && x.h.mode === 'opaque');
    for (const x of named) {
      if (x.h.scale !== 1) out.push(line(row, 'skipped', `${x.file}: scale ${x.h.scale} -- the pinned rows score scale 1`, x.file, x.h));
      else if (x.h.mode !== 'opaque') out.push(line(row, 'skipped', `${x.file}: mode ${x.h.mode} -- the pinned rows score the opaque frame`, x.file, x.h));
    }
    if (usable.length === 0) {
      if (named.length === 0) out.push(line(row, 'skipped', `no frame file names dialog ${JSON.stringify(row.frame)} at scale 1`));
      continue;
    }
    let golden: Rgb;
    try { golden = readReference(row, new Uint8Array(readFileSync(refPath))); } catch (e) {
      out.push(line(row, 'error', `reference: ${(e as Error).message}`));
      continue;
    }
    for (const x of usable) {
      let frame: Rgb;
      try { frame = frameOf(x.file); } catch (e) {
        out.push(line(row, 'error', `${x.file}: ${(e as Error).message}`, x.file, x.h));
        continue;
      }
      const j = scoreCRow(row, frame, golden);
      const got = pinnedOf(row, j);
      const delta: CompareLine['delta'] = { score: round1(got.score - row.pin.score) };
      if (row.pin.control !== undefined) delta.control = round1(j.control - row.pin.control);
      const pass = pinHolds(row, j);
      out.push({
        row: row.id, file: x.file, which: x.h.which, blend: x.h.blend, renderer: x.h.renderer, path: x.h.path,
        pinned: row.pin, got, delta, status: pass ? 'pass' : 'fail', why: pass ? '' : `pinned ${pinText(row.pin)}, got ${pinText(got)}`,
      });
    }
  }
  return out;
}

const pinText = (p: MenuCPin | null): string => (p === null ? '-' : [p.score, p.control, p.matched].filter((v) => v !== undefined).join(' / '));
const deltaText = (d: CompareLine['delta']): string => (d === null ? '-' : [d.score, d.control].filter((v) => v !== undefined).map((v) => (v! > 0 ? `+${v}` : `${v}`)).join(' / '));

export function summary(lines: readonly CompareLine[]): string {
  const n = (s: CompareLine['status']): number => lines.filter((l) => l.status === s).length;
  return `${n('pass')} pass, ${n('fail')} fail, ${n('error')} error, ${n('skipped')} skipped (each by name)`;
}

/** The exit code of a run's lines (usage errors are decided before): fail, then error, then nothing scored, then pass. */
export function exitCode(lines: readonly CompareLine[]): number {
  if (lines.some((l) => l.status === 'fail')) return MENU_GPU_COMPARE_EXIT.fail;
  if (lines.some((l) => l.status === 'error')) return MENU_GPU_COMPARE_EXIT.error;
  if (!lines.some((l) => l.status === 'pass')) return MENU_GPU_COMPARE_EXIT.nothingScored;
  return MENU_GPU_COMPARE_EXIT.pass;
}

/** The table as Markdown: row, frame, software (the pin), GPU frame's score, delta, pass/fail. */
export function formatTable(lines: readonly CompareLine[]): string {
  const head = '| row | frame file | which / path / blend | software (pinned) | this frame | delta | result |\n|---|---|---|---|---|---|---|\n';
  const body = lines.map((l) => `| ${l.row} | ${l.file ?? '-'} | ${l.which ? `${l.which} / ${l.path} / ${l.blend}` : '-'} | ${pinText(l.pinned)} | ${pinText(l.got)} | ${deltaText(l.delta)} | ${l.status}${l.why ? `: ${l.why}` : ''} |`).join('\n');
  return `${head}${body}\n\n${summary(lines)}\n`;
}

/** `inner` is `outer` or under it, by resolved path (case-insensitive on Windows). */
export function isInside(outer: string, inner: string): boolean {
  const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  const rel = relative(norm(outer), norm(inner));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const USAGE = 'usage: tools/menu-gpu-compare.ts --frames <dir> [--root <SOCOM_PC_ROOT>] [--out <dir>]';

export async function main(argv: readonly string[], o: { rows?: readonly MenuCRow[]; log?: (s: string) => void } = {}): Promise<number> {
  const log = o.log ?? ((s: string) => console.log(s));
  const arg = (k: string): string | null => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null; };
  const frames = arg('--frames');
  if (frames === null) { log(USAGE); return MENU_GPU_COMPARE_EXIT.usage; }
  if (frameFiles(resolve(frames)).length === 0) {
    log(`--frames ${resolve(frames)}: ${existsSync(frames) ? 'holds no *.rgba frame file' : 'no such directory'}\n${USAGE}`);
    return MENU_GPU_COMPARE_EXIT.usage;
  }
  const root = arg('--root') ?? process.env.SOCOM_PC_ROOT ?? null;
  const out = resolve(arg('--out') ?? join(tmpdir(), 's2u-menu-gpu-compare'));
  if (root !== null && isInside(root, out)) {
    log(`--out ${out} is inside SOCOM_PC_ROOT (${resolve(root)}): the root is read only\n${USAGE}`);
    return MENU_GPU_COMPARE_EXIT.usage;
  }
  const lines = compareFrames({ frames: resolve(frames), root, rows: o.rows });
  const renderers = [...new Set(lines.map((l) => l.renderer).filter((r): r is string => r !== null))];
  const code = exitCode(lines);
  const table = formatTable(lines);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'menu-gpu-compare.json'), `${JSON.stringify({ frames: resolve(frames), renderers, exit: code, lines }, null, 2)}\n`);
  writeFileSync(join(out, 'menu-gpu-compare.md'), table);
  log(table);
  log(`renderers: ${renderers.length ? renderers.join('; ') : 'none scored'}`);
  log(`written: ${join(out, 'menu-gpu-compare.json')}, .md`);
  if (code === MENU_GPU_COMPARE_EXIT.nothingScored) log('nothing scored: every row skipped -- not a pass (exit 3)');
  if (code === MENU_GPU_COMPARE_EXIT.error) log('a bad input (an error line above) -- not a parity result (exit 4)');
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
