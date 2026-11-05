import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import * as fmv from '@s2u/fmv';
import * as ui from '@s2u/ui';
import * as view from '../src/uiCompositorView';
import * as rules from '../src/uiRasterRules';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import {
  UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, UI_RASTER_SOFTWARE_SHA256, caseRunKey, caseRasterInputs,
  UI_RASTER_PREDIVIDE_CASES, UI_RASTER_PREDIVIDE_PROBES, UI_RASTER_PREDIVIDE_SHA256, casePreDivideKey,
  type UiRasterCase, type UiRasterMode, type UiRasterScale,
} from './uiRasterCases';

// GM-03 (plan 2026-11-01-gpu-menus, research 380): the shared case table run on today's software rasteriser
// (`rasterizeUiDrawList`), the reference every later executor -- the f64 CPU executor (GM-06a/b), the f32 twin (GM-08),
// the GPU parity spec (GM-11b) -- compares to byte for byte. Each case's probes are the rule worked by hand; its
// pinned SHA-256 is the software's whole frame at scales 1, 2 and 4, opaque and transparent.

const sha = (f: Rgba): string => createHash('sha256').update(f.data).digest('hex');
const px = (f: Rgba, x: number, y: number): number[] => [...f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4)];
const run = (c: UiRasterCase, scale: UiRasterScale, mode: UiRasterMode) => {
  const { items, textures, options } = caseRasterInputs(c, scale, mode);
  return rasterizeUiDrawList(items, textures, options);
};

// GM-05b minted the eight readings the cases named before they existed (`uiRasterRules.ts`, research 380 §4).
const exported = new Set(Object.keys({ ...ui, ...fmv, ...view, ...rules }));

describe('GM-03: the shared case table', () => {
  it('holds u4 §2.3 cases 1-10, the hybrid design\'s 11-15 and the plan\'s 16-20, each once, in order', () => {
    expect([...new Set(UI_RASTER_CASES.map((c) => c.id))]).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const keys = UI_RASTER_CASES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('each case names its rules and its readings: a reading is an exported constant', () => {
    for (const c of UI_RASTER_CASES) {
      expect(c.rules.length, c.key).toBeGreaterThan(0);
      expect(c.readings.length, c.key).toBeGreaterThan(0);
      for (const r of c.readings) expect(exported.has(r), `${c.key}: ${r}`).toBe(true);
      expect(c.probes.length, c.key).toBeGreaterThan(0);
    }
  });
  it('case 19 runs case 4\'s rule over source alpha 0, 64, 128, 192 and 255; case 13 three residencies', () => {
    expect(UI_RASTER_CASES.filter((c) => c.id === 19).map((c) => c.variant)).toEqual(['a0', 'a64', 'a128', 'a192', 'a255']);
    expect(UI_RASTER_CASES.filter((c) => c.id === 13).map((c) => c.variant)).toEqual(['cold', 'warm', 'hot']);
  });
});

describe('GM-03: every case on the software rasteriser', () => {
  for (const c of UI_RASTER_CASES) {
    describe(`case ${c.key}: ${c.name}`, () => {
      it('the hand-worked probes hold', () => {
        for (const p of c.probes) {
          const { frame } = run(c, p.scale ?? 1, p.mode ?? 'opaque');
          expect(px(frame, p.x, p.y), `${c.key} ${p.mode ?? 'opaque'} x${p.scale ?? 1} (${p.x}, ${p.y})${p.why ? `: ${p.why}` : ''}`).toEqual(p.rgba);
        }
      });
      it('the frame is pinned at scales 1, 2 and 4, opaque and transparent; undrawn as listed', () => {
        for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) {
          const { frame, undrawn } = run(c, scale, mode);
          expect([frame.width, frame.height]).toEqual([640 * scale, 448 * scale]);
          expect(undrawn, `${c.key} undrawn`).toEqual(c.undrawn ?? []);
          const k = caseRunKey(c, scale, mode);
          expect(sha(frame), k).toBe(UI_RASTER_SOFTWARE_SHA256[k]);
        }
      });
    });
  }
  it('the pins cover exactly the cases\' runs', () => {
    const runs = UI_RASTER_CASES.flatMap((c) => UI_RASTER_CASE_SCALES.flatMap((s) => UI_RASTER_CASE_MODES.map((m) => caseRunKey(c, s, m))));
    expect(Object.keys(UI_RASTER_SOFTWARE_SHA256).sort()).toEqual([...runs].sort());
  });
  it('case 13\'s residencies draw three different frames (a guard compares like with like)', () => {
    const hashes = UI_RASTER_CASES.filter((c) => c.id === 13).map((c) => UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, 1, 'opaque')]);
    expect(new Set(hashes).size).toBe(3);
  });
});

// GM-09 (GM-03 review F2): the transparent frame before its divide back to straight RGB -- what P14/P22's GPU legs
// compare. A browser adaptation's option (the overlay's), off by default: every pin above is the frame without it.
const preDivided = (c: UiRasterCase, scale: UiRasterScale) => {
  const { items, textures, options } = caseRasterInputs(c, scale, 'transparent', true);
  return rasterizeUiDrawList(items, textures, options);
};

describe('GM-09: the pre-divide frame of cases 4, 17 and 19', () => {
  it('names cases 4, 17 and 19 (every variant), and the pins cover exactly their runs', () => {
    expect(UI_RASTER_PREDIVIDE_CASES.map((c) => c.key)).toEqual(['4', '17', '19.a0', '19.a64', '19.a128', '19.a192', '19.a255']);
    const runs = UI_RASTER_PREDIVIDE_CASES.flatMap((c) => UI_RASTER_CASE_SCALES.map((s) => casePreDivideKey(c, s)));
    expect(Object.keys(UI_RASTER_PREDIVIDE_SHA256).sort()).toEqual([...runs].sort());
    expect(Object.keys(UI_RASTER_PREDIVIDE_PROBES).sort()).toEqual(UI_RASTER_PREDIVIDE_CASES.map((c) => c.key).sort());
  });
  for (const c of UI_RASTER_PREDIVIDE_CASES) {
    describe(`case ${c.key}`, () => {
      it('the hand-worked pre-divide probes hold', () => {
        for (const p of UI_RASTER_PREDIVIDE_PROBES[c.key]!) {
          const { frame } = preDivided(c, p.scale ?? 1);
          expect(px(frame, p.x, p.y), `${c.key} pre-divide x${p.scale ?? 1} (${p.x}, ${p.y})${p.why ? `: ${p.why}` : ''}`).toEqual(p.rgba);
        }
      });
      it('the pre-divide frame is pinned at 1, 2 and 4: the opaque RGB with the transparent alpha; divided, the transparent pin', () => {
        for (const scale of UI_RASTER_CASE_SCALES) {
          const { frame, undrawn } = preDivided(c, scale);
          const k = casePreDivideKey(c, scale);
          expect(undrawn, k).toEqual(c.undrawn ?? []);
          expect(sha(frame), k).toBe(UI_RASTER_PREDIVIDE_SHA256[k]);
          const opaque = run(c, scale, 'opaque').frame.data, straight = run(c, scale, 'transparent').frame.data;
          const d = frame.data;
          let rgb = 0, alpha = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] !== opaque[i] || d[i + 1] !== opaque[i + 1] || d[i + 2] !== opaque[i + 2]) rgb++;
            if (d[i + 3] !== straight[i + 3]) alpha++;
          }
          expect([rgb, alpha], `${k}: pixels off the opaque RGB, off the transparent alpha`).toEqual([0, 0]);
          // The divide (P22) applied to the pre-divide frame is today's transparent frame, byte for byte.
          const divided = new Uint8ClampedArray(d);
          for (let i = 0; i < divided.length; i += 4) {
            const a = divided[i + 3]! / 255;
            if (a > 0 && a < 1) { divided[i] = divided[i]! / a; divided[i + 1] = divided[i + 1]! / a; divided[i + 2] = divided[i + 2]! / a; }
          }
          expect(sha({ width: frame.width, height: frame.height, data: divided }), k).toBe(UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, scale, 'transparent')]);
        }
      });
    });
  }
  it('the option changes nothing on an opaque frame, nor on a transparent case the divide leaves alone', () => {
    for (const c of UI_RASTER_CASES.filter((k) => [1, 8, 9, 20].includes(k.id))) for (const mode of UI_RASTER_CASE_MODES) {
      const { items, textures, options } = caseRasterInputs(c, 1, mode, true);
      const k = caseRunKey(c, 1, mode);
      if (mode === 'opaque' || c.id !== 20) expect(sha(rasterizeUiDrawList(items, textures, options).frame), k).toBe(UI_RASTER_SOFTWARE_SHA256[k]);
    }
  });
});
