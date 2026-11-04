import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CROUCH_ROOT, PAGE_ANIM_COLUMNS, PRONE_BELOW, QUESTION_CSV_NOTE, ROOT_SETTLE_EPSILON, ROOT_TOLERANCE, STAND_ROOT, buildRunRecord,
  collapseFrames, frameAtOrAfter, idleDefinitions, pageCrouchIdle, pcsx2CrouchIdle, questionCsv, skewFrames,
  stanceOfRoot, type PageRow, type PcsxRow,
} from '../eph/record';
import type { Fired } from '../eph/timeline';
import type { ScriptEvent } from '../eph/script';

/**
 * The run record and the per-question CSV (EPH-2 step 3; the design note's "Per-frame records"). Pure: synthetic
 * series in, frames and text out. The PCSX2 crouch idle is the root's band (desktop@be5578311:tools_py/parity/
 * seal_speed_fit.py stance_of), the page's the walk's stance crouch with no action holding the mover.
 */
const FRAME_S = 1 / 60;

/** One PCSX2 row per guest frame from `t0`, the root y given per frame; each frame sampled `dup` times. */
const pcsxSeries = (roots: number[], t0 = 10, dup = 1): PcsxRow[] =>
  roots.flatMap((rootY, i) => Array.from({ length: dup }, () => ({ t: t0 + i * FRAME_S, rootY, stanceRequest: 0 })));

const pageSeries = (frames: { stance: 'stand' | 'crouch' | 'prone'; action: string | null }[], tick0 = 500): PageRow[] =>
  frames.map((f, i) => ({ tick: tick0 + i, stance: f.stance, posture: f.stance, action: f.action === null ? null : { name: f.action, t: 0, reversed: false } }));

describe('stanceOfRoot (seal_speed_fit.stance_of)', () => {
  it('carries the fit bands: stand 11.484, crouch 5.504, each +-0.5; prone under 5.004', () => {
    expect([STAND_ROOT, CROUCH_ROOT, ROOT_TOLERANCE]).toEqual([11.484, 5.504, 0.5]);
    expect(PRONE_BELOW).toBeCloseTo(5.004, 12);
  });

  it('reads stand, crouch, prone and unknown', () => {
    expect(stanceOfRoot(11.48)).toBe('stand');
    expect(stanceOfRoot(11.984)).toBe('stand');
    expect(stanceOfRoot(5.5)).toBe('crouch');
    expect(stanceOfRoot(5.004)).toBe('crouch');
    expect(stanceOfRoot(5.0)).toBe('prone');
    expect(stanceOfRoot(1.8)).toBe('prone');
    expect(stanceOfRoot(8)).toBe('unknown');
    expect(stanceOfRoot(13)).toBe('unknown');
    expect(stanceOfRoot(Number.NaN)).toBe('unknown');
  });
});

describe('collapseFrames and frameAtOrAfter', () => {
  it('keeps one row per guest clock value, in order', () => {
    const rows = pcsxSeries([11.48, 11.48, 5.5], 10, 3);
    const f = collapseFrames(rows);
    expect(f).toHaveLength(3);
    expect(f.map((r) => r.rootY)).toEqual([11.48, 11.48, 5.5]);
  });

  it('finds the first frame at or after a time', () => {
    const f = collapseFrames(pcsxSeries([1, 2, 3, 4]));
    expect(frameAtOrAfter(f.map((r) => r.t), 10 + 1.5 * FRAME_S)).toBe(2);
    expect(frameAtOrAfter(f.map((r) => r.t), 10)).toBe(0);
    expect(frameAtOrAfter(f.map((r) => r.t), 99)).toBeNull();
  });
});

describe('pcsx2CrouchIdle (a proxy: the root settled in the crouch band, after it first leaves that state)', () => {
  it('names the settle bound, an adaptation of the instrument', () => {
    expect(ROOT_SETTLE_EPSILON).toBe(0.01);
  });

  it('counts frames from the act to the first of N frames settled in the crouch band', () => {
    // prone 6 frames, rising 3, then crouch 10; act at frame 2. Frame 9 reaches the band but moved 0.6: frame 10 settles.
    const roots = [2, 2, 2, 2, 2, 2, 3.5, 4.2, 4.9, ...Array(10).fill(5.5)];
    const rows = pcsxSeries(roots, 10, 2);
    expect(pcsx2CrouchIdle(rows, 10 + 2 * FRAME_S, 5)).toEqual({ actFrame: 2, idleFrame: 10, frames: 8 });
  });

  it('does not take a settled pass shorter than N frames, and is null when none is held', () => {
    const roots = [11.48, 5.5, 5.5, 11.48, 11.48, 5.5, 5.5, 5.5];
    expect(pcsx2CrouchIdle(pcsxSeries(roots), 10, 2)).toEqual({ actFrame: 0, idleFrame: 6, frames: 6 });
    expect(pcsx2CrouchIdle(pcsxSeries(roots), 10, 3)).toBeNull();
  });

  it('measures a bounce whose root never leaves the crouch band (the old in-band reading gave 0 frames)', () => {
    // Crouched and settled, a drop starts (every root still inside 5.504 +- 0.5), the light act lands on the first
    // dropping frame (index 4), the root comes back and settles at index 13.
    const roots = [5.5, 5.5, 5.5, 5.5, 5.45, 5.38, 5.3, 5.2, 5.1, 5.2, 5.35, 5.45, 5.5, 5.5, ...Array(8).fill(5.5)];
    expect(roots.every((r) => stanceOfRoot(r) === 'crouch')).toBe(true);
    const got = pcsx2CrouchIdle(pcsxSeries(roots), 10 + 4 * FRAME_S, 6);
    expect(got).toEqual({ actFrame: 4, idleFrame: 13, frames: 9 });
  });

  it('waits for the root to leave the settled state when the act lands while it is still settled', () => {
    // Settled through the act (index 2) and two more frames, moves at index 5..7, settles again from index 8.
    const roots = [5.5, 5.5, 5.5, 5.5, 5.5, 5.3, 5.4, 5.5, 5.5, 5.5, 5.5];
    expect(pcsx2CrouchIdle(pcsxSeries(roots), 10 + 2 * FRAME_S, 3)).toEqual({ actFrame: 2, idleFrame: 8, frames: 6 });
  });

  it('is null when the root never leaves the settled crouch after the act', () => {
    expect(pcsx2CrouchIdle(pcsxSeries(Array(20).fill(5.5)), 10 + 2 * FRAME_S, 6)).toBeNull();
  });

  it('takes the settle bound as a parameter', () => {
    // Steps of 0.005: settled under the default 0.01, moving under 0.001.
    const roots = [5.3, 5.5, 5.505, 5.51, 5.515, 5.52, 5.525];
    expect(pcsx2CrouchIdle(pcsxSeries(roots), 10, 3)).toEqual({ actFrame: 0, idleFrame: 2, frames: 2 });
    expect(pcsx2CrouchIdle(pcsxSeries(roots), 10, 3, 0.001)).toBeNull();
  });
});

describe('pageCrouchIdle', () => {
  it('counts ticks from the act tick to the first of N ticks crouched with no action', () => {
    const frames = [
      ...Array(3).fill({ stance: 'prone', action: 'crouchToProne' }),
      ...Array(4).fill({ stance: 'crouch', action: 'crouchToProne' }),
      ...Array(6).fill({ stance: 'crouch', action: null }),
    ];
    expect(pageCrouchIdle(pageSeries(frames), 501, 4)).toEqual({ actFrame: 501, idleFrame: 507, frames: 6 });
  });

  it('collapses repeated reads of one tick and is null when the idle is not held N ticks', () => {
    const rows = pageSeries([{ stance: 'crouch', action: null }, { stance: 'crouch', action: null }]);
    expect(pageCrouchIdle(rows.flatMap((r) => [r, r]), 500, 2)).toEqual({ actFrame: 500, idleFrame: 500, frames: 0 });
    expect(pageCrouchIdle(rows, 500, 3)).toBeNull();
  });
});

describe('skew and the run record', () => {
  const ev = (t: number, line: number): ScriptEvent => ({ t, input: 'triangle', pressure: 1, line });
  const fired = (e: ScriptEvent, lateBy: number): Fired => ({ event: e, at: e.t + lateBy, lateBy });

  it('skewFrames is the difference of the two late-bys in 60 Hz frames', () => {
    expect(skewFrames(0, 1000 / 60)).toBeCloseTo(1, 12);
    expect(skewFrames(20, 5)).toBeCloseTo(0.9, 12);
  });

  it('pairs each event by its script line, flags a skew over one frame, and carries the run facts', () => {
    const a = ev(0, 1), b = ev(250, 2);
    const rec = buildRunRecord({
      pcsx2Version: 'PCSX2 v2.2.0', renderer: 'Renderer = 13 (PCSX2.ini)', pageBuild: 'abc1234', script: '0 triangle 1\n250 triangle 0\n',
      pcsx2Fired: [fired(a, 2), fired(b, 10)], pageFired: [fired(a, 4), fired(b, 40)], tornRows: 3, nullRows: 1,
      pcsx2WallFps: 31.5,
    });
    expect(rec.pcsx2Version).toBe('PCSX2 v2.2.0');
    expect(rec.renderer).toBe('Renderer = 13 (PCSX2.ini)');
    expect(rec.pageBuild).toBe('abc1234');
    expect(rec.tornRows).toBe(3);
    expect(rec.nullRows).toBe(1);
    expect(rec.pcsx2WallFps).toBe(31.5);
    expect(rec.events.map((e) => [e.line, e.pcsx2LateMs, e.pageLateMs, e.flagged])).toEqual([[1, 2, 4, false], [2, 10, 40, true]]);
    expect(rec.events[1]!.skewFrames).toBeCloseTo(1.8, 12);
    expect(rec.maxSkewFrames).toBeCloseTo(1.8, 12);
    expect(rec.skewFlagged).toBe(true);
  });

  it('keeps an event one side never fired, with a null late-by and the flag', () => {
    const a = ev(0, 1);
    const rec = buildRunRecord({ pcsx2Version: 'v', renderer: 'r', pageBuild: 'b', script: '', pcsx2Fired: [fired(a, 0)], pageFired: [], tornRows: 0, nullRows: 0 });
    expect(rec.events).toEqual([{ line: 1, t: 0, input: 'triangle', pressure: 1, pcsx2LateMs: 0, pageLateMs: null, skewFrames: null, pageEventExpected: true, flagged: true }]);
    expect(rec.skewFlagged).toBe(true);
  });

  it('does not flag a line the page translation leaves without a page event by design (a light Triangle press)', () => {
    // 0 triangle 0.2 (no page event: the page acts at the release), 100 triangle 0 (Crouch down and up).
    const press: ScriptEvent = { t: 0, input: 'triangle', pressure: 0.2, line: 1 };
    const release: ScriptEvent = { t: 100, input: 'triangle', pressure: 0, line: 2 };
    const rec = buildRunRecord({
      pcsx2Version: 'v', renderer: 'r', pageBuild: 'b', script: '', tornRows: 0, nullRows: 0,
      pcsx2Fired: [fired(press, 2), fired(release, 3)], pageFired: [fired(release, 4)], pageLines: [2],
    });
    expect(rec.events.map((e) => [e.line, e.pageEventExpected, e.flagged])).toEqual([[1, false, false], [2, true, false]]);
    expect(rec.skewFlagged).toBe(false);
    // A line the page should have fired and did not is still flagged.
    const missed = buildRunRecord({
      pcsx2Version: 'v', renderer: 'r', pageBuild: 'b', script: '', tornRows: 0, nullRows: 0,
      pcsx2Fired: [fired(press, 2), fired(release, 3)], pageFired: [], pageLines: [2],
    });
    expect(missed.events.map((e) => [e.line, e.flagged])).toEqual([[1, false], [2, true]]);
    expect(missed.skewFlagged).toBe(true);
  });
});

describe('questionCsv', () => {
  const defs = idleDefinitions(6, 0.01);

  it('names both crouch-idle definitions, with no comma inside either', () => {
    expect(defs.pcsx2).toBe('root y in the crouch band 5.504+-0.5 and its frame-to-frame change under 0.01 for 6 guest frames; counted once the root has first left that settled state after the act');
    expect(defs.page).toBe('walk stance crouch with no action holding the mover for 6 ticks (the mover action end)');
    expect(defs.pcsx2).not.toContain(',');
    expect(defs.page).not.toContain(',');
  });

  it('writes one row per act, both sides, empty cells for a side with no idle, and each definition', () => {
    const text = questionCsv('3a', [
      { repeat: 1, kind: 'light', line: 4, pcsx2: { actFrame: 2, idleFrame: 9, frames: 7 }, page: { actFrame: 501, idleFrame: 507, frames: 6 } },
      { repeat: 2, kind: 'full', line: 9, pcsx2: null, page: { actFrame: 1, idleFrame: 3, frames: 2 } },
    ], defs);
    expect(text).toBe([
      'question,repeat,act,script_line,pcsx2_act_frame,pcsx2_idle_frame,pcsx2_frames,page_act_tick,page_idle_tick,page_frames,pcsx2_idle_definition,page_idle_definition',
      `3a,1,light,4,2,9,7,501,507,6,${defs.pcsx2},${defs.page}`,
      `3a,2,full,9,,,,1,3,2,${defs.pcsx2},${defs.page}`,
      '',
    ].join('\n'));
  });

  it('carries the note record.json gives the CSV: a proxy measure', () => {
    expect(QUESTION_CSV_NOTE).toBe('proxy measure: root-height settle on PCSX2 vs mover action end on the page; raw series in pcsx2.csv/page.csv');
  });
});

describe("page.csv's anim columns (the movement hunt, fix 3)", () => {
  it("restate viewer ephFrame.ts EphFrame's anim fields, in order: the play, its clip and phase, the posed root height", () => {
    expect(PAGE_ANIM_COLUMNS).toEqual(['animPlay', 'animClip', 'animPhase', 'rootHeight']);
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../packages/viewer/src/ephFrame.ts'), 'utf8');
    for (const k of PAGE_ANIM_COLUMNS) expect(src, k).toMatch(new RegExp(`^  ${k}: (string|number) \\| null;$`, 'm'));
  });
});
