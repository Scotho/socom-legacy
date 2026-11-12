import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import { loadingFromDisc, type LoadingScreen } from '../src/loadingAssets';
import { loadingFaderAlpha } from '@s2u/ui/loading';
import { loadingQuads } from '../src/loadingLayout';
import { LoadingPanel, loadingDrawList } from '../src/loadingPanel';
import { rasterizeUiDrawList, type UiTextures } from '../src/uiCompositorView';

/**
 * GM-22 (research 380 §4, `LOADING_PANEL_ALPHA_CLAMP_READING`). The reading step (2026-11-01): the loading panel drew
 * each quad with Canvas 2D at `globalAlpha = min(1, alpha / 128)` -- a clamp at 128 -- where the menus' compositor takes
 * the alpha as it stands (`UI_QUAD_ALPHA_RANGE_READING`, P8-P10); the original draws the loading screen through the
 * menus' own path (LoadState's Tick `FUN_001f5e70` D:L55769 -> `FUN_003691c0` -> the walker `FUN_00336c10(0x4887c0, ...)`),
 * so the clamp was a reading the citation contradicts, kept (owner default O5, H378) until the code step. The code step
 * (2026-11-09) removed it: the panel draws its quads through the menus' compositor. These tests hold three things: the
 * note files the reading with its citation and the code step; no clamp, through the panel (re-pinned from "today's
 * clamp" by the code step); and that on the disc's own `dlgLoad.rdr` no quad ever reaches 128 (so no pixel of the
 * shipped screen moved with the clamp's removal).
 */

const repo = resolve(import.meta.dirname, '../../..');
const NOTE = join(repo, 'docs', 'research', '380-the-gpu-menu-drawer.md');

describe('research 380 §4 files the loading panel\'s alpha clamp', () => {
  it('lists LOADING_PANEL_ALPHA_CLAMP_READING, the clamp removed by the code step, with the original\'s draw path cited', () => {
    const note = readFileSync(NOTE, 'utf8');
    const s4 = note.slice(note.indexOf('## 4.'), note.indexOf('## 5.'));
    const row = s4.split('\n').find((l) => l.startsWith('| `LOADING_PANEL_ALPHA_CLAMP_READING`'));
    expect(row, 'no §4 row for LOADING_PANEL_ALPHA_CLAMP_READING').toBeDefined();
    const cells = row!.split(' | ');
    // GM-22's code step: the clamp is gone from the code (the ledger reads "removed" as retired), the proof owed named.
    expect(cells[cells.length - 1]).toMatch(/removed/);
    expect(cells[cells.length - 1]).toMatch(/A_ready012\.png/);
    for (const cite of ['FUN_001f5e70', 'D:L55769', 'FUN_003691c0', 'FUN_00336c10', 'FUN_00369b60', 'FUN_00368570']) {
      expect(row, cite).toContain(cite);
    }
  });
});

// No clamp (the code step): a face whose opacity puts its glyphs over 128 (192) is blended at 1.5, not 1.
const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['COLOR', ['14', '57', '65'], 'SCALE', ['1.2'], 'UIVAR', ['NAME', ['mission_title']]]),
    ],
  ],
]]);
function face(opacity: number): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}
const solid = (w: number, h: number): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const screen = (opacity: number): LoadingScreen => ({
  map: 'RUN/MP2.ZDB', layout, libraries: [], spin: null, fade: null, fonts: [face(opacity)], unheld: [], missing: [],
  binding: { title: 'AB', description: ' ', picture: '', library: '', stem: '', vars: new Map([['mission_title', 'AB']]) },
  strings: [], bitmaps: [['littleblack.tif', solid(8, 8)], ['font_text_01.tif', solid(256, 32)]],
});

/** The frame the panel puts on its canvas at `t` seconds after its show (the fake canvas records each put). */
function panelFrame(s: LoadingScreen, t: number): Uint8ClampedArray {
  const clock = { now: 0 };
  let put: Uint8ClampedArray | null = null;
  let n = 0;
  const make = (tag: string): unknown => {
    if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
    const main = n++ === 0;
    const ctx = {
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (d: { data: Uint8ClampedArray }) => { if (main) put = d.data.slice(); },
    };
    return { width: 300, height: 150, style: {}, append() {}, getContext: () => ctx };
  };
  const panel = new LoadingPanel({ createElement: make, body: { append() {} }, defaultView: { performance: { now: () => clock.now } } } as unknown as Document);
  panel.show(s);
  clock.now = t * 1000;
  panel.redraw();
  if (!put) throw new Error('the panel put no frame');
  return put;
}

describe('LOADING_PANEL_ALPHA_CLAMP_READING: the clamp removed (GM-22\'s code step), the alpha as it stands', () => {
  it('a glyph at alpha 192 is blended at 1.5 (the compositor\'s P8-P10), not at the clamp\'s 1; the panel holds no clamp', () => {
    const sizes = { 'littleblack.tif': { width: 8, height: 8 }, 'font_text_01.tif': { width: 256, height: 32 } };
    const over = screen(1.5);
    const t = 1;                                                           // past the load state's fade from black
    const quads = loadingQuads({ screen: over, sizes, t });
    expect(quads.filter((q) => q.texture === 'font_text_01.tif').map((q) => q.alpha)).toEqual([192, 192]);
    const textures: UiTextures = (name) => new Map(over.bitmaps).get(name) ?? null;
    const asItStands = rasterizeUiDrawList(loadingDrawList(quads, sizes, loadingFaderAlpha(null, t)), textures).frame.data;
    const clamped = rasterizeUiDrawList(loadingDrawList(quads.map((q) => ({ ...q, alpha: Math.min(128, q.alpha) })), sizes, 0), textures).frame.data;
    const frame = panelFrame(over, t);
    expect(frame.every((v, i) => v === asItStands[i])).toBe(true);
    expect(frame.some((v, i) => v !== clamped[i])).toBe(true);             // the clamp would have drawn another frame
    // Source inspection, pinned: the Canvas 2D path and its clamp are gone from the panel.
    const src = readFileSync(resolve(import.meta.dirname, '../src/loadingPanel.ts'), 'utf8');
    expect(src).not.toMatch(/globalAlpha/);
    expect(src).not.toMatch(/drawImage/);
  });
});

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP72.ZDB'));
const MAPS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83];

describe.skipIf(!HAVE)(`the disc's dlgLoad.rdr never reaches 128, where the clamp acted${HAVE ? '' : ' (no SOCOM_DISC)'}`, () => {
  it('on every MP map, over a whole spin, every loading quad\'s alpha, and the fader\'s, is at most 128', async () => {
    const src = new FsAssetSource(DISC as string);
    const seen: string[] = [];
    let top = 0;
    let faders = 0, fadeTop = 0;
    for (const m of MAPS) {
      const s = await loadingFromDisc(src, `RUN/MP${m}.ZDB`);
      expect(s.layout, `MP${m}`).not.toBeNull();
      const sizes = Object.fromEntries(s.bitmaps.map(([n, r]) => [n, { width: r.width, height: r.height }]));
      let quads = 0;
      for (let k = 0; k <= 30; k++) {
        for (const q of loadingQuads({ screen: s, sizes, t: k * 0.05 })) { quads++; top = Math.max(top, q.alpha); }
        // The fader too (`loadingDrawList`'s MENUFADER quad), as drawn under LOADING_FADE_READING. The load state writes it as
        // (1 - f) * 128 with f held to 0..1 (D:L55675, D:L55762): that bound is source inspection; this samples ours.
        const f = loadingFaderAlpha(s.fade, k * 0.05);
        faders++; fadeTop = Math.max(fadeTop, f);
      }
      expect(quads, `MP${m}`).toBeGreaterThan(0);
      seen.push(`MP${m}`);
    }
    expect(seen).toHaveLength(22);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThanOrEqual(128);
    expect(faders).toBe(22 * 31);
    expect(fadeTop).toBeGreaterThan(0);
    expect(fadeTop).toBeLessThanOrEqual(128);
  }, 120_000);
});
