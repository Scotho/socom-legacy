import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENU_C_FRAMES, MENU_C_ROWS } from '../../../tools/test/menuCaptureScore';
import { parseFrameName } from '../../../tools/test/menuCaptureFrames';
import {
  UI_GPU_MENU_FRAMES_DEFAULT_BLENDS, drawDialogMatchFailures, gpuFrameFailures, menuFrameEntries, menuFrameFileName, menuFrameHeader, menuFramePages, menuFrameParts,
  menuFramesDiscCandidates, menuFramesEnv, menuFramesJudgedBlend, menuFramesUnjudged, menuFramesVerdict, menuFrameUrl, type MenuFrameLevels,
} from '../e2e/uiGpuMenuFramesRecord';
import { decodeFrameFile, encodeFrameFile } from '../e2e/uiGpuParityRecord';

/**
 * GM-31 leg 1 (the GPU menus plan, row GM-31): the pure half of `e2e/uiGpuMenuFrames.spec.ts` -- which frames it writes
 * (GM-11c's `MENU_C_FRAMES`, exactly), under which names, from which page, and what its verdicts are. A test instrument
 * (product track). Evidence kind: unit test.
 */

const WEB = join(tmpdir(), 'gm31-web');
const LV = (l: Partial<MenuFrameLevels> = {}): MenuFrameLevels => ({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, ...l });

describe('GM-31: the menus\' C-row frame names', () => {
  it('splits every MENU_C_FRAMES name as GM-11c\'s parseFrameName does (the dialog, the node hidden)', () => {
    for (const f of MENU_C_FRAMES) expect(menuFrameParts(f), f).toEqual(parseFrameName(f));
    expect(() => menuFrameParts('dlgMenu.rdr hide')).toThrow();
  });

  it('one entry per MENU_C_FRAMES name, in its order, the header\'s dialog the name itself; every row\'s frame among them', () => {
    const e = menuFrameEntries();
    expect(e.map((x) => x.frame)).toEqual([...MENU_C_FRAMES]);
    expect(e).toEqual([
      { frame: 'dlgMenu.rdr', dialog: 'dlgMenu.rdr', hide: null, stem: 'dlgMenu.rdr' },
      { frame: 'dlgMenu.rdr hide LoadGameBack', dialog: 'dlgMenu.rdr', hide: 'LoadGameBack', stem: 'dlgMenu.rdr_hide_LoadGameBack' },
      { frame: 'dlgCreateGame.rdr', dialog: 'dlgCreateGame.rdr', hide: null, stem: 'dlgCreateGame.rdr' },
    ]);
    for (const r of MENU_C_ROWS) expect(e.some((x) => x.frame === r.frame), r.id).toBe(true);
  });

  it('one page per dialog: dlgMenu draws two frames (as built, LoadGameBack hidden), dlgCreateGame one', () => {
    expect(menuFramePages(menuFrameEntries()).map((p) => [p.dialog, p.frames.map((f) => f.frame)])).toEqual([
      ['dlgMenu.rdr', ['dlgMenu.rdr', 'dlgMenu.rdr hide LoadGameBack']],
      ['dlgCreateGame.rdr', ['dlgCreateGame.rdr']],
    ]);
  });

  it('a file name per frame, blend and drawer, all distinct, each a *.rgba the compare tool reads', () => {
    const names = menuFrameEntries().flatMap((e) => (['exact', 'ff'] as const).flatMap((b) => (['gpu', 'cpu'] as const).map((w) => menuFrameFileName(e.stem, b, w))));
    expect(new Set(names).size).toBe(12);
    expect(names.every((n) => n.endsWith('.rgba') && !/[\s/\\]/.test(n))).toBe(true);
    expect(menuFrameFileName('dlgMenu.rdr_hide_LoadGameBack', 'ff', 'gpu')).toBe('dlgMenu.rdr_hide_LoadGameBack.ff.gpu.rgba');
  });

  it('the header names the frame exactly, at scale 1, opaque, 640 x 448; it survives the frame file', () => {
    const e = menuFrameEntries()[1]!;
    const h = menuFrameHeader(e, { blend: 'exact', which: 'gpu', path: 'gpu', renderer: 'R' });
    expect(h).toEqual({ dialog: 'dlgMenu.rdr hide LoadGameBack', run: 'dlgMenu.rdr hide LoadGameBack/exact', scale: 1, mode: 'opaque', blend: 'exact', which: 'gpu', width: 640, height: 448, renderer: 'R', path: 'gpu' });
    const back = decodeFrameFile(encodeFrameFile(h, new Uint8Array(640 * 448 * 4)));
    expect(back.header.dialog).toBe(MENU_C_FRAMES[1]);
  });
});

describe('GM-31: the page and the env', () => {
  it('the GPU leg opens the front end with the GPU surface for front, the software adapter allowed and the blend; the software leg with uiGpu=off; scale 1, the deep link last', () => {
    expect(menuFrameUrl('dlgMenu.rdr', 'gpu', 'ff')).toBe('/setup?devmode&hdMenuScale=1&uiGpu=on&uiGpuSurface=front&uiGpuAllowSoftwareAdapter=1&uiGpuBlend=ff&menuflow=dlgMenu.rdr');
    expect(menuFrameUrl('dlgCreateGame.rdr', 'software', 'exact')).toBe('/setup?devmode&hdMenuScale=1&uiGpu=off&menuflow=dlgCreateGame.rdr');
  });

  it('runs on demand only: no out directory, no run; blends default exact and ff; a test-results out refused; an unknown blend refused', () => {
    expect(menuFramesEnv({}, WEB)).toEqual({ out: null, blends: ['exact', 'ff'], root: null });
    expect(UI_GPU_MENU_FRAMES_DEFAULT_BLENDS).toEqual(['exact', 'ff']);
    expect(menuFramesEnv({ S2U_UI_GPU_MENU_FRAMES_OUT: 'D:/f', S2U_UI_GPU_MENU_FRAMES_BLENDS: ' ff ', SOCOM_PC_ROOT: 'C:/pc' }, WEB)).toEqual({ out: 'D:/f', blends: ['ff'], root: 'C:/pc' });
    expect(() => menuFramesEnv({ S2U_UI_GPU_MENU_FRAMES_OUT: join(WEB, 'test-results', 'x') }, WEB)).toThrow(/test-results/);
    expect(() => menuFramesEnv({ S2U_UI_GPU_MENU_FRAMES_OUT: 'D:/f', S2U_UI_GPU_MENU_FRAMES_BLENDS: 'exact,soft' }, WEB)).toThrow(/soft/);
  });
});

describe('GM-31: the verdicts', () => {
  const ok = { presenter: 'gpu-surface', path: 'gpu' as const, why: [], before: LV({ L0: 7 }), after: LV({ L0: 8 }), width: 640, height: 448 };

  it('a GPU frame passes only from the surface\'s L0 path: one L0 frame counted by its present, no L1-L4, 640 x 448', () => {
    expect(gpuFrameFailures(ok)).toEqual([]);
    expect(gpuFrameFailures({ ...ok, path: 'software', why: ['textures uploading (2)'], after: LV({ L0: 7, L1: 1 }) })).toEqual([
      'path software, not gpu (textures uploading (2))', 'L0 +0, not +1', 'L1 +1',
    ]);
    expect(gpuFrameFailures({ ...ok, after: LV({ L0: 7, L4: 1 }) })).toEqual(['L0 +0, not +1', 'L4 +1']);
    expect(gpuFrameFailures({ ...ok, presenter: 'cpu' })).toEqual(['the presenter is cpu, not the GPU surface']);
    expect(gpuFrameFailures({ ...ok, before: null })).toEqual(['no window.__uiGpu read-out']);
    expect(gpuFrameFailures({ ...ok, width: 1280, height: 896 })).toEqual(['1280 x 896, not 640 x 448 (scale 1)']);
  });

  const line = (row: string, which: 'gpu' | 'cpu', status: 'pass' | 'fail' | 'skipped' | 'error', why = '') => ({ row, which, status, why });
  const allPass = MENU_C_ROWS.flatMap((r) => [line(r.id, 'gpu', 'pass'), line(r.id, 'cpu', 'pass')]);

  it('the score passes on exit 0 with every row passed on a GPU frame and on the software frame', () => {
    expect(menuFramesVerdict(0, allPass)).toEqual([]);
  });

  it('fails on every other exit, by name -- 3 (nothing scored) included -- and names each line not passed', () => {
    expect(menuFramesVerdict(3, MENU_C_ROWS.map((r) => line(r.id, null as unknown as 'gpu', 'skipped', 'no SOCOM_PC_ROOT')))[0]).toBe('menu-gpu-compare exit 3 (nothing scored), not 0');
    expect(menuFramesVerdict(1, [...allPass.slice(1), line(MENU_C_ROWS[0]!.id, 'gpu', 'fail', 'pinned 95.8, got 95.7')])).toEqual([
      'menu-gpu-compare exit 1 (fail), not 0', `${MENU_C_ROWS[0]!.id} (gpu): fail: pinned 95.8, got 95.7`, `${MENU_C_ROWS[0]!.id}: no GPU frame passed`,
    ]);
    expect(menuFramesVerdict(4, [...allPass, line('(frame file)', null as unknown as 'gpu', 'error', 'unreadable')])).toEqual([
      'menu-gpu-compare exit 4 (error), not 0', '(frame file) (-): error: unreadable',
    ]);
  });

  it('exit 0 with a row scored on the software frame only (its GPU frame missing) is still a failure', () => {
    const lines = allPass.filter((l) => !(l.row === MENU_C_ROWS[8]!.id && l.which === 'gpu'));
    expect(menuFramesVerdict(0, lines)).toEqual([`${MENU_C_ROWS[8]!.id}: no GPU frame passed`]);
    const noCpu = allPass.filter((l) => !(l.row === MENU_C_ROWS[2]!.id && l.which === 'cpu'));
    expect(menuFramesVerdict(0, noCpu)).toEqual([`${MENU_C_ROWS[2]!.id}: no software frame passed`]);
  });

  // The 4070 evidence run's finding 2: dlgMenu.main_menu.no_LoadGameBack failed on the ff GPU frame at scale 1 (79.6 vs
  // the pinned 79.4) while the exact frame scored 79.4 -- and players draw scale 1 with exact (UI_GPU_BLEND_ADAPTATION,
  // GM.R6). The rows are judged on the landed blend at the frames' scale; the other blend's GPU frames recorded unjudged.
  const blended = (row: string, which: 'gpu' | 'cpu', blend: 'exact' | 'ff', status: 'pass' | 'fail' = 'pass', why = '') => ({ row, which, status, why, blend });
  const both = MENU_C_ROWS.flatMap((r) => [blended(r.id, 'gpu', 'exact'), blended(r.id, 'gpu', 'ff'), blended(r.id, 'cpu', 'exact'), blended(r.id, 'cpu', 'ff')]);
  const ROW = MENU_C_ROWS[0]!.id;

  it('the judged blend is the landed blend table: exact at scale 1, ff at HD', () => {
    expect(menuFramesJudgedBlend(1)).toBe('exact');
    expect(menuFramesJudgedBlend(2)).toBe('ff');
    expect(menuFramesJudgedBlend(4)).toBe('ff');
  });

  it('an ff GPU frame failing at scale 1 is not judged (exit 1 from it alone passes) and is recorded, labelled', () => {
    const lines = both.map((l) => (l.row === ROW && l.which === 'gpu' && l.blend === 'ff' ? blended(ROW, 'gpu', 'ff', 'fail', 'pinned 79.4, got 79.6') : l));
    expect(menuFramesVerdict(1, lines)).toEqual([]);
    expect(menuFramesUnjudged(lines).find((t) => t.startsWith(`${ROW} (gpu, ff): fail`))).toBe(`${ROW} (gpu, ff): fail: pinned 79.4, got 79.6 -- unjudged: players draw exact at 1x`);
    expect(menuFramesUnjudged(lines)).toHaveLength(MENU_C_ROWS.length);      // every ff GPU line recorded, passing or not
  });

  it('the exact GPU frame failing at scale 1 is judged: the row fails, even with its ff frame passing', () => {
    const lines = both.map((l) => (l.row === ROW && l.which === 'gpu' && l.blend === 'exact' ? blended(ROW, 'gpu', 'exact', 'fail', 'pinned 79.4, got 79.6') : l));
    expect(menuFramesVerdict(1, lines)).toEqual(['menu-gpu-compare exit 1 (fail), not 0', `${ROW} (gpu): fail: pinned 79.4, got 79.6`, `${ROW}: no GPU frame passed`]);
  });

  it('at an HD scale the judged blend is ff, the exact frame the unjudged one', () => {
    const lines = both.map((l) => (l.row === ROW && l.which === 'gpu' && l.blend === 'exact' ? blended(ROW, 'gpu', 'exact', 'fail', 'x') : l));
    expect(menuFramesVerdict(1, lines, MENU_C_ROWS, 2)).toEqual([]);
    expect(menuFramesUnjudged(lines, 2)[0]).toMatch(/\(gpu, exact\).*unjudged: players draw ff at 2x/);
  });
});

describe("GM-31 review F1: the page's software frame against drawDialog's, drawn in Node", () => {
  const frame = (fill = 0): Uint8Array => new Uint8Array(640 * 448 * 4).fill(fill);

  it('equal bytes and equal undrawn lists: no failure; a hidden-node frame (undrawn null) compares bytes only', () => {
    expect(drawDialogMatchFailures({ rgba: frame(), undrawn: ['a.tif'] }, { rgba: frame(), undrawn: ['a.tif'] })).toEqual([]);
    expect(drawDialogMatchFailures({ rgba: frame(), undrawn: ['a.tif'] }, { rgba: frame(), undrawn: null })).toEqual([]);
  });

  it('names the bytes differing and the first pixel, as x,y', () => {
    const b = frame();
    b[(10 * 640 + 3) * 4 + 1] = 9;
    b[(20 * 640 + 7) * 4] = 9;
    expect(drawDialogMatchFailures({ rgba: frame(), undrawn: [] }, { rgba: b, undrawn: [] })).toEqual(["page frame is not drawDialog's: 2 bytes, first at 3,10"]);
  });

  it('a frame of another length, and a different undrawn list, each named', () => {
    expect(drawDialogMatchFailures({ rgba: new Uint8Array(8), undrawn: ['x'] }, { rgba: frame(), undrawn: [] })).toEqual([
      `page frame is not drawDialog's: 8 bytes against ${640 * 448 * 4}`, 'undrawn differs: page ["x"], drawDialog []',
    ]);
  });

  it('the disc drawDialog reads: SOCOM_DISC first, then <SOCOM_PC_ROOT>/game/disc; neither, none', () => {
    expect(menuFramesDiscCandidates({})).toEqual([]);
    expect(menuFramesDiscCandidates({ SOCOM_DISC: 'E:/disc', SOCOM_PC_ROOT: '/pc' })).toEqual(['E:/disc', join(resolve('/pc'), 'game', 'disc')]);
    expect(menuFramesDiscCandidates({ SOCOM_DISC: ' ', SOCOM_PC_ROOT: '/pc' })).toEqual([resolve('/pc', 'game/disc')]);
  });
});
