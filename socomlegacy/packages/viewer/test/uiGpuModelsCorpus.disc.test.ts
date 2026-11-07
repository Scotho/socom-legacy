import { describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { MoviePicture, UiDrawItem } from '@s2u/ui';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import * as compositor from '../src/uiCompositorView';
import { planFrame, type UiFramePlan, type UiPlanBlendMode } from '../src/uiFramePlan';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { createUiGpuBackend } from '../src/uiGpuWebgl2';
import { CORPUS_SKIP, HAVE_CORPUS_DISC, walkMenuCorpus, type CorpusEntry, type RecordedFrame } from './uiGpuCorpus';
import { fakeGl } from './uiGpuFakeGl';
import { seamDoubleAdds } from './uiGpuSeamCount';

/**
 * GM-15c (plan `docs/plans/2026-11-01-gpu-menus.md`, the GM-15 row's 15c; the Log 2026-11-05T02:00Z R1 and GM-15b review
 * F1's precondition; research 380 §5, M1-M7): the models pass on GM-04's corpus (`uiGpuCorpus.ts`) -- the roller
 * (dlgMenu with MENULOOP, 300 frames) and the ARMORY's model frames (MP51, both sides), and any other entry that draws a
 * model -- at the scales 1, 2 and 4. Dev-disc test; skips without the disc, naming it. Evidence kind: dev-disc test
 * (the GPU here is the fake WebGL2 context, whose programs are the twin's arithmetic: no GPU, no browser).
 *
 * 1. **Through the plan.** Every distinct model frame planned at 1, 2, 4 under both blend tables: its `pass` and
 *    `triangles` steps and the triangles they draw counted; the software verdicts counted by reason, with GM-15b's two
 *    refusals apart (`UI_GPU_MODEL_DEPTH_FLOOR`, `UI_GPU_MODEL_TEXEL_RANGE`; GM-15b reported 0 on GM-07's corpus).
 * 2. **The seam double-add count (R1).** Over every distinct model frame at every scale: the pixels the software adds a
 *    second time because its f64 `invW` passes a stored f32 depth its own f32 equals (`uiGpuSeamCount.ts`), by class --
 *    `seam` (a shared edge, GM-15b's pinned case), `coplanar` (the same face again, GM-08's roller finding), `other`.
 *    Printed per frame where not 0, and per entry. **Not "fixed" on either side**: the controller ruled (R1, b6
 *    2026-11-06) to pin the counts (`GM15C_DOUBLE_ADDS`) and defer the choice -- match the double add on the GPU, or
 *    refuse those frames to L1 -- to GM-17's gate, with GM-27's real-GPU reading.
 * 3. **On the fake GL, the twin.** A sample of the model frames (each model entry's first and last distinct frame and
 *    every `GL_STRIDE`-th, at each scale, `ff`): drawn by the WebGL2 backend on the fake context, its frame the twin's
 *    byte for byte, its model draws counted.
 * 4. **MENULOOP (research 110 R110.1, R110.6; the plan's performance rows: "pictures presented per tick <= 1, a correctness
 *    invariant the spec counts and records").** Over dlgMenu's 300 frames: at most one movie item a frame, the picture
 *    advancing by 0 or 1 a frame (one picture a tick), and each frame's plan at 1, 2 and 4 carrying exactly one `movie`
 *    step per picture, at the origin over the picture's size times the scale (P17), none without one. The pictures are
 *    the black stand-in's (`BlackPictureSource`: an index, no pixels) with GM-07's seeded pixels (a test input).
 *
 * `S2U_GM15C_ONLY=<regex>` filters entries (the record says FILTERED; the whole-corpus pins are not asserted).
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
const GL_STRIDE = 128;
const ONLY = process.env.S2U_GM15C_ONLY ? new RegExp(process.env.S2U_GM15C_ONLY) : null;

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
const hasModels = (items: readonly UiDrawItem[]): boolean => items.some((it) => it.kind === 'models' && (it.triangles?.length ?? 0) > 0);

/**
 * R1's pin (the controller's ruling, b6 2026-11-06): the seam double adds per model entry of the corpus, summed over
 * its distinct model frames at 1, 2 and 4 -- measured 2026-11-06 on the owner's host at `01a96331d` (the GM-15c run's
 * log). The hit frames: dlgMenu's frame 2 (both entries); the seal ARMORY's frames 90-101; the terrorist ARMORY's
 * frames 72-80, 95-101, 123-132 and 248-250. A reading of the port's own output, not the original's.
 */
const GM15C_DOUBLE_ADDS = {
  'dlgMenu.rdr': { seam: 0, coplanar: 43823, other: 0 },
  'dlgMenu + MENULOOP (300 frames)': { seam: 0, coplanar: 43823, other: 0 },
  'ARMORY (MP51, seal)': { seam: 0, coplanar: 0, other: 81 },
  'ARMORY (MP51, terrorist)': { seam: 3622, coplanar: 819, other: 733 },
};

/** GM-15b's two refusals, by the constant each reason names (`uiFramePlan.ts`, `planFrame`'s `say`). */
const FLOOR_WHY = 'UI_GPU_MODEL_DEPTH_FLOOR', RANGE_WHY = 'UI_GPU_MODEL_TEXEL_RANGE';

interface EntryCount { frames: number; modelFrames: number; distinct: number; plans: number; passes: number; triangles: number; seam: number; coplanar: number; other: number; writes: number }
interface Tally {
  entries: number;
  perEntry: Map<string, EntryCount>;
  /** Per scale: the model triangles the `ff` plans draw, and their passes. */
  triangles: Record<number, number>; passes: Record<number, number>;
  software: Map<string, Set<string>>;
  floor: number; range: number;
  /** Frames whose seam double-add count is not 0: entry, frame, scale and the three classes. */
  hits: string[];
  /** Frames counted (distinct model frames x scales). */
  counted: number;
  gl: { frames: number; differing: string[]; modelDraws: number; l1: number };
  /** Review fold F5: one MENULOOP result per dlgMenu entry (the deep link `dlgMenu.rdr` and the 300-frame walk), each asserted. */
  menuloops: Map<string, MenuLoop>;
}
type MenuLoop = { frames: number; withPicture: number; distinct: number; repeats: number; maxStep: number; badStep: string[]; twoMovies: number; planned: number; badPlan: string[] };

function countEntry(e: CorpusEntry, t: Tally): void {
  if (ONLY && !ONLY.test(e.name)) return;
  t.entries++;
  if (e.name.startsWith('dlgMenu')) menuloop(e, t);
  const seen = new Set<string>(), distinct: { items: readonly UiDrawItem[]; frame: number }[] = [];
  let modelFrames = 0;
  e.frames.forEach((items, frame) => {
    if (!hasModels(items)) return;
    modelFrames++;
    const key = listKey(items);
    if (!seen.has(key)) { seen.add(key); distinct.push({ items, frame }); }
  });
  if (!distinct.length) return;
  const c: EntryCount = { frames: e.frames.length, modelFrames, distinct: distinct.length, plans: 0, passes: 0, triangles: 0, seam: 0, coplanar: 0, other: 0, writes: 0 };
  t.perEntry.set(e.name, c);
  const t0 = performance.now();
  for (const scale of SCALES) {
    distinct.forEach(({ items, frame }, k) => {
      let ff: UiFramePlan | null = null;
      for (const blend of BLENDS) {
        const plan = planFrame(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, blend });
        c.plans++;
        if (plan.verdict !== 'gpu') {
          const why = plan.why[0] ?? '(no reason given)';
          if (!t.software.has(why)) t.software.set(why, new Set());
          t.software.get(why)!.add(e.name);
          if (plan.why.some((w) => w.includes(FLOOR_WHY))) t.floor++;
          if (plan.why.some((w) => w.includes(RANGE_WHY))) t.range++;
        }
        if (blend === 'ff') ff = plan;
      }
      const plan = ff!;
      const passSteps = plan.steps.filter((s) => s.kind === 'pass').length;
      const triSteps = plan.steps.filter((s) => s.kind === 'triangles').reduce((n, s) => n + (s.kind === 'triangles' ? s.triangles.length : 0), 0);
      c.passes += passSteps; c.triangles += triSteps;
      t.passes[scale] = (t.passes[scale] ?? 0) + passSteps;
      t.triangles[scale] = (t.triangles[scale] ?? 0) + triSteps;
      const s = seamDoubleAdds(plan);
      t.counted++;
      c.seam += s.seam; c.coplanar += s.coplanar; c.other += s.other; c.writes += s.writes;
      if (s.seam || s.coplanar || s.other) t.hits.push(`${e.name} frame ${frame} ${scale}x: seam ${s.seam}, coplanar ${s.coplanar}, other ${s.other} (of ${s.writes} writes)`);
      if (k === 0 || k === distinct.length - 1 || k % GL_STRIDE === 0) onFakeGl(e, plan, frame, scale, t);
    });
  }
  process.stderr.write(`GM-15c ${e.name}: ${e.frames.length} frames, ${modelFrames} with models, ${distinct.length} distinct; seam ${c.seam}, coplanar ${c.coplanar}, other ${c.other}; ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
}

function onFakeGl(e: CorpusEntry, plan: UiFramePlan, frame: number, scale: number, t: Tally): void {
  const f = fakeGl(), b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: e.transparent });
  if (!b) throw new Error('no backend on the fake GL');
  if (b.refusal(plan)) { t.gl.l1++; return; }
  b.draw(plan);
  t.gl.frames++;
  t.gl.modelDraws += f.draws.filter((d) => d.program.startsWith('model-')).length;
  const got = b.readPixels().data, want = executeFramePlanOnTwin(plan, { divide: false }).frame.data;
  let n = 0;
  for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) n++;
  if (n) t.gl.differing.push(`${e.name} frame ${frame} ${scale}x: ${n} bytes`);
}

function menuloop(e: CorpusEntry, t: Tally): void {
  const m = { frames: e.frames.length, withPicture: 0, distinct: 0, repeats: 0, maxStep: 0, badStep: [] as string[], twoMovies: 0, planned: 0, badPlan: [] as string[] };
  const indices = new Set<number>();
  let last: number | null = null;
  e.frames.forEach((items, frame) => {
    const movies = items.filter((it): it is Extract<UiDrawItem, { kind: 'movie' }> => it.kind === 'movie');
    if (movies.length > 1) m.twoMovies++;
    const pic = movies.find((it) => it.picture)?.picture ?? null;
    if (pic) {
      m.withPicture++;
      const index = (pic.image as { index?: number }).index!;
      indices.add(index);
      if (last !== null) {
        const step = index - last;
        if (step === 0) m.repeats++;
        m.maxStep = Math.max(m.maxStep, step);
        if (step !== 0 && step !== 1) m.badStep.push(`frame ${frame}: picture ${last} -> ${index}`);
      }
      last = index;
    }
    for (const scale of SCALES) {
      const plan = planFrame(items, e.textures, { scale, transparent: e.transparent, movie: moviePixels, blend: 'ff' });
      m.planned++;
      const steps = plan.steps.filter((s): s is Extract<typeof s, { kind: 'movie' }> => s.kind === 'movie');
      const want = pic ? 1 : 0;
      if (steps.length !== want || plan.stats.movies !== want) { m.badPlan.push(`frame ${frame} ${scale}x: ${steps.length} movie steps, want ${want}`); return; }
      if (pic) {
        const r = steps[0]!.rect, W = plan.target.width, H = plan.target.height;
        const expectRect = { xs: 0, ys: 0, xe: Math.min(W, pic.width * scale), ye: Math.min(H, pic.height * scale) };
        if (JSON.stringify(r) !== JSON.stringify(expectRect)) m.badPlan.push(`frame ${frame} ${scale}x: rect ${JSON.stringify(r)}, want ${JSON.stringify(expectRect)}`);
        if (plan.movies[steps[0]!.movie]!.picture !== pic) m.badPlan.push(`frame ${frame} ${scale}x: not the frame's picture`);
      }
    }
  });
  m.distinct = indices.size;
  t.menuloops.set(e.name, m);
}

describe.skipIf(!HAVE_CORPUS_DISC)(`GM-15c: the roller and the ARMORY on the models pass, the seam double-add count, MENULOOP (dev disc)${CORPUS_SKIP}`, () => {
  it('every distinct model frame at 1, 2 and 4 through the plan; the seam double adds counted; a sample on the fake GL equal to the twin; MENULOOP one picture a tick', async () => {
    const t: Tally = { entries: 0, perEntry: new Map(), triangles: {}, passes: {}, software: new Map(), floor: 0, range: 0, hits: [], counted: 0, gl: { frames: 0, differing: [], modelDraws: 0, l1: 0 }, menuloops: new Map() };
    await walkMenuCorpus(recorder, (e) => countEntry(e, t));
    const software = [...t.software].map(([why, names]) => `${why}: ${[...names].join(', ')}`);
    const total = [...t.perEntry.values()].reduce((s, c) => ({ seam: s.seam + c.seam, coplanar: s.coplanar + c.coplanar, other: s.other + c.other }), { seam: 0, coplanar: 0, other: 0 });
    // eslint-disable-next-line no-console
    console.log([
      `GM-15c models corpus${ONLY ? ` FILTERED to /${ONLY.source}/` : ''}: ${t.entries} entries walked, ${t.perEntry.size} with model frames; ${t.counted} frames counted (distinct model frames x scales 1, 2, 4)`,
      ...[...t.perEntry].map(([n, c]) => `  ${n}: ${c.frames} frames, ${c.modelFrames} with models, ${c.distinct} distinct; plans ${c.plans}; ff passes ${c.passes}, triangles ${c.triangles}; model writes ${c.writes}; double adds seam ${c.seam}, coplanar ${c.coplanar}, other ${c.other}`),
      `ff plans per scale: ${SCALES.map((s) => `${s}x passes ${t.passes[s] ?? 0}, triangles ${t.triangles[s] ?? 0}`).join('; ')}`,
      `software verdicts: ${software.length ? software.join(' | ') : 'none'}`,
      `GM-15b's refusals (plans): depth floor ${t.floor}, texel range ${t.range}`,
      `seam double adds over the corpus: seam ${total.seam}, coplanar ${total.coplanar}, other ${total.other}; frames with any: ${t.hits.length} of ${t.counted}`,
      ...t.hits.slice(0, 400).map((h) => `  ${h}`),
      ...(t.hits.length > 400 ? [`  ... ${t.hits.length - 400} more`] : []),
      `fake GL: ${t.gl.frames} frames drawn (${t.gl.l1} refused), model draws ${t.gl.modelDraws}, differing from the twin ${t.gl.differing.length}`,
      ...t.gl.differing.map((d) => `  ${d}`),
      ...(t.menuloops.size ? [...t.menuloops].flatMap(([n, m]) => [
        `MENULOOP (${n}): ${m.frames} frames, ${m.withPicture} with a picture, ${m.distinct} distinct pictures, ${m.repeats} repeats, max step ${m.maxStep}, frames with two movie items ${m.twoMovies}; ${m.planned} plans, wrong movie steps ${m.badPlan.length}`,
        ...[...m.badStep, ...m.badPlan].slice(0, 40).map((x) => `  ${x}`),
      ]) : ['MENULOOP: not walked']),
    ].join('\n'));
    expect(t.entries).toBeGreaterThan(0);
    if (!ONLY) {
      expect(t.entries, 'the corpus\'s entries').toBe(116);
      for (const name of ['dlgMenu + MENULOOP (300 frames)', 'ARMORY (MP51, seal)', 'ARMORY (MP51, terrorist)']) {
        const c = t.perEntry.get(name);
        expect(c, `${name}: model frames`).toBeDefined();
        expect(c!.triangles, `${name}: model triangles through the plan`).toBeGreaterThan(0);
        expect(c!.passes, `${name}: passes`).toBeGreaterThan(0);
      }
      for (const s of SCALES) expect(t.triangles[s], `${s}x: triangles`).toBeGreaterThan(0);
      expect(t.menuloops.size, 'MENULOOP walked').toBeGreaterThan(0);
    }
    // GM-15b's refusals send no model frame of the corpus to L1, as on GM-07's run.
    expect(t.floor, 'plans refused by UI_GPU_MODEL_DEPTH_FLOOR').toBe(0);
    expect(t.range, 'plans refused by UI_GPU_MODEL_TEXEL_RANGE').toBe(0);
    expect(software, 'software verdicts on model frames').toEqual([]);
    expect(t.gl.differing, 'fake GL frames differing from the twin').toEqual([]);
    expect(t.gl.frames, 'fake GL frames drawn').toBeGreaterThan(0);
    expect(t.gl.modelDraws, 'model draws on the fake GL').toBeGreaterThan(0);
    // Review fold F5: each dlgMenu entry's own MENULOOP result, the deep link's too (it was computed and overwritten).
    if (!ONLY) expect([...t.menuloops.keys()].sort(), 'the dlgMenu entries walked for MENULOOP').toEqual(['dlgMenu + MENULOOP (300 frames)', 'dlgMenu.rdr']);
    for (const [n, m] of t.menuloops) {
      expect(m.twoMovies, `${n}: frames with two movie items`).toBe(0);
      expect(m.badStep, `${n}: pictures advancing by more than one a frame`).toEqual([]);
      expect(m.badPlan, `${n}: frames whose plan does not carry exactly their picture`).toEqual([]);
      expect(m.planned, `${n}: plans made (every frame at every scale)`).toBe(m.frames * SCALES.length);
      if (n.includes('MENULOOP')) expect(m.withPicture, `${n}: frames with a MENULOOP picture`).toBeGreaterThan(0);
    }
    // R1, the controller's ruling (b6, 2026-11-06; the plan's Log): pinned and deferred. These counts are the known
    // software-vs-f32 difference -- readings of the port's own output, not the original's -- and are re-pinned on any
    // change with the reason in the commit. "Hits = 0" stays an open precondition of GM-17's gate, where the choice
    // between matching the double add on the GPU and L1 is made with GM-27's real-GPU reading. No refusal is added here.
    if (!ONLY) {
      const perEntry = Object.fromEntries([...t.perEntry].map(([n, c]) => [n, { seam: c.seam, coplanar: c.coplanar, other: c.other }]));
      expect(perEntry, 'seam double adds per entry (R1, pinned)').toEqual(GM15C_DOUBLE_ADDS);
      expect(total, 'seam double adds on the corpus (R1, pinned)').toEqual({ seam: 3622, coplanar: 88465, other: 814 });
      expect(t.hits.length, 'frames (x scales) with a double add (R1, pinned)').toBe(85);
    }
  }, 7_200_000);
});
