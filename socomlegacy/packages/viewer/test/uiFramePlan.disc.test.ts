import { describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { MoviePicture, UiDrawItem } from '@s2u/ui';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import * as compositor from '../src/uiCompositorView';
import { planFrame, type UiPlanBlendMode } from '../src/uiFramePlan';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import { CORPUS_SKIP, HAVE_CORPUS_DISC, walkMenuCorpus, type CorpusEntry, type RecordedFrame } from './uiGpuCorpus';

/**
 * GM-07 (plan `docs/plans/2026-11-01-gpu-menus.md`, GM-07's row; research 380 §2): the planner and its f64 CPU executor
 * (`planFrame` + `executeFramePlanOnCpu`, GM-06a/b) give the software rasteriser's bytes (`rasterizeUiDrawList`, the
 * reference) on every frame of GM-04's corpus (`uiGpuCorpus.ts`: the 114 dialogs, dlgMenu with MENULOOP, CREATE GAME,
 * the ARMORY on both sides, the Settings overlay over a transparent frame, the loader screens) at the scales 1, 2 and
 * 4, under both blend tables (`exact`, `ff`): **0 differing bytes per frame**, and the same `undrawn`.
 *
 * **Not vacuous.** A plan whose verdict is `software` is drawn by the reference itself (`executeFramePlanOnCpu`'s L1
 * branch), so its equality proves nothing: every such frame is counted by its reason, and the set is pinned below --
 * the corpus must be the executor's own work, not the reference's.
 *
 * **What it reads, kept apart.** The draw lists are `@s2u/ui`'s and the page's from the dev disc (reading); the movie's
 * pictures are the black stand-in's handles (`BlackPictureSource`), drawn here from a seeded pattern at the picture's
 * own size (a test input, not the disc's movie: the copy step P17 is what is compared, whatever its pixels). A frame
 * whose list, lookup and mode equal an earlier frame's in the same entry is compared once (both drawers are pure in
 * their inputs); the counts say how many were compared. Skips without the disc, naming it.
 */

// The overlay's frames are taken where it hands them to the drawer (no source change: a recorder around the export).
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

/** A movie picture's pixels for the comparison: a seeded pattern at the picture's size, by its index (test input). */
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

/** A list's identity for the de-duplication: every number kept exactly (NaN, the infinities and -0 too). */
const listKey = (items: readonly UiDrawItem[]): string => JSON.stringify(items, (_k, v: unknown) =>
  (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0)) ? `#${Object.is(v, -0) ? '-0' : String(v)}` : v));

interface Mismatch { entry: string; frame: number; scale: number; blend: UiPlanBlendMode; bytes: number; first: number; undrawn: boolean }
interface Tally {
  entries: number;
  frames: number;
  /** Frames distinct within their entry (a repeat is compared once). */
  distinct: number;
  /** Per scale: the frames compared, and the seconds spent. */
  compared: Record<number, number>;
  seconds: Record<number, number>;
  /** Comparisons run (compared frames x blend tables), and those drawn by the executor (`gpu` verdict). */
  runs: number;
  gpu: number;
  /** `software` verdicts by their first reason, and the entries they came from. */
  software: Map<string, Set<string>>;
  quads: number; triangles: number; movies: number; batches: number;
  mismatches: Mismatch[];
}

/**
 * The run's budget (the plan's GM-08 row sets the same shape for the twin): every distinct frame at scale 1, and at 2
 * and 4 a sample -- each entry's first and last distinct frame and every `SAMPLE_STRIDE`-th between -- unless
 * `S2U_GM07_FULL=1`, which compares every distinct frame at every scale (about two hours on the GM-07 host). The record
 * says which ran.
 */
const FULL = process.env.S2U_GM07_FULL === '1';
const SAMPLE_STRIDE = 8;
/** `S2U_GM07_PROGRESS=1`: a line per entry on stderr (its frames, those compared, its seconds). */
const PROGRESS = process.env.S2U_GM07_PROGRESS === '1';
/**
 * `S2U_GM07_ONLY=<regex>`: compare only the entries whose name matches (a by-hand check, such as a mutation's); the
 * record says FILTERED and the whole-corpus pins (the entry count, the paths reached) are not asserted.
 */
const ONLY = process.env.S2U_GM07_ONLY ? new RegExp(process.env.S2U_GM07_ONLY) : null;

function sampled(n: number, scale: number): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (FULL || scale === 1) return all;
  return all.filter((i) => i % SAMPLE_STRIDE === 0 || i === n - 1);
}

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): { bytes: number; first: number } {
  if (a.length !== b.length) return { bytes: Math.max(a.length, b.length), first: 0 };
  let bytes = 0, first = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { bytes++; if (first < 0) first = i; }
  return { bytes, first };
}

function compare(e: CorpusEntry, t: Tally): void {
  if (ONLY && !ONLY.test(e.name)) return;
  const t0 = performance.now();
  t.entries++;
  t.frames += e.frames.length;
  const seen = new Set<string>(), distinct: { items: readonly UiDrawItem[]; frame: number }[] = [];
  e.frames.forEach((items, frame) => {
    const key = listKey(items);
    if (!seen.has(key)) { seen.add(key); distinct.push({ items, frame }); }
  });
  t.distinct += distinct.length;
  const line: string[] = [];
  for (const scale of SCALES) {
    const s0 = performance.now(), pick = sampled(distinct.length, scale);
    for (const k of pick) {
      const { items, frame } = distinct[k]!;
      const want = compositor.rasterizeUiDrawList(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, quadCache: new compositor.UiQuadRasterCache() });
      for (const blend of BLENDS) {
        const plan = planFrame(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, blend });
        t.runs++;
        if (plan.verdict === 'gpu') {
          t.gpu++;
          t.quads += plan.stats.quads; t.triangles += plan.stats.triangles; t.movies += plan.stats.movies; t.batches += plan.stats.batches;
        } else {
          const why = plan.why[0] ?? '(no reason given)';
          if (!t.software.has(why)) t.software.set(why, new Set());
          t.software.get(why)!.add(e.name);
        }
        const got = executeFramePlanOnCpu(plan);
        const { bytes, first } = differing(got.frame.data, want.frame.data);
        const undrawn = JSON.stringify(got.undrawn) !== JSON.stringify(want.undrawn);
        if (bytes > 0 || undrawn) t.mismatches.push({ entry: e.name, frame, scale, blend, bytes, first, undrawn });
      }
    }
    const sec = (performance.now() - s0) / 1000;
    t.compared[scale] = (t.compared[scale] ?? 0) + pick.length;
    t.seconds[scale] = (t.seconds[scale] ?? 0) + sec;
    line.push(`${scale}x ${pick.length} in ${sec.toFixed(1)} s`);
  }
  if (PROGRESS) process.stderr.write(`GM-07 ${t.entries} ${e.name}: ${e.frames.length} frames, ${distinct.length} distinct; ${line.join(', ')}; ${((performance.now() - t0) / 1000).toFixed(1)} s; mismatches so far ${t.mismatches.length}\n`);
}

describe.skipIf(!HAVE_CORPUS_DISC)(`GM-07: the executor equals the software on GM-04's corpus (dev disc)${CORPUS_SKIP}`, () => {
  it(`0 differing bytes on every frame at the scales 1, 2 and 4 (${FULL ? 'full' : '2 and 4 sampled'}), under both blend tables, drawn by the executor`, async () => {
    const t: Tally = { entries: 0, frames: 0, distinct: 0, compared: {}, seconds: {}, runs: 0, gpu: 0, software: new Map(), quads: 0, triangles: 0, movies: 0, batches: 0, mismatches: [] };
    await walkMenuCorpus(recorder, (e) => compare(e, t));
    const software = [...t.software].map(([why, names]) => `${why}: ${[...names].join(', ')}`);
    // eslint-disable-next-line no-console
    console.log([
      `GM-07 corpus${ONLY ? ` FILTERED to /${ONLY.source}/` : ''}: ${t.entries} entries, ${t.frames} frames, ${t.distinct} distinct in their entry; ${FULL ? 'FULL (S2U_GM07_FULL=1): every distinct frame at every scale' : `every distinct frame at 1x, sampled at 2x/4x (first, last, every ${SAMPLE_STRIDE}th; S2U_GM07_FULL=1 for all)`}`,
      `compared per scale: ${SCALES.map((s) => `${s}x ${t.compared[s] ?? 0} frames in ${(t.seconds[s] ?? 0).toFixed(1)} s`).join(', ')}`,
      `runs ${t.runs} (compared frames x blend exact/ff): gpu ${t.gpu}, software ${t.runs - t.gpu}`,
      `executor drew: quads ${t.quads}, triangles ${t.triangles}, movie steps ${t.movies}, prog batches ${t.batches}`,
      `software verdicts: ${software.length ? software.join(' | ') : 'none'}`,
      `mismatches: ${t.mismatches.length}`,
      ...t.mismatches.slice(0, 40).map((m) => `  ${m.entry} frame ${m.frame} scale ${m.scale} ${m.blend}: ${m.bytes} bytes (first at ${m.first})${m.undrawn ? ', undrawn differs' : ''}`),
    ].join('\n'));
    expect(t.entries, 'the corpus\'s entries (110 distinct dialogs + dlgMenu, CREATE GAME, 2 ARMORY, overlay, loader)').toBe(ONLY ? t.entries : 116);
    expect(t.entries, 'entries compared').toBeGreaterThan(0);
    expect(t.mismatches, 'frames whose executor bytes or undrawn differ from the software\'s').toEqual([]);
    // Not vacuous: every comparison drawn by the executor, none by the reference's L1 branch.
    expect(software, 'software verdicts (drawn by the reference: their equality proves nothing)').toEqual([]);
    expect(t.gpu).toBe(t.runs);
    expect(t.compared[1], 'every distinct frame at 1x').toBe(t.distinct);
    // The executor's paths reached on the corpus: model passes (the roller, the ARMORY) and movie steps (MENULOOP).
    if (!ONLY) {
      expect(t.triangles, 'model triangles drawn by the executor').toBeGreaterThan(0);
      expect(t.movies, 'movie steps drawn by the executor').toBeGreaterThan(0);
    }
  // Limits: the default run took about 24 minutes on the GM-07 host (i7-14700K). No unfiltered full run has completed:
  // one timed out at 7082 s with four entries left, which took 996 s more in a filtered run -- about 8,100 s in all,
  // an estimate, not a measurement; the 4 h limit covers it.
  }, FULL ? 14_400_000 : 3_600_000);
});
