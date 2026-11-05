import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UI_FRAME, type UiClip, type UiDrawItem } from '@s2u/ui';
import { UiQuadRasterCache, type RasterOptions, type UiBitmap, type UiBlend, type UiTextures } from '../src/uiCompositorView';
import * as compositor from '../src/uiCompositorView';
import { blendAfterBind, coverageBounds, scaleAt, scaleClip } from '../src/uiRasterRules';
import { quadRoute, triangleRoute } from '../src/uiFramePlan';
import { CORPUS_SKIP, HAVE_CORPUS_DISC, walkMenuCorpus, type RecordedFrame } from './uiGpuCorpus';

/**
 * GM-04, the G0 tally (research 380 §3; the plan `docs/plans/2026-11-01-gpu-menus.md`, GM-04's row): over the menus'
 * draw lists as the page makes them from the dev disc -- the 114 dialogs of READERC and READERX (each a deep link run
 * 60 frames), dlgMenu with MENULOOP (300 frames, the roller turning), CREATE GAME (the rig's PLAY LIST, four maps),
 * the shared ARMORY (MP51, both sides), the in-match Settings overlay (its pages) and the loader screens (the whole
 * sequence) -- at the scales 1, 2 and 4: the 2D quads the GPU drawer's fixed-function blend cannot take (by reason),
 * the model triangles likewise, the largest alpha byte per entry, the alpha bytes that are not whole numbers, and the
 * write-mask probe (the software's own writes against the coverage rule's rectangles).
 *
 * **What it reads, kept apart.** The draw lists are `@s2u/ui`'s and the page's (reading); the routing below is the
 * planner's routing of the plan's rules P10, P11, P13 and P23 (research 380 §2.1; `quadRoute`, GM-06a, which folded
 * GM-04 review F1); the probe drives the software drawer
 * (`rasterizeUiDrawList`) on a probe list made from each frame. The movie pictures are the black stand-in
 * (`BlackPictureSource`): a picture is a copy step whatever its pixels, so the tally does not see them.
 *
 * The tally is written to research 380 §3 between the markers; this test asserts the note's table is the one it
 * computes. `GM04_TALLY_WRITE=1` rewrites the note's block instead (the tool's mode). Skips without the disc
 * (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`), naming it.
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

const NOTE = resolve(import.meta.dirname, '../../../docs/research/380-the-gpu-menu-drawer.md');
const BEGIN = '<!-- GM-04 tally: begin (written by packages/viewer/test/uiGpuTally.disc.test.ts) -->';
const END = '<!-- GM-04 tally: end -->';
const SCALES = [1, 2, 4] as const;

/** Why a 2D quad goes to the programmable path (research 380 §2.1); the first that holds, in this order. */
type Reason = 'colour' | 'negative' | 'over1' | 'fade';
const REASONS: readonly Reason[] = ['colour', 'negative', 'over1', 'fade'];

interface Quad { x0: number; y0: number; x1: number; y1: number; clip: UiClip | null; textured: boolean; rgba: readonly number[]; blend: UiBlend }
interface Tri { xs: readonly number[]; ys: readonly number[]; textured: boolean; rgba: readonly (readonly number[])[]; blend: UiBlend }
interface Walk { quads: Quad[]; tris: Tri[]; copies: number }

/**
 * A frame's quads and triangles as the software draws them, with the `ALPHA_1` each is drawn under -- the walk of
 * `rasterizeUiDrawList` and `drawModels` (`GS_ALPHA_FRAME_START_READING`, `blendAfterBind`, `UI_MESH_BIND_READING`): a
 * missing bitmap is not drawn and binds nothing; an untextured quad takes the register as it stands; the movie with no
 * picture is a black untextured quad at alpha 128 that leaves the register; a picture is a copy.
 */
function walk(items: readonly UiDrawItem[], textures: UiTextures): Walk {
  const quads: Quad[] = [], tris: Tri[] = [];
  let copies = 0;
  let reg: UiBlend = 'source';
  for (const it of items) {
    if (it.kind === 'movie') {
      if (it.picture) copies++;
      else quads.push({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, clip: null, textured: false, rgba: [0, 0, 0, 128], blend: 'source' });
    } else if (it.kind === 'sprite') {
      if (it.texture === null) { quads.push({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, clip: it.clip, textured: false, rgba: it.rgba, blend: reg }); continue; }
      const b = textures(it.texture);
      if (!b) continue;
      reg = blendAfterBind(b);
      quads.push({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, clip: it.clip, textured: true, rgba: it.rgba, blend: reg });
    } else if (it.kind === 'glyphs') {
      for (const q of it.quads) {
        const b = textures(q.texture);
        if (!b) continue;
        reg = blendAfterBind(b);
        quads.push({ x0: q.left, y0: q.top, x1: q.right, y1: q.bottom, clip: it.clip, textured: true, rgba: q.rgba, blend: reg });
      }
    } else if (it.kind === 'models' && it.triangles) {
      for (const t of it.triangles) {
        const area = (t.b.x - t.a.x) * (t.c.y - t.a.y) - (t.c.x - t.a.x) * (t.b.y - t.a.y);
        if (area === 0 || (t.cull && area > 0)) continue;
        const b = t.texture === null ? null : textures(t.texture);
        if (t.texture !== null && !b) continue;
        if (b) reg = blendAfterBind(b);
        tris.push({ xs: [t.a.x, t.b.x, t.c.x], ys: [t.a.y, t.b.y, t.c.y], textured: b !== null, rgba: [t.a.rgba, t.b.rgba, t.c.rgba], blend: reg });
      }
    }
  }
  return { quads, tris, copies };
}

const finite = (v: readonly number[]): boolean => v.every(Number.isFinite);

/**
 * The 2D routing (research 380 §2.1) is the planner's own, under `ff` (`quadRoute`, `uiFramePlan.ts`, GM-06a): P23 a
 * colour the fixed-function output would clamp before the blend (a non-finite value; a negative RGB; an untextured RGB
 * over 255) or a non-finite alpha; P10/P11 an alpha under 0; P10 a source-blend alpha over 1 (`rgba[3] > 128`); P13 an
 * untextured quad whose alpha is not whole (neither 0 nor 128), always programmable. Until GM-06a this test carried
 * its own statement with P13 as `0 < rgba[3] < 128`, which routed dlgMenu's MENUFADER packed to 254 under the roller's
 * additive to `ff` (GM-04 review F1); one routing now serves both. Null: fixed-function.
 */
function quadReason(q: Quad): Reason | null {
  return quadRoute(q, 'ff') as Reason | null;
}
/**
 * A model triangle's routing is the planner's own (`triangleRoute`, `uiFramePlan.ts`, GM-06b): the quads' P23 rules
 * over its three vertices (the interpolated colour stays within them). Until GM-06b's review fold (F2) this test carried
 * its own statement of the same rules, which could drift from the planner's without a test failing. Null: fixed-function.
 */
function triReason(t: Tri): Reason | null {
  return triangleRoute(t);
}
/** The software skips an untextured quad whose colour is finite and alpha exactly 0 (P9). */
const skipped = (q: Quad): boolean => !q.textured && finite(q.rgba.slice(0, 3)) && q.rgba[3] === 0;

function bounds(q: Quad, s: number): { xs: number; ys: number; xe: number; ye: number } | null {
  const at = scaleAt(s), clipAt = scaleClip(s);
  return coverageBounds(at(q.x0), at(q.y0), at(q.x1), at(q.y1), UI_FRAME.width * s, UI_FRAME.height * s, clipAt(q.clip));
}
function triBox(t: Tri, s: number): number {
  const W = UI_FRAME.width * s, H = UI_FRAME.height * s, xs = t.xs.map((x) => x * s), ys = t.ys.map((y) => y * s);
  const x0 = Math.max(0, Math.ceil(Math.min(...xs))), x1 = Math.min(W, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.ceil(Math.min(...ys))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}

/** The probe's texture: one white texel, additive, so each textured probe quad adds ~2 (255 x 1 / 128 x 255 / 255) to every pixel it writes. */
const PROBE = '__gm04_probe';
const PROBE_BITMAP: UiBitmap = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]), blend: 'additive' };

/**
 * The write-mask probe (d-three §14.1; plan GM-04): the frame's quads redrawn by the software drawer, each textured one
 * through the textured path on a white additive texel at colour 1 (it adds 1.9921875, stored as 2) and each untextured
 * one at colour 2, alpha 128 (it adds 2), the register made additive first; so a pixel's byte is twice the number of
 * quads that wrote it. Against it, the rectangles of `coverageBounds` at the scale (the planner's rule). Returns the
 * pixels where the two differ (0 is the pass).
 */
function probe(w: Walk, s: number): { written: number; differing: number } {
  const items: UiDrawItem[] = [
    { kind: 'clear', rgb: [0, 0, 0] },
    { kind: 'sprite', node: 'bind', texture: PROBE, x0: 0, y0: 0, x1: 0, y1: 0, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, 0], clip: null },
  ];
  const W = UI_FRAME.width * s, H = UI_FRAME.height * s, want = new Uint16Array(W * H);
  for (const q of w.quads) {
    if (skipped(q)) continue;
    items.push(q.textured
      ? { kind: 'sprite', node: 'p', texture: PROBE, x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [1, 1, 1, 128], clip: q.clip }
      : { kind: 'sprite', node: 'p', texture: null, x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, u0: 0, v0: 0, u1: 0, v1: 0, rgba: [2, 2, 2, 128], clip: q.clip });
    const b = bounds(q, s);
    if (!b) continue;
    for (let y = b.ys; y < b.ye; y++) for (let x = b.xs; x < b.xe; x++) want[y * W + x]! += 1;
  }
  const { frame } = compositor.rasterizeUiDrawList(items, (n) => (n === PROBE ? PROBE_BITMAP : null), { scale: s, quadCache: new UiQuadRasterCache() });
  let differing = 0, written = 0;
  for (let i = 0; i < W * H; i++) {
    if (frame.data[i * 4]! > 0) written++;
    if (frame.data[i * 4]! !== Math.min(255, 2 * want[i]!)) differing++;
  }
  return { written, differing };
}

/** One corpus entry's tally. */
interface Entry {
  name: string;
  frames: number;
  /** The most quads drawn in one frame, at scale 1. */
  quads: number;
  alphaMax: number;
  alphaMin: number;
  /** Quads (over every frame) whose alpha byte is not a whole number. */
  fractional: number;
  /** Per scale: the most programmable quads in one frame by reason, and the most programmable pixels in one frame. */
  prog: Record<number, { by: Record<Reason, number>; pixels: number }>;
  /** The most model triangles drawn in one frame (scale 1), and the most needing the programmable path, by reason. */
  tris: number;
  triProg: Record<Reason, number>;
  modelAlphaMax: number;
  copies: number;
  /** The probe on the entry's last frame, per scale: the pixels the software wrote, and those differing from the rule's. */
  probe: Record<number, { written: number; differing: number }>;
}

const zero = (): Record<Reason, number> => ({ colour: 0, negative: 0, over1: 0, fade: 0 });

function tally(name: string, frames: readonly (readonly UiDrawItem[])[], textures: UiTextures): Entry {
  const e: Entry = {
    name, frames: frames.length, quads: 0, alphaMax: -Infinity, alphaMin: Infinity, fractional: 0,
    prog: Object.fromEntries(SCALES.map((s) => [s, { by: zero(), pixels: 0 }])), tris: 0, triProg: zero(), modelAlphaMax: -Infinity, copies: 0,
    probe: {},
  };
  let last: Walk | null = null;
  for (const items of frames) {
    const w = walk(items, textures);
    last = w;
    e.copies = Math.max(e.copies, w.copies);
    for (const q of w.quads) {
      const a = q.rgba[3]!;
      e.alphaMax = Math.max(e.alphaMax, a); e.alphaMin = Math.min(e.alphaMin, a);
      if (!Number.isInteger(a)) e.fractional++;
    }
    for (const s of SCALES) {
      const by = zero();
      let drawn = 0, pixels = 0;
      for (const q of w.quads) {
        if (skipped(q)) continue;
        const b = bounds(q, s);
        if (!b) continue;
        drawn++;
        const r = quadReason(q);
        if (r) { by[r]++; pixels += (b.xe - b.xs) * (b.ye - b.ys); }
      }
      if (s === 1) e.quads = Math.max(e.quads, drawn);
      const p = e.prog[s]!;
      for (const r of REASONS) p.by[r] = Math.max(p.by[r], by[r]);
      p.pixels = Math.max(p.pixels, pixels);
    }
    const tby = zero();
    let tdrawn = 0;
    for (const t of w.tris) {
      for (const c of t.rgba) e.modelAlphaMax = Math.max(e.modelAlphaMax, c[3]!);
      if (triBox(t, 1) === 0) continue;
      tdrawn++;
      const r = triReason(t);
      if (r) tby[r]++;
    }
    e.tris = Math.max(e.tris, tdrawn);
    for (const r of REASONS) e.triProg[r] = Math.max(e.triProg[r], tby[r]);
  }
  if (last) for (const s of SCALES) e.probe[s] = probe(last, s);
  return e;
}

const num = (v: number): string => (Number.isFinite(v) ? String(v) : '--');
const reasons = (by: Record<Reason, number>): string => {
  const parts = REASONS.filter((r) => by[r] > 0).map((r) => `${r} ${by[r]}`);
  return parts.length ? parts.join(', ') : '0';
};
const perScale = (f: (s: number) => string): string => {
  const v = SCALES.map(f);
  return v.every((x) => x === v[0]) ? v[0]! : v.join(' / ');
};

/** The corpus at a glance, per scale: what decides the routing's cost, GM-26 and the probe. */
function summary(entries: readonly Entry[]): string {
  const most = (f: (e: Entry) => number): number => Math.max(0, ...entries.map(f));
  const sum = (f: (e: Entry) => number): number => entries.reduce((a, e) => a + f(e), 0);
  const by = (s: number): Record<Reason, number> => Object.fromEntries(REASONS.map((r) => [r, most((e) => e.prog[s]!.by[r])])) as Record<Reason, number>;
  const tri = Object.fromEntries(REASONS.map((r) => [r, most((e) => e.triProg[r])])) as Record<Reason, number>;
  const fractional = entries.filter((e) => e.fractional > 0).map((e) => `${e.name} (${e.fractional})`);
  return [
    '| Over the corpus | Scale 1 | Scale 2 | Scale 4 |',
    '|---|---|---|---|',
    `| Entries | ${entries.length} | ${entries.length} | ${entries.length} |`,
    `| Entries with a programmable quad | ${SCALES.map((s) => entries.filter((e) => REASONS.some((r) => e.prog[s]!.by[r] > 0)).length).join(' | ')} |`,
    `| Programmable quads, most in one frame, by reason | ${SCALES.map((s) => reasons(by(s))).join(' | ')} |`,
    `| Programmable pixels, most in one frame | ${SCALES.map((s) => most((e) => e.prog[s]!.pixels)).join(' | ')} |`,
    `| Model triangles, most in one frame / programmable | ${most((e) => e.tris)} / ${reasons(tri)} | same | same |`,
    `| Largest alpha byte (2D) / model vertex alpha | ${most((e) => (Number.isFinite(e.alphaMax) ? e.alphaMax : 0))} / ${most((e) => (Number.isFinite(e.modelAlphaMax) ? e.modelAlphaMax : 0))} | same | same |`,
    `| Quads with a fractional alpha byte (quad-frames) | ${fractional.length ? fractional.join('; ') : 'none'} | same | same |`,
    `| Probe on each entry's last frame: pixels written / differing | ${SCALES.map((s) => `${sum((e) => e.probe[s]?.written ?? 0)} / ${sum((e) => e.probe[s]?.differing ?? 0)}`).join(' | ')} |`,
  ].join('\n');
}

function table(entries: readonly Entry[]): string {
  const rows = [
    '| Entry | Frames | Quads (most in a frame) | Alpha byte min .. max | Fractional alpha bytes | Programmable quads, most in a frame, by reason (scale 1 / 2 / 4) | Programmable pixels, most in a frame (1 / 2 / 4) | Model triangles (most) | Programmable triangles | Model alpha max | Probe px differing (1 / 2 / 4) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const e of entries) {
    rows.push(`| ${e.name} | ${e.frames} | ${e.quads} | ${num(e.alphaMin)} .. ${num(e.alphaMax)} | ${e.fractional} | ${perScale((s) => reasons(e.prog[s]!.by))} | ${SCALES.map((s) => e.prog[s]!.pixels).join(' / ')} | ${e.tris} | ${reasons(e.triProg)} | ${num(e.modelAlphaMax)} | ${perScale((s) => String(e.probe[s]?.differing ?? '--'))} |`);
  }
  return rows.join('\n');
}

describe.skipIf(!HAVE_CORPUS_DISC)(`GM-04: the G0 tally over the menus' draw lists (dev disc)${CORPUS_SKIP}`, () => {
  it('tallies the corpus at the scales 1, 2 and 4, and research 380 §3 files the same table', async () => {
    const entries: Entry[] = [];
    // The corpus is `uiGpuCorpus.ts`'s (moved there for GM-07, not rewritten); each entry tallied as it is made.
    await walkMenuCorpus(recorder, (c) => { entries.push(tally(c.name, c.frames, c.textures)); });

    // The decisions the tally carries, pinned beside the note's table: the probe is exact and not vacuous at every scale,
    // and no model triangle needs the programmable path (GM-26 is not needed by the corpus).
    for (const s of SCALES) {
      expect(entries.reduce((a, e) => a + (e.probe[s]?.differing ?? 0), 0), `probe differing at ${s}`).toBe(0);
      expect(entries.reduce((a, e) => a + (e.probe[s]?.written ?? 0), 0), `probe written at ${s}`).toBeGreaterThan(0);
    }
    expect(entries.reduce((a, e) => a + REASONS.reduce((b, r) => b + e.triProg[r], 0), 0), 'programmable model triangles').toBe(0);
    expect(Math.max(...entries.map((e) => e.tris)), 'model triangles drawn somewhere').toBeGreaterThan(0);
    const got = `${summary(entries)}\n\n${table(entries)}`;
    // eslint-disable-next-line no-console
    console.log(got);
    const note = readFileSync(NOTE, 'utf8').replace(/\r\n/g, '\n');   // a checkout's line endings are its own
    const at = note.indexOf(BEGIN), end = note.indexOf(END);
    if (process.env.GM04_TALLY_WRITE === '1') {
      expect(at, 'the note\'s begin marker').toBeGreaterThan(0);
      // Without the end marker (or with it before the begin), `slice(end)` would mangle the note's tail: refuse instead.
      expect(end, 'the note\'s end marker, after the begin').toBeGreaterThan(at);
      writeFileSync(NOTE, `${note.slice(0, at + BEGIN.length)}\n\n${got}\n\n${note.slice(end)}`);
      return;
    }
    expect(at, 'research 380 §3 carries the tally\'s markers').toBeGreaterThan(0);
    expect(note.slice(at + BEGIN.length, end).trim()).toBe(got);
  }, 1_800_000);
});

