import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import { loadingFromDisc, type LoadingScreen } from '../src/loadingAssets';
import { loadingFaderAlpha } from '@s2u/ui/loading';
import { loadingQuads } from '../src/loadingLayout';
import { LoadingPanel } from '../src/loadingPanel';

/**
 * GM-22, the reading step (research 380 §4, `LOADING_PANEL_ALPHA_CLAMP_READING`): the loading panel draws each quad
 * with Canvas 2D at `globalAlpha = min(1, alpha / 128)` -- a clamp at 128 -- where the menus' compositor takes the
 * alpha as it stands (`UI_QUAD_ALPHA_RANGE_READING`, P8-P10). The original draws the loading screen through the menus'
 * own path (LoadState's Tick `FUN_001f5e70` D:L55769 -> `FUN_003691c0` -> the walker `FUN_00336c10(0x4887c0, ...)`), so
 * the clamp is a reading the citation contradicts, kept (owner default O5) until the review settles it. These tests
 * hold three things: the note files the reading with its citation; today's clamp, pinned through the panel; and that
 * on the disc's own `dlgLoad.rdr` no quad ever reaches the clamp (so no pixel of the shipped screen depends on it).
 */

const repo = resolve(import.meta.dirname, '../../..');
const NOTE = join(repo, 'docs', 'research', '380-the-gpu-menu-drawer.md');

describe('research 380 §4 files the loading panel\'s alpha clamp', () => {
  it('lists LOADING_PANEL_ALPHA_CLAMP_READING, note only, with the original\'s draw path cited', () => {
    const note = readFileSync(NOTE, 'utf8');
    const s4 = note.slice(note.indexOf('## 4.'), note.indexOf('## 5.'));
    const row = s4.split('\n').find((l) => l.startsWith('| `LOADING_PANEL_ALPHA_CLAMP_READING`'));
    expect(row, 'no §4 row for LOADING_PANEL_ALPHA_CLAMP_READING').toBeDefined();
    const cells = row!.split(' | ');
    expect(cells[cells.length - 1]).toMatch(/note only/);
    for (const cite of ['FUN_001f5e70', 'D:L55769', 'FUN_003691c0', 'FUN_00336c10', 'FUN_00369b60', 'FUN_00368570']) {
      expect(row, cite).toContain(cite);
    }
  });
});

// Today's clamp, pinned: a face whose opacity puts its glyphs over 128 (192) is drawn at globalAlpha 1, not 1.5.
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

/** The panel's main canvas's `globalAlpha` at each glyph draw (the font's 256 x 32 bitmap). */
function glyphAlphas(s: LoadingScreen): number[] {
  const out: number[] = [];
  let n = 0;
  const make = (tag: string): unknown => {
    if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
    const c = { id: n++, width: 300, height: 150, style: {}, append() {}, getContext: () => ctx };
    const ctx = {
      globalAlpha: 1, fillStyle: '',
      fillRect() {}, setTransform() {}, putImageData() {},
      drawImage(img: { width: number }) { if (c.id === 0 && img.width === 256) out.push(ctx.globalAlpha); },
    };
    return c;
  };
  const panel = new LoadingPanel({ createElement: make, body: { append() {} } } as unknown as Document);
  panel.show(s);
  return out;
}

class FakeImageData { data: Uint8ClampedArray; constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); } }
const had = (globalThis as { ImageData?: unknown }).ImageData;
beforeAll(() => { (globalThis as { ImageData?: unknown }).ImageData = FakeImageData; });
afterAll(() => { (globalThis as { ImageData?: unknown }).ImageData = had; });

describe('LOADING_PANEL_ALPHA_CLAMP_READING: today\'s clamp, unchanged (owner default O5)', () => {
  it('a glyph at alpha 192 is drawn at globalAlpha 1 (the clamp); one at 89.6 at 0.7 (under it, as the compositor)', () => {
    const sizes = { 'littleblack.tif': { width: 8, height: 8 }, 'font_text_01.tif': { width: 256, height: 32 } };
    const over = screen(1.5);
    const quads = loadingQuads({ screen: over, sizes, t: 0 }).filter((q) => q.texture === 'font_text_01.tif');
    expect(quads.map((q) => q.alpha)).toEqual([192, 192]);                // over 128: the compositor would blend at 1.5
    expect(glyphAlphas(over)).toEqual([1, 1]);                            // the panel clamps it: min(1, 192 / 128)
    expect(glyphAlphas(screen(0.7)).map((a) => +a.toFixed(6))).toEqual([0.7, 0.7]);
  });
});

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP72.ZDB'));
const MAPS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83];

describe.skipIf(!HAVE)(`the disc's dlgLoad.rdr never reaches the clamp${HAVE ? '' : ' (no SOCOM_DISC)'}`, () => {
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
        // The fader too (loadingPanel.ts L195-L197), as drawn under LOADING_FADE_READING. The load state writes it as
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
