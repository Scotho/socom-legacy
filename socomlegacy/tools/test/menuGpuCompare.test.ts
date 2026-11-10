import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FONTS_RDR } from '@s2u/scene';
import { encodeFrameFile, type UiGpuFrameHeader } from '../../packages/viewer/e2e/uiGpuParityRecord';
import { rgbaToRgb } from '../captureImage';
import { encodePng } from '../png';
import { FRAME_FILE_LINE, MENU_GPU_COMPARE_EXIT, compareFrames, exitCode, formatTable, isInside, main } from '../menu-gpu-compare';
import { drawDialog, parseFrameName } from './menuCaptureFrames';
import { MENU_C_FRAMES, MENU_C_ROWS, pinnedOf, readReference, scoreCRow, type MenuCRow } from './menuCaptureScore';

/**
 * GM-11c (the GPU menus plan, row GM-11c; research 380 §1, the C class): `tools/menu-gpu-compare.ts` scores GM-11b's
 * frame files by the shared scorers (`menuCaptureScore.ts`) against the captures, and a row passes only where its pinned
 * digits are unchanged. Held two ways: with no data, the pass/fail/skip rules on a synthetic reference; with the disc and
 * `SOCOM_PC_ROOT`'s references, a software frame drawn in Node by the reference path (`menuCaptureFrames.ts`, the frame
 * `uiCompositorScore.test.ts` scores), written in the frame-file format, reproduces every pinned row of the table.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const REFS_PRESENT = ROOT !== null && MENU_C_ROWS.every((r) => existsSync(resolve(ROOT, r.ref)));
const ready = DISC !== null && REFS_PRESENT;

const header = (dialog: string, over: Partial<UiGpuFrameHeader> = {}): UiGpuFrameHeader => ({
  dialog, run: `${dialog}@1x/opaque/exact`, scale: 1, mode: 'opaque', blend: 'exact', which: 'gpu', width: 640, height: 448,
  renderer: 'node: rasterizeUiDrawList (the software reference)', path: 'software', ...over,
});
const write = (dir: string, stem: string, h: UiGpuFrameHeader, rgba: Uint8Array): void => {
  writeFileSync(join(dir, `${stem}.${h.which}.rgba`), encodeFrameFile(h, rgba));
};
const scratch = (): string => mkdtempSync(join(tmpdir(), 's2u-gm11c-'));

/** A synthetic 640 x 448 frame: a grey ramp with a bright square, so the score sees structure. */
function synthetic(shift = 0): Uint8Array {
  const out = new Uint8Array(640 * 448 * 4);
  for (let y = 0; y < 448; y++) for (let x = 0; x < 640; x++) {
    const i = (y * 640 + x) * 4, v = (x + y + shift) & 255, sq = x > 200 && x < 400 && y > 100 && y < 300;
    out[i] = sq ? 250 : v; out[i + 1] = sq ? 240 : v >> 1; out[i + 2] = sq ? 30 : 255 - v; out[i + 3] = 255;
  }
  return out;
}

describe('menu-gpu-compare: the pass, fail and skip rules (no data needed)', () => {
  /** A root holding one reference (the synthetic frame itself as a PNG), and a row pinned on that frame's score. */
  function rig(): { root: string; frames: string; row: MenuCRow } {
    const root = scratch(), frames = join(root, 'frames');
    mkdirSync(frames);
    const ref = synthetic();
    writeFileSync(join(root, 'ref.png'), encodePng(640, 448, ref));
    const base: MenuCRow = { id: 'synthetic.whole', frame: 'dlgSynthetic.rdr', ref: 'ref.png', refSize: [640, 448], view: 'frame', pin: { score: 0 }, heldBy: 'this test' };
    const golden = readReference(base, new Uint8Array(readFileSync(join(root, 'ref.png'))));
    const j = scoreCRow(base, rgbaToRgb(640, 448, ref), golden);
    const row: MenuCRow = { ...base, pin: { score: j.score, control: j.control, matched: j.matched } };
    expect(pinnedOf(row, j)).toEqual(row.pin);
    return { root, frames, row };
  }

  it('a frame scoring the pinned digits passes; one that moves a digit fails, with its delta', () => {
    const { root, frames, row } = rig();
    try {
      write(frames, 'same', header('dlgSynthetic.rdr'), synthetic());
      write(frames, 'moved', header('dlgSynthetic.rdr', { blend: 'ff', run: 'dlgSynthetic.rdr@1x/opaque/ff' }), synthetic(40));
      const lines = compareFrames({ frames, root, rows: [row] });
      expect(lines.map((l) => [l.row, l.file, l.status])).toEqual([
        ['synthetic.whole', 'moved.gpu.rgba', 'fail'], ['synthetic.whole', 'same.gpu.rgba', 'pass'],
      ]);
      const fail = lines[0]!;
      expect(fail.got!.score).not.toBe(row.pin.score);
      expect(fail.delta!.score).toBeCloseTo(fail.got!.score - row.pin.score, 6);
      expect(lines[1]!.delta!.score).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('skips by name: no frame for the row, a frame at another scale or transparent, a missing reference, no SOCOM_PC_ROOT', () => {
    const { root, frames, row } = rig();
    try {
      write(frames, 'hd', header('dlgSynthetic.rdr', { scale: 2, width: 1280, height: 896, run: 'dlgSynthetic.rdr@2x/opaque/exact' }), new Uint8Array(1280 * 896 * 4));
      write(frames, 'clear', header('dlgSynthetic.rdr', { mode: 'transparent', run: 'dlgSynthetic.rdr@1x/transparent/exact' }), synthetic());
      const other: MenuCRow = { ...row, id: 'other.whole', frame: 'dlgOther.rdr' };
      const gone: MenuCRow = { ...row, id: 'gone.whole', ref: 'absent.png' };
      const lines = compareFrames({ frames, root, rows: [row, other, gone] });
      expect(lines.every((l) => l.status === 'skipped')).toBe(true);
      const why = lines.map((l) => `${l.row}: ${l.why}`);
      expect(why).toContain('synthetic.whole: clear.gpu.rgba: mode transparent -- the pinned rows score the opaque frame');
      expect(why).toContain('synthetic.whole: hd.gpu.rgba: scale 2 -- the pinned rows score scale 1');
      expect(why).toContain('other.whole: no frame file names dialog "dlgOther.rdr" at scale 1');
      expect(why).toContain('gone.whole: no reference absent.png under SOCOM_PC_ROOT');
      const none = compareFrames({ frames, root: null, rows: [row] });
      expect(none.map((l) => [l.status, l.why])).toEqual([['skipped', 'no SOCOM_PC_ROOT']]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('the command prints and writes the table, and exits 1 on a fail, 0 when nothing fails', async () => {
    const { root, frames, row } = rig();
    try {
      write(frames, 'same', header('dlgSynthetic.rdr'), synthetic());
      const outDir = scratch(), out = join(outDir, 'out'), said: string[] = [];   // outside the root (GM-11c review F2)
      const ok = await main(['--frames', frames, '--root', root, '--out', out], { rows: [row], log: (s) => said.push(s) });
      expect(ok).toBe(0);
      const table = JSON.parse(readFileSync(join(out, 'menu-gpu-compare.json'), 'utf8')) as { lines: { row: string; status: string }[] };
      expect(table.lines.map((l) => [l.row, l.status])).toEqual([['synthetic.whole', 'pass']]);
      expect(readFileSync(join(out, 'menu-gpu-compare.md'), 'utf8')).toBe(formatTable(compareFrames({ frames, root, rows: [row] })));
      expect(said.join('\n')).toMatch(/1 pass, 0 fail, 0 error, 0 skipped/);
      write(frames, 'moved', header('dlgSynthetic.rdr', { blend: 'ff' }), synthetic(40));
      expect(await main(['--frames', frames, '--root', root, '--out', out], { rows: [row], log: () => {} })).toBe(1);
      expect(await main([], { rows: [row], log: () => {} })).toBe(2);   // no --frames: the usage
      rmSync(outDir, { recursive: true, force: true });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('menu-gpu-compare: the review folds (GM-11c review findings 1-5; no data needed)', () => {
  function rig(): { root: string; frames: string; row: MenuCRow } {
    const root = scratch(), frames = join(root, 'frames');
    mkdirSync(frames);
    const ref = synthetic();
    writeFileSync(join(root, 'ref.png'), encodePng(640, 448, ref));
    const base: MenuCRow = { id: 'synthetic.whole', frame: 'dlgSynthetic.rdr', ref: 'ref.png', refSize: [640, 448], view: 'frame', pin: { score: 0 }, heldBy: 'this test' };
    const j = scoreCRow(base, rgbaToRgb(640, 448, ref), readReference(base, new Uint8Array(readFileSync(join(root, 'ref.png')))));
    return { root, frames, row: { ...base, pin: { score: j.score, control: j.control, matched: j.matched } } };
  }
  const quiet = { log: () => {} };
  const outs: string[] = [];
  const outside = (): string => { const d = scratch(); outs.push(d); return join(d, 'out'); };
  const clean = (root: string): void => { for (const d of [root, ...outs.splice(0)]) rmSync(d, { recursive: true, force: true }); };

  it('F1: a missing or empty --frames is a usage error (2); a run that scored nothing exits 3, never 0', async () => {
    const { root, frames, row } = rig();
    try {
      expect(MENU_GPU_COMPARE_EXIT).toEqual({ pass: 0, fail: 1, usage: 2, nothingScored: 3, error: 4 });
      expect(await main(['--frames', join(root, 'typo'), '--root', root, '--out', outside()], { rows: [row], ...quiet })).toBe(2);
      expect(await main(['--frames', frames, '--root', root, '--out', outside()], { rows: [row], ...quiet })).toBe(2);   // empty
      write(frames, 'other', header('dlgOther.rdr'), synthetic());
      const said: string[] = [];
      expect(await main(['--frames', frames, '--root', root, '--out', outside()], { rows: [row], log: (s) => said.push(s) })).toBe(3);
      expect(said.join('\n')).toMatch(/nothing scored: every row skipped -- not a pass \(exit 3\)/);
      expect(exitCode([])).toBe(3);
    } finally { clean(root); }
  });

  it('F2: an --out inside SOCOM_PC_ROOT is refused (2) and nothing is written there', async () => {
    const { root, frames, row } = rig();
    try {
      write(frames, 'same', header('dlgSynthetic.rdr'), synthetic());
      expect(await main(['--frames', frames, '--root', root, '--out', join(root, 'out')], { rows: [row], ...quiet })).toBe(2);
      expect(existsSync(join(root, 'out'))).toBe(false);
      expect(await main(['--frames', frames, '--root', root, '--out', root], { rows: [row], ...quiet })).toBe(2);
      expect(isInside(root, join(root, 'a', '..', 'b'))).toBe(true);
      expect(isInside(join(root, 'frames'), root)).toBe(false);
      expect(isInside(root, `${root}-sibling`)).toBe(false);
    } finally { clean(root); }
  });

  it('F3: a wrong-size reference and a truncated frame are error lines (exit 4), not fails', async () => {
    const { root, frames, row } = rig();
    try {
      const good = encodeFrameFile(header('dlgSynthetic.rdr'), synthetic());
      writeFileSync(join(frames, 'cut.gpu.rgba'), good.subarray(0, good.length - 100));
      const lines = compareFrames({ frames, root, rows: [row] });
      expect(lines.map((l) => [l.row, l.file, l.status])).toEqual([['synthetic.whole', 'cut.gpu.rgba', 'error']]);
      expect(lines[0]!.why).toMatch(/^cut\.gpu\.rgba: decodeFrameFile: /);
      expect(await main(['--frames', frames, '--root', root, '--out', outside()], { rows: [row], ...quiet })).toBe(4);
      const sized: MenuCRow = { ...row, refSize: [320, 224] };
      write(frames, 'same', header('dlgSynthetic.rdr'), synthetic());
      const bad = compareFrames({ frames, root, rows: [sized] });
      expect(bad.map((l) => [l.status, l.why])).toEqual([['error', 'reference: ref.png: 640 x 448, the row pins 320 x 224']]);
      write(frames, 'moved', header('dlgSynthetic.rdr', { blend: 'ff' }), synthetic(40));
      expect(exitCode(compareFrames({ frames, root, rows: [row] }))).toBe(1);   // a fail outranks an error
    } finally { clean(root); }
  });

  it('F4: a frame file whose header cannot be read is a line by name, not dropped', () => {
    const { root, frames, row } = rig();
    try {
      write(frames, 'same', header('dlgSynthetic.rdr'), synthetic());
      writeFileSync(join(frames, 'json.gpu.rgba'), new TextEncoder().encode('{not json\n'));
      writeFileSync(join(frames, 'long.gpu.rgba'), new Uint8Array(5000).fill(32));
      writeFileSync(join(frames, 'other.gpu.rgba'), new TextEncoder().encode('{"format":"x"}\n'));
      const lines = compareFrames({ frames, root, rows: [row] });
      const files = lines.filter((l) => l.row === FRAME_FILE_LINE);
      expect(files.map((l) => [l.file, l.status])).toEqual([['json.gpu.rgba', 'error'], ['long.gpu.rgba', 'error'], ['other.gpu.rgba', 'error']]);
      expect(files[0]!.why).toMatch(/^unreadable frame file: header is not JSON/);
      expect(files[1]!.why).toBe('unreadable frame file: no header line in the first 4096 bytes');
      expect(files[2]!.why).toBe('unreadable frame file: format "x", not s2u-ui-frame/1');
      expect(lines.find((l) => l.row === 'synthetic.whole')!.status).toBe('pass');
      expect(exitCode(lines)).toBe(4);
      expect(formatTable(lines)).toMatch(/1 pass, 0 fail, 3 error, 0 skipped/);
    } finally { clean(root); }
  });

  it('F5: the frame names a writer must emit are one exported list, the rows\' own', () => {
    expect([...MENU_C_FRAMES]).toEqual(['dlgMenu.rdr', 'dlgMenu.rdr hide LoadGameBack', 'dlgCreateGame.rdr']);
    expect([...new Set(MENU_C_ROWS.map((r) => r.frame))]).toEqual([...MENU_C_FRAMES]);
    for (const f of MENU_C_FRAMES) expect(parseFrameName(f).dialog).toMatch(/\.rdr$/);
  });
});

describe.skipIf(!ready)(`menu-gpu-compare on a software frame file: every pinned row of the table reproduced${ready ? '' : ' -- skipped: no disc or no SOCOM_PC_ROOT references'}`, () => {
  it('dlgMenu, dlgMenu without LoadGameBack and dlgCreateGame, drawn by the reference path and written as frame files', async () => {
    const frames = scratch();
    try {
      const names = [...new Set(MENU_C_ROWS.map((r) => r.frame))];
      expect(names).toEqual([...MENU_C_FRAMES]);
      for (const [k, name] of names.entries()) {
        const { dialog, hide } = parseFrameName(name);
        const drawn = await drawDialog(DISC!, dialog);
        write(frames, `f${k}`, header(name), hide ? drawn.hideRgba(hide) : drawn.rgba);
      }
      const lines = compareFrames({ frames, root: ROOT, rows: MENU_C_ROWS });
      expect(lines.map((l) => [l.row, l.status, l.why])).toEqual(MENU_C_ROWS.map((r) => [r.id, 'pass', '']));
      for (const l of lines) expect(l.got).toEqual(MENU_C_ROWS.find((r) => r.id === l.row)!.pin);
    } finally { rmSync(frames, { recursive: true, force: true }); }
  });
});
