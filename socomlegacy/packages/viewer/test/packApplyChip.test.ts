// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUD_LAYOUT, hudChipDrawer, setHudChipDrawer, WHITE, type HudQuad } from '../src/hud';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import {
  drawPackApplyChip, feedPackApplyChip, PACK_APPLY_CHIP_ADAPTATION, PACK_APPLY_CHIP_LAYOUT, PACK_APPLY_CHIP_TEXT, packApplyChipNow,
  packApplyChipWords, packApplyCount,
} from '../src/packApplyChip';
import { PackApplyOverlay, type PackApplyProgress } from '../src/packApplyOverlay';

/**
 * WM-PACKS-CHIP (product track; a browser adaptation with no original, `PACK_APPLY_CHIP_ADAPTATION`): the owner's 8B
 * loading chip -- "LOADING HD TEXTURES 1,326 of 3,900" over a thin bar -- drawn by the match's HUD on layer 1 from the
 * START confirm's and the scoreboard's primitives, anchored to the frame's right edge and clear of the compass ring;
 * out of a match the page's DOM overlay draws the same chip in the corner, never a full-screen hold.
 */
const sizes = { [WHITE]: { width: 1, height: 1 }, [FONT_TEXT_01.texture]: { width: 512, height: 128 } };
const ps2 = { width: 640, height: 448 };
const wide = { width: 1920 * 448 / 1080, height: 448 };
const hd1080 = { width: 1920, height: 1080 };
const staged: PackApplyProgress = { name: 'SOCOM II HD', applied: 1326, total: 3900, done: false, refused: null };
const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (p: string): string => readFileSync(resolve(src, p), 'utf8');
afterEach(() => { document.body.replaceChildren(); document.head.replaceChildren(); });

/** The compass ring's square on a frame: `compass_lo.tif` centred on (565, 90), 96 wide, right-anchored as the HUD draws it. */
function compassBox(f: { width: number; height: number }): { x0: number; y0: number; x1: number; y1: number } {
  const s = f.height / 448, K = HUD_LAYOUT.compass, R = (x: number): number => f.width - (640 - x) * s;
  return { x0: R(K.cx - K.size / 2), y0: (K.cy - K.size / 2) * s, x1: R(K.cx + K.size / 2), y1: (K.cy + K.size / 2) * s };
}
const meets = (q: HudQuad, b: { x0: number; y0: number; x1: number; y1: number }): boolean =>
  q.x + q.w / 2 > b.x0 && q.x - q.w / 2 < b.x1 && q.y + q.h / 2 > b.y0 && q.y - q.h / 2 < b.y1;

describe('WM-PACKS-CHIP: the chip\'s words', () => {
  it('is labelled as an adaptation', () => { expect(PACK_APPLY_CHIP_ADAPTATION).toMatch(/adaptation/i); });
  it('counts with thousands separators: 1,326 of 3,900', () => {
    expect(packApplyCount(1326, 3900)).toBe('1,326 of 3,900');
    expect(packApplyCount(7, 12)).toBe('7 of 12');
    expect(packApplyCount(1234567, 2000000)).toBe('1,234,567 of 2,000,000');
  });
  it('says LOADING HD TEXTURES for the HD pack and LOADING TEXTURES for a GX pack', () => {
    expect(PACK_APPLY_CHIP_TEXT.hd).toBe('LOADING HD TEXTURES');
    expect(PACK_APPLY_CHIP_TEXT.other).toBe('LOADING TEXTURES');
    expect(packApplyChipWords(staged, 'hd')).toEqual({ title: 'LOADING HD TEXTURES', line: '1,326 of 3,900' });
    expect(packApplyChipWords(staged, 'gx')).toEqual({ title: 'LOADING TEXTURES', line: '1,326 of 3,900' });
    expect(packApplyChipWords({ ...staged, applied: 0, total: 0 }, 'hd').line).toBe('');
    expect(packApplyChipWords({ ...staged, done: true, refused: 'the HD pack is not installed' }, 'hd').line).toBe('SOCOM II HD: not applied -- the HD pack is not installed');
  });
  it('the title fits inside the chip at its scale', () => {
    const C = PACK_APPLY_CHIP_LAYOUT;
    expect(textWidth(PACK_APPLY_CHIP_TEXT.hd, C.scale)).toBeLessThanOrEqual(C.x1 - C.x0 - 2 * C.padX);
  });
});

describe('WM-PACKS-CHIP: the HUD\'s chip', () => {
  it('draws nothing without a progress, nor once done', () => {
    expect(drawPackApplyChip(ps2, sizes, null)).toEqual([]);
    expect(drawPackApplyChip(ps2, sizes, { progress: { ...staged, done: true, applied: 3900 }, kind: 'hd' })).toEqual([]);
  });
  it('draws untextured boxes and font_text_01 glyphs, all on layer 1', () => {
    const quads = drawPackApplyChip(ps2, sizes, { progress: staged, kind: 'hd' });
    expect(quads.length).toBeGreaterThan(10);
    expect(new Set(quads.map((q) => q.texture))).toEqual(new Set([WHITE, FONT_TEXT_01.texture]));
    expect(quads.every((q) => q.layer === 1 && q.element === 'packChip')).toBe(true);
  });
  it('is anchored to the frame\'s right edge at any width', () => {
    const right = (f: { width: number; height: number }): number => Math.max(...drawPackApplyChip(f, sizes, { progress: staged, kind: 'hd' }).map((q) => q.x + q.w / 2));
    const margin = 640 - PACK_APPLY_CHIP_LAYOUT.x1;
    expect(right(ps2)).toBeCloseTo(640 - margin, 5);
    expect(right(wide)).toBeCloseTo(wide.width - margin, 5);
    expect(right(hd1080)).toBeCloseTo(1920 - margin * 1080 / 448, 5);
  });
  it('no quad of it meets the compass ring\'s square, at 640x448, at a wide frame and at 1920x1080 (refused too)', () => {
    for (const f of [ps2, wide, hd1080]) {
      for (const progress of [staged, { ...staged, applied: 3900 }, { ...staged, done: true, refused: 'a very long reason the pack could not be applied here at all' }]) {
        const quads = drawPackApplyChip(f, sizes, { progress, kind: 'hd' });
        expect(quads.length).toBeGreaterThan(0);
        const box = compassBox(f);
        expect(quads.filter((q) => meets(q, box)), `${f.width}x${f.height}`).toEqual([]);
      }
    }
    expect(PACK_APPLY_CHIP_LAYOUT.y1).toBeLessThan(HUD_LAYOUT.compass.cy - HUD_LAYOUT.compass.size / 2);
  });
  it('the bar fills by applied of total', () => {
    const fill = (applied: number): number => {
      const q = drawPackApplyChip(ps2, sizes, { progress: { ...staged, applied }, kind: 'hd' }).filter((x) => x.texture === WHITE);
      return q[q.length - 1]!.w;
    };
    expect(fill(1950) * 2).toBeCloseTo(fill(3900), 5);
  });
  it('reads the progress the page feeds (one feed; its off takes it away)', () => {
    expect(packApplyChipNow()).toBeNull();
    const off = feedPackApplyChip(() => ({ progress: staged, kind: 'gx' }));
    expect(packApplyChipNow()).toEqual({ progress: staged, kind: 'gx' });
    off();
    expect(packApplyChipNow()).toBeNull();
  });
  it('hud.ts draws it once, on its render, through the hook the feed installs (no runtime import of the chip)', () => {
    const hud = read('hud.ts');
    expect(hud).not.toMatch(/drawPackApplyChip\(/);
    expect(hud.match(/chipDrawer\(this\.frame/g)?.length).toBe(1);
    expect(hud).toMatch(/if \(chipDrawer\) all\.push\(\.\.\.chipDrawer\(this\.frame, this\.sizes\(\)\)\);/);
  });
  it('the feed installs the chip drawer on the HUD hook; its off clears it, and leaves another drawer', () => {
    expect(hudChipDrawer()).toBeNull();
    const off = feedPackApplyChip(() => ({ progress: staged, kind: 'hd' }));
    const drawer = hudChipDrawer();
    expect(drawer).not.toBeNull();
    expect(drawer!(ps2, sizes)).toEqual(drawPackApplyChip(ps2, sizes, { progress: staged, kind: 'hd' }));
    off();
    expect(hudChipDrawer()).toBeNull();
    const offA = feedPackApplyChip(() => null);
    const other = (): HudQuad[] => [];
    setHudChipDrawer(other);
    offA();
    expect(hudChipDrawer()).toBe(other);
    setHudChipDrawer(null);
  });
  it('review F3: feeds stack -- a second feed\'s off brings the first back; the drawer goes only with the last feed', () => {
    const a = { progress: staged, kind: 'hd' as const }, b = { progress: { ...staged, name: 'B' }, kind: 'gx' as const };
    const offA = feedPackApplyChip(() => a);
    const offB = feedPackApplyChip(() => b);
    expect(packApplyChipNow()).toEqual(b);              // the top live feed draws
    offB();
    expect(packApplyChipNow()).toEqual(a);              // A's chip draws again
    expect(hudChipDrawer()).not.toBeNull();
    expect(hudChipDrawer()!(ps2, sizes)).toEqual(drawPackApplyChip(ps2, sizes, a));
    offA();
    expect(packApplyChipNow()).toBeNull();
    expect(hudChipDrawer()).toBeNull();
    // A off first, then B: B still draws between, nothing after.
    const offA2 = feedPackApplyChip(() => a), offB2 = feedPackApplyChip(() => b);
    offA2();
    expect(packApplyChipNow()).toEqual(b);
    expect(hudChipDrawer()).not.toBeNull();
    offB2();
    expect(packApplyChipNow()).toBeNull();
    expect(hudChipDrawer()).toBeNull();
    // an off called twice removes nothing else
    const offA3 = feedPackApplyChip(() => a), offB3 = feedPackApplyChip(() => b);
    offB3(); offB3();
    expect(packApplyChipNow()).toEqual(a);
    offA3();
    expect(hudChipDrawer()).toBeNull();
    // a later feed with no chip (a prepared match's hidden overlay) leaves the earlier one's drawn
    const offA4 = feedPackApplyChip(() => a), offB4 = feedPackApplyChip(() => null);
    expect(packApplyChipNow()).toEqual(a);
    offA4(); offB4();
    expect(hudChipDrawer()).toBeNull();
  });
  it('review F4: every quad stays inside the chip\'s box for a long refusal and a long name, and a refusal draws no fill', () => {
    const L = PACK_APPLY_CHIP_LAYOUT, eps = 1e-6;
    const longName = 'An Extremely Long Community Texture Pack Name That Goes On And On Beyond Any Chip';
    const reason = 'a very long reason the pack could not be applied here at all, with every detail of why it failed spelled out in full';
    const green = [64 / 255, 128 / 255, 64 / 255];
    for (const f of [ps2, hd1080]) {
      const s = f.height / 448, X = (x: number): number => f.width - (640 - x) * s;
      const box = { x0: X(L.x0), x1: X(L.x1), y0: L.y0 * s, y1: L.y1 * s };
      for (const progress of [
        { ...staged, name: longName },
        { ...staged, name: longName, applied: 0, total: 0, done: true, refused: reason },
        { ...staged, done: true, refused: reason },
      ]) {
        for (const kind of ['hd', 'gx'] as const) {
          const quads = drawPackApplyChip(f, sizes, { progress, kind });
          expect(quads.length).toBeGreaterThan(0);
          // Across, every quad inside the box (fitLine's cut). Down, the boxes and the bar inside it; a glyph's quad is its
          // whole 25-row font cell, whose blank top rows the title's (baseline y 15) start at y ~0.4, above the box's y 2
          // and inside the frame (the review's note) -- so a glyph is held to the frame's top and the box's foot.
          const top = (q: HudQuad): number => (q.texture === WHITE ? box.y0 : 0);
          const out = quads.filter((q) => q.x - q.w / 2 < box.x0 - eps || q.x + q.w / 2 > box.x1 + eps || q.y - q.h / 2 < top(q) - eps || q.y + q.h / 2 > box.y1 + eps);
          expect(out.map((q) => [q.texture, q.x, q.y, q.w, q.h]), `${f.width}x${f.height} ${progress.refused ?? 'staged'} ${kind}`).toEqual([]);
          if (progress.refused) {
            const fills = quads.filter((q) => q.texture === WHITE && green.every((c, i) => Math.abs(q.rgba[i]! - c) < 1e-6));
            expect(fills, 'no green fill on a refusal').toEqual([]);
          }
        }
      }
    }
  });
  it('the test room and the front end\'s match feed it from their overlay, the HD pack\'s as hd', () => {
    for (const page of ['main.ts', 'matchMount.ts']) {
      const text = read(page);
      expect(text, page).toMatch(/feedPackApplyChip\(\(\) => packOverlay\??\.?hudChip\(\)/);
      expect(text, page).toMatch(/packOverlay\??\.update\(hdPack\?\.progress\(\) \?\? null, 'hd'\)/);
    }
  });
});

describe('WM-PACKS-CHIP: the page\'s DOM chip', () => {
  const el = (): HTMLElement => document.getElementById('s2u-pack-apply')!;
  it('is never full-screen: a corner chip in and out of live play, never a pointer target', () => {
    let live = false;
    const o = new PackApplyOverlay(document, () => live);
    o.update(staged, 'hd');
    expect(el().classList.contains('is-full')).toBe(false);
    expect(el().classList.contains('is-chip')).toBe(true);
    live = true; o.refresh();
    expect(el().classList.contains('is-full')).toBe(false);
    expect(el().classList.contains('is-chip')).toBe(true);
    const css = document.getElementById('s2u-pack-apply-style')!.textContent!;
    expect(css).not.toMatch(/inset:0/);
    expect(css).not.toMatch(/is-full/);
    expect(css).toMatch(/#s2u-pack-apply\{[^}]*pointer-events:none/);
    o.dispose();
  });
  it('says the chip\'s words: the title, the count, the bar', () => {
    const frames: (() => void)[] = [];
    const o = new PackApplyOverlay(document, () => false, undefined, (f) => { frames.push(f); });
    o.update(staged, 'hd');
    expect(el().querySelector('[data-part=words]')!.textContent).toBe('LOADING HD TEXTURES');
    expect(el().querySelector('[data-part=count]')!.textContent).toBe('1,326 of 3,900');
    expect((el().querySelector('[data-part=fill]') as HTMLElement).style.width).toBe('34%');
    o.update({ ...staged, applied: 1327 });                // a GX pack's count: drawn on the next frame
    frames.shift()!();
    expect(el().querySelector('[data-part=words]')!.textContent).toBe('LOADING TEXTURES');
    o.dispose();
  });
  it('in a match whose HUD draws the chip, draws nothing in live play and hands the HUD the progress', () => {
    let live = true;
    const o = new PackApplyOverlay(document, () => live, undefined, undefined, undefined, true);
    o.update(staged, 'hd');
    expect(el().style.display).toBe('none');
    expect(o.hudChip()).toEqual({ progress: staged, kind: 'hd' });
    live = false; o.refresh();
    expect(el().style.display).toBe('');
    expect(o.hudChip()).toBeNull();
    o.dispose();
    expect(o.hudChip()).toBeNull();
  });
  it('a page without a HUD chip draws its own in live play too', () => {
    const o = new PackApplyOverlay(document, () => true);
    o.update(staged, 'hd');
    expect(el().style.display).toBe('');
    expect(o.hudChip()).toBeNull();
    o.dispose();
  });
  it('over the loading screen the DOM chip draws (the HUD is not up), above it', () => {
    const l = document.createElement('div'); l.id = 'original-loading'; document.body.append(l);
    const o = new PackApplyOverlay(document, () => true, undefined, undefined, undefined, true);
    o.update(staged, 'hd');
    expect(el().style.display).toBe('');
    expect(el().classList.contains('is-over-loading')).toBe(true);
    expect(o.hudChip()).toBeNull();
    o.dispose();
  });
  it('a refusal hands the HUD its words, then both go', () => {
    const timers: (() => void)[] = [];
    const o = new PackApplyOverlay(document, () => true, (f) => { timers.push(f); }, undefined, undefined, true);
    const refused = { ...staged, applied: 0, total: 0, done: true, refused: 'the HD pack is not installed' };
    o.update(refused, 'hd');
    expect(o.hudChip()).toEqual({ progress: refused, kind: 'hd' });
    timers[0]!();
    expect(o.hudChip()).toBeNull();
    expect(document.getElementById('s2u-pack-apply')).toBeNull();
  });
});
