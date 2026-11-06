import { describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { MoviePicture, UiDrawItem } from '@s2u/ui';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import * as compositor from '../src/uiCompositorView';
import { planFrame, type UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_GPU_TWIN_CORPUS_B, executeFramePlanOnTwin, twinStats } from '../src/uiGpuTwin';
import { CORPUS_SKIP, HAVE_CORPUS_DISC, walkMenuCorpus, type CorpusEntry, type RecordedFrame } from './uiGpuCorpus';

/**
 * GM-08 (plan `docs/plans/2026-11-01-gpu-menus.md`, GM-08's row; GM.R5, GM.R7; research 380 §1): the f32 twin
 * (`uiGpuTwin.ts`) on GM-04's corpus (`uiGpuCorpus.ts`, the frames GM-07 proved the f64 executor equal on), against the
 * software (`rasterizeUiDrawList`, the reference), under both blend tables: **the exact class 0 bytes**, **layered ===
 * sequential** byte for byte (GM.R7: the programmable batches), and the **B statistics** per scale and table -- per
 * channel max |Δ|, pixels at |Δ| >= 1, 2, 3, frames with any difference -- held at most at the twin's recorded leg of
 * the provisional bound (`UI_GPU_TWIN_CORPUS_B`; GM-11b adds SwiftShader's, GM-27 pins it on real GPUs). Its ppm bounds were
 * re-pinned 2026-11-06, measured on origin/main 13cdc9a48 (the tally on the host, the twin on box s1f), the same excess
 * on GM-15b's branch; the cause is CPS-4b's VIDEO OPTIONS rows (40e037620, 10ff4f3a8): more 2D quads, unchanged model
 * columns, 0 differing pixels, exact class 0 bytes. These pins are readings of the port's own output, not the
 * original's.
 *
 * **The runtime budget (GM-08's row; said in the record).** Every distinct frame at 1x; at 2x and 4x a sample -- each
 * entry's first and last distinct frame (the row names the first; a deep link's first frame is often the fade-in's
 * near-blank one, so the last, the dialog shown, is added), and for dlgMenu, CREATE GAME and the ARMORY GM-07's sample
 * (first, last, every 8th) -- unless `S2U_TWIN_FULL=1` (every distinct frame at every scale). `S2U_TWIN_ONLY=<regex>` filters entries (the
 * record says FILTERED; the whole-corpus pins are not asserted); `S2U_TWIN_PROGRESS=1` prints a line per entry. The
 * peak memory (RSS and heap) is recorded. Movie pictures: GM-07's seeded stand-ins (a test input). Skips without the
 * disc, naming it.
 */

const rec = vi.hoisted(() => ({ on: false, frames: [] as { items: readonly UiDrawItem[]; textures: UiTextures; transparent: boolean }[] }));
vi.mock('../src/uiCompositorView', async (importOriginal) => {
  const actual = await importOriginal<typeof compositor>();
  return {
    ...actual,
    rasterizeUiDrawList: (items: readonly UiDrawItem[], textures: UiTextures, o?: RasterOptions) => {
      if (rec.on) rec.frames.push({ items: items.slice(), textures, transparent: o?.transparent === true });
      return actual.rasterizeUiDrawList(items, textures, o);
    },
  };
});
const recorder = {
  start: (): void => { rec.frames.length = 0; rec.on = true; },
  stop: (): RecordedFrame[] => { rec.on = false; return rec.frames.splice(0); },
};

const SCALES = [1, 2, 4] as const;
const BLENDS: readonly UiPlanBlendMode[] = ['exact', 'ff'];
const FULL = process.env.S2U_TWIN_FULL === '1';
const PROGRESS = process.env.S2U_TWIN_PROGRESS === '1';
const ONLY = process.env.S2U_TWIN_ONLY ? new RegExp(process.env.S2U_TWIN_ONLY) : null;
const STRIDE = 8;
/** The entries sampled at GM-07's stride at 2x and 4x (the rest: their first distinct frame). */
const DENSE = /^(dlgMenu|CREATE GAME|ARMORY)/;

/** GM-07's seeded movie stand-ins, by the picture's index and size (a test input, not the disc's movie). */
const pictures = new Map<string, Rgba>();
function moviePixels(p: MoviePicture): Rgba | null {
  const index = (p.image as { index?: number } | null)?.index ?? 0;
  const key = `${p.width}x${p.height}#${index}`;
  let got = pictures.get(key);
  if (!got) {
    const data = new Uint8ClampedArray(p.width * p.height * 4);
    let s = (index * 2654435761 + p.width * 40503 + p.height) >>> 0;
    for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; data[i] = s >>> 24; }
    got = { width: p.width, height: p.height, data };
    if (pictures.size > 64) pictures.clear();
    pictures.set(key, got);
  }
  return got;
}
const listKey = (items: readonly UiDrawItem[]): string => JSON.stringify(items, (_k, v: unknown) =>
  (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0)) ? `#${Object.is(v, -0) ? '-0' : String(v)}` : v));

/** One scale and blend table's B record. */
interface Leg {
  frames: number; differingFrames: number; pixels: number; maxAbs: [number, number, number, number]; atLeast: [number, number, number];
  /** Outside every model box: the quads' rounding apart from the models' edges and depth ties. */
  quadsMaxAbs: [number, number, number, number]; quadsAtLeast: [number, number, number];
  exactPixels: number; exactDiffering: number; worst: { entry: string; frame: number; ge1: number } | null;
}
const leg = (): Leg => ({ frames: 0, differingFrames: 0, pixels: 0, maxAbs: [0, 0, 0, 0], atLeast: [0, 0, 0], quadsMaxAbs: [0, 0, 0, 0], quadsAtLeast: [0, 0, 0], exactPixels: 0, exactDiffering: 0, worst: null });
interface Tally {
  entries: number; frames: number; distinct: number;
  compared: Record<number, number>; seconds: Record<number, number>;
  legs: Record<string, Leg>;
  software: Map<string, Set<string>>;
  layeredMismatch: string[];
  batchedRuns: number;
  peakRss: number; peakHeap: number;
}

function picks(n: number, scale: number, name: string): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (FULL || scale === 1) return all;
  if (DENSE.test(name)) return all.filter((i) => i % STRIDE === 0 || i === n - 1);
  return n > 1 ? [0, n - 1] : n ? [0] : [];
}

function compare(e: CorpusEntry, t: Tally): void {
  if (ONLY && !ONLY.test(e.name)) return;
  const t0 = performance.now();
  t.entries++;
  t.frames += e.frames.length;
  const seen = new Set<string>(), distinct: { items: readonly UiDrawItem[]; frame: number }[] = [];
  e.frames.forEach((items, frame) => { const key = listKey(items); if (!seen.has(key)) { seen.add(key); distinct.push({ items, frame }); } });
  t.distinct += distinct.length;
  const line: string[] = [];
  for (const scale of SCALES) {
    const s0 = performance.now(), pick = picks(distinct.length, scale, e.name);
    for (const k of pick) {
      const { items, frame } = distinct[k]!;
      const want = compositor.rasterizeUiDrawList(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, quadCache: new compositor.UiQuadRasterCache() }).frame;
      for (const blend of BLENDS) {
        const plan = planFrame(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, blend });
        if (plan.verdict !== 'gpu') {
          const why = plan.why[0] ?? '(no reason given)';
          if (!t.software.has(why)) t.software.set(why, new Set());
          t.software.get(why)!.add(e.name);
          continue;
        }
        const got = executeFramePlanOnTwin(plan);
        if (plan.batches.length) {
          t.batchedRuns++;
          const seq = executeFramePlanOnTwin(plan, { sequential: true }).frame.data, lay = got.frame.data;
          for (let i = 0; i < lay.length; i++) if (lay[i] !== seq[i]) { t.layeredMismatch.push(`${e.name} frame ${frame} ${scale}x ${blend} at byte ${i}`); break; }
        }
        const st = twinStats(got.frame, want, got.exact, got.models), l = (t.legs[`${scale}x ${blend}`] ??= leg());
        l.frames++; l.pixels += st.pixels; l.exactPixels += st.exactPixels; l.exactDiffering += st.exactDiffering;
        if (st.differing) l.differingFrames++;
        for (let c = 0; c < 4; c++) { l.maxAbs[c] = Math.max(l.maxAbs[c]!, st.maxAbs[c]!); l.quadsMaxAbs[c] = Math.max(l.quadsMaxAbs[c]!, st.quads.maxAbs[c]!); }
        for (let c = 0; c < 3; c++) { l.atLeast[c] = l.atLeast[c]! + st.atLeast[c]!; l.quadsAtLeast[c] = l.quadsAtLeast[c]! + st.quads.atLeast[c]!; }
        if (st.atLeast[0] && (!l.worst || st.atLeast[0] > l.worst.ge1)) l.worst = { entry: e.name, frame, ge1: st.atLeast[0] };
      }
      const m = process.memoryUsage();
      t.peakRss = Math.max(t.peakRss, m.rss); t.peakHeap = Math.max(t.peakHeap, m.heapUsed);
    }
    const sec = (performance.now() - s0) / 1000;
    t.compared[scale] = (t.compared[scale] ?? 0) + pick.length;
    t.seconds[scale] = (t.seconds[scale] ?? 0) + sec;
    line.push(`${scale}x ${pick.length} in ${sec.toFixed(1)} s`);
  }
  if (PROGRESS) process.stderr.write(`GM-08 ${t.entries} ${e.name}: ${e.frames.length} frames, ${distinct.length} distinct; ${line.join(', ')}; ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
}

const MB = (b: number): string => `${(b / 1048576).toFixed(0)} MB`;

describe.skipIf(!HAVE_CORPUS_DISC)(`GM-08: the f32 twin on GM-04's corpus (dev disc)${CORPUS_SKIP}`, () => {
  it(`exact class 0 bytes, layered === sequential, B within the twin's record (1x every frame; 2x/4x ${FULL ? 'every frame' : 'sampled'})`, async () => {
    const t: Tally = { entries: 0, frames: 0, distinct: 0, compared: {}, seconds: {}, legs: {}, software: new Map(), layeredMismatch: [], batchedRuns: 0, peakRss: 0, peakHeap: 0 };
    await walkMenuCorpus(recorder, (e) => compare(e, t));
    const software = [...t.software].map(([why, names]) => `${why}: ${[...names].join(', ')}`);
    const legs = Object.entries(t.legs).map(([k, l]) =>
      `  ${k.padEnd(9)} frames ${l.frames}, differing ${l.differingFrames}; max |Δ| ${l.maxAbs.join('/')}; pixels >= 1/2/3: ${l.atLeast.join('/')} of ${l.pixels} (${(1e6 * l.atLeast[0] / Math.max(1, l.pixels)).toFixed(2)} ppm); outside model boxes max |Δ| ${l.quadsMaxAbs.join('/')}, >= 1/2/3: ${l.quadsAtLeast.join('/')}; exact class ${l.exactPixels} px, differing ${l.exactDiffering}${l.worst ? `; worst ${l.worst.entry} frame ${l.worst.frame} (${l.worst.ge1} px)` : ''}`);
    // eslint-disable-next-line no-console
    console.log([
      `GM-08 twin corpus${ONLY ? ` FILTERED to /${ONLY.source}/` : ''}: ${t.entries} entries, ${t.frames} frames, ${t.distinct} distinct in their entry; ${FULL ? 'FULL (S2U_TWIN_FULL=1): every distinct frame at every scale' : `every distinct frame at 1x; at 2x/4x each entry's first and last distinct frame, dlgMenu, CREATE GAME and the ARMORY every ${STRIDE}th (+ first, last) (S2U_TWIN_FULL=1 for all)`}`,
      `compared per scale: ${SCALES.map((s) => `${s}x ${t.compared[s] ?? 0} frames in ${(t.seconds[s] ?? 0).toFixed(1)} s`).join(', ')}`,
      `runs with programmable batches (layered and sequential both run): ${t.batchedRuns}; layered != sequential: ${t.layeredMismatch.length}`,
      `software verdicts: ${software.length ? software.join(' | ') : 'none'}`,
      `peak memory: rss ${MB(t.peakRss)}, heap ${MB(t.peakHeap)}`,
      'B per scale and blend table:', ...legs,
    ].join('\n'));
    if (!ONLY) expect(t.entries, 'the corpus\'s entries').toBe(116);
    expect(t.entries).toBeGreaterThan(0);
    expect(t.compared[1], 'every distinct frame at 1x').toBe(t.distinct);
    expect(software, 'software verdicts (the reference would draw them: nothing proved)').toEqual([]);
    expect(t.layeredMismatch, 'layered !== sequential (GM.R7)').toEqual([]);
    for (const [k, l] of Object.entries(t.legs)) {
      expect(l.exactDiffering, `${k}: exact-class pixels differing (E/E*)`).toBe(0);
      const bound = UI_GPU_TWIN_CORPUS_B[k as keyof typeof UI_GPU_TWIN_CORPUS_B];
      expect(bound, `${k}: a recorded bound`).toBeDefined();
      for (let c = 0; c < 4; c++) {
        expect(l.maxAbs[c], `${k}: channel ${c} max |Δ| within the twin's record`).toBeLessThanOrEqual(bound.maxAbs);
        expect(l.quadsMaxAbs[c], `${k}: channel ${c} max |Δ| outside the model boxes within the twin's record`).toBeLessThanOrEqual(bound.quadsMaxAbs);
      }
      expect(1e6 * l.atLeast[0] / l.pixels, `${k}: pixels at |Δ| >= 1, ppm, within the twin's record`).toBeLessThanOrEqual(bound.ppm);
      expect(1e6 * l.quadsAtLeast[0] / l.pixels, `${k}: outside the model boxes, ppm, within the twin's record`).toBeLessThanOrEqual(bound.quadsPpm);
    }
    // Limits: the default run took 3,580 s on the GM-08 host (i7-14700K, Node 24), so its limit is 2 h; the full mode
  // (every distinct frame at 2x and 4x) is not yet run whole -- GM-07's estimate for the f64 executor is ~8,100 s, the
  // twin is about twice as slow per frame: 6 h.
  }, FULL ? 21_600_000 : 7_200_000);
});
