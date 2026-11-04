import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analysisCsv, analyzeRun, pageSeries, parseCsv, pcsx2Series, tiltTable, type AnalysisRow } from '../eph/analyze';
import { seriesCsv } from '../eph/record';
import { keyActions } from '../eph/padIni';
import { actMoments, pageEvents } from '../eph/pageMap';
import { isStickHalf, parseScript } from '../eph/script';
import {
  SETTLE_DEG, TILT_METRICS, angleDeg, measureTilt, pitchDeg, rollDeg, rotateByQuat, tiltDeg, worldToBody, type Vec3,
} from '../eph/tilt';

/**
 * EPH-TILT (tools/eph/tilt.ts, tools/eph/analyze.ts): the prone body's tilt after each Triangle act, per side, from the
 * sampled root quaternion (PCSX2: *(actor+0x2e8)+0x20) and the page's `Walker.rootTilt` (viewer ephFrame.ts). A
 * measurement instrument, product track (OT.R53): it measures, it changes nothing in the game.
 *
 * The fixtures are fixed series built here as CSV text and read back through parseCsv, as a run's pcsx2.csv and page.csv
 * are: a body standing level until a full Triangle at 500 ms, then laid on a 20 degree slope by FUN_00548090's settled
 * prone step (D:L413265-413274: a lerp of 0.2 a call from the last up toward the floor normal in the body's frame, then
 * the shortest arc from (0, 1, 0)), one call a 1/60 s frame; and a page side that stops at 20% of it (the 'world-up'
 * basis of PRONE-TILT's PRONE_TILT_EASE_BASIS_READING: a fixed lerp of 0.2 from (0, 1, 0)).
 */

const SLOPE = (20 * Math.PI) / 180;
/** The floor normal, world axes: the ground rises toward +z, the body faces +z (yaw 180), head uphill. */
const N_WORLD: Vec3 = [0, Math.cos(SLOPE), -Math.sin(SLOPE)];
const YAW = 180;
/** Yaw 180 as the actor's quaternion: a half turn about y. */
const ACTOR_Q = [0, 1, 0, 0];
const UP: Vec3 = [0, 1, 0];
const ACT_MS = 500;
const FRAMES = 90;
const SCRIPT = parseScript('500 triangle 1\n700 triangle 0\n');

/** FUN_00306d40's general branch (the fixture's own copy): the arc from unit `u` toward `t`, by the half vector. */
function arc(u: Vec3, t: Vec3): [number, number, number, number] {
  const h = [u[0] + t[0], u[1] + t[1], u[2] + t[2]];
  const l = Math.hypot(h[0]!, h[1]!, h[2]!);
  const n = [h[0]! / l, h[1]! / l, h[2]! / l];
  return [u[1] * n[2]! - u[2] * n[1]!, u[2] * n[0]! - u[0] * n[2]!, u[0] * n[1]! - u[1] * n[0]!, u[0] * n[0]! + u[1] * n[1]! + u[2] * n[2]!];
}
const lerp = (k: number, a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The root's quaternion and up per frame: level before the act, then `basis` 'root-up' (eases to the slope) or 'world-up'. */
function tiltSeries(basis: 'root-up' | 'world-up', hz: 30 | 60 = 60): { q: number[]; up: Vec3; basisUp: Vec3 }[] {
  const nBody = worldToBody(YAW, N_WORLD);
  const out: { q: number[]; up: Vec3; basisUp: Vec3 }[] = [];
  let up: Vec3 = UP;
  for (let k = 0; k <= FRAMES; k++) {
    const t = (k * 1000) / 60;
    if (t <= ACT_MS) { out.push({ q: [0, 0, 0, 1], up: UP, basisUp: UP }); continue; }
    if (hz === 30 && k % 2 === 1) { const l = out[out.length - 1]!; out.push({ ...l }); continue; }   // the frame's second read
    const from = basis === 'root-up' ? up : UP;
    const q = arc(UP, lerp(0.2, from, nBody));
    const prev = up;
    up = rotateByQuat(q, UP);
    out.push({ q, up, basisUp: prev });
  }
  return out;
}

function pcsx2Csv(basis: 'root-up' | 'world-up', withTilt = true): string {
  // The PS2 steps once a 30 Hz game frame (FINDINGS 2026-10-31 Q2): two sampler reads share each guest clock value.
  const rows = tiltSeries(basis, 30).map((s, k) => {
    const prone = ((k >> 1) * 1000) / 30 > ACT_MS;   // by the guest frame the read belongs to
    const base: Record<string, unknown> = { clockBits: (k >> 1) + 1, t: 10 + (k >> 1) / 30, x: 900, y: -140, z: 850, rootY: prone ? 2 : 11.484, moveScale: 1, stanceRequest: 0, wallMs: k };
    if (!withTilt) return base;
    return {
      ...base, rootQx: s.q[0], rootQy: s.q[1], rootQz: s.q[2], rootQw: s.q[3],
      floorNx: N_WORLD[0], floorNy: N_WORLD[1], floorNz: N_WORLD[2], savedNx: N_WORLD[0], savedNy: N_WORLD[1], savedNz: N_WORLD[2],
      easeX: s.basisUp[0], easeY: s.basisUp[1], easeZ: s.basisUp[2],
      actorQx: ACTOR_Q[0], actorQy: ACTOR_Q[1], actorQz: ACTOR_Q[2], actorQw: ACTOR_Q[3],
      posture: prone ? 2 : 0, actionId: null, airborne: 0, playPhase: 0.5, playClip: 0x01c40000, playWindowA: 0, playWindowB: 0,
    };
  });
  return seriesCsv(rows);
}

function pageCsv(basis: 'root-up' | 'world-up', withTilt = true, hz: 30 | 60 = 60): string {
  const rows = tiltSeries(basis, hz).map((s, k) => {
    const prone = (k * 1000) / 60 > ACT_MS;
    const base: Record<string, unknown> = { tick: 1000 + k, stance: prone ? 'prone' : 'stand', posture: prone ? 'prone' : 'stand', walking: true, action: null, x: 900.2, y: -140, z: 850.1, yaw: YAW };
    if (!withTilt) return base;
    return {
      ...base, rootQx: s.q[0], rootQy: s.q[1], rootQz: s.q[2], rootQw: s.q[3], rootUpX: s.up[0], rootUpY: s.up[1], rootUpZ: s.up[2],
      tiltNx: N_WORLD[0], tiltNy: N_WORLD[1], tiltNz: N_WORLD[2], topClip: prone ? 'seal_prone' : 'seal_stand', topPhase: 0.5,
    };
  });
  return seriesCsv(rows);
}

function run(ps2: 'root-up' | 'world-up', page: 'root-up' | 'world-up', withTilt = true, pageHz: 30 | 60 = 60): AnalysisRow[] {
  const endMs = (FRAMES * 1000) / 60;
  return analyzeRun({
    caseName: 'incline-prone', run: 'fx', events: SCRIPT, endMs,
    pcsx2: pcsx2Series(parseCsv(pcsx2Csv(ps2, withTilt)), 10000),
    page: pageSeries(parseCsv(pageCsv(page, withTilt, pageHz)), 1000),
  }).rows;
}
const metric = (rows: AnalysisRow[], m: string): AnalysisRow => rows.find((r) => r.segment === 'act1' && r.metric === m)!;

describe('the tilt geometry', () => {
  it('the tilt is the angle from world up; pitch and roll split it in the body frame (x right, y up, z behind)', () => {
    const forward: Vec3 = [0, Math.cos(SLOPE), -Math.sin(SLOPE)];
    expect(tiltDeg(forward)).toBeCloseTo(20, 6);
    expect(pitchDeg(forward)).toBeCloseTo(20, 6);    // up leaning toward the facing (-z): positive
    expect(rollDeg(forward)).toBeCloseTo(0, 6);
    const right: Vec3 = [Math.sin(SLOPE / 2), Math.cos(SLOPE / 2), 0];
    expect(rollDeg(right)).toBeCloseTo(10, 6);       // up leaning to the body's right (+x): positive
    expect(pitchDeg(right)).toBeCloseTo(0, 6);
    expect(angleDeg(forward, right)).toBeGreaterThan(0);
    expect(SETTLE_DEG).toBe(1);
  });

  it('turns a world vector into the body frame by the yaw (PRONE-TILT worldToBody): yaw 180 flips x and z', () => {
    expect(worldToBody(180, [1, 2, 3]).map((v) => Number(v.toFixed(9)))).toEqual([-1, 2, -3]);
    expect(rotateByQuat([0, 0, 0, 1], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('the tilt after a prone press, per side (FUN_00548090 eased at 0.2 a frame)', () => {
  const rows = run('root-up', 'world-up');

  it('lists its measures in a fixed order', () => {
    expect(TILT_METRICS).toEqual([
      'tiltBeforeDeg', 'tiltFinalDeg', 'tiltPitchDeg', 'tiltRollDeg', 'tiltUpNormalDeg', 'tiltSlopeDeg', 'tiltOverSlope',
      'tiltSettleMs', 'tiltEasePerStep', 'tiltEasePerSecond', 'tiltBasisDeg',
    ]);
  });

  it('PS2 settles to the full 20 degree slope; the world-up page stops at about 20% of it; the difference is PS2 - page', () => {
    const fin = metric(rows, 'tiltFinalDeg');
    expect(fin.ps2 as number).toBeCloseTo(20, 1);
    expect(fin.page as number).toBeCloseTo(3.94, 1);
    expect(fin.diff!).toBeCloseTo(16.06, 1);
    expect(metric(rows, 'tiltOverSlope').ps2 as number).toBeCloseTo(1, 2);
    expect(metric(rows, 'tiltOverSlope').page as number).toBeCloseTo(0.2, 2);
    expect(metric(rows, 'tiltSlopeDeg').ps2 as number).toBeCloseTo(20, 4);
    expect(metric(rows, 'tiltBeforeDeg').ps2).toBe(0);
    expect(metric(rows, 'tiltBeforeDeg').page).toBe(0);
  });

  it('splits it into pitch and roll: head uphill, the up leans back (pitch -20), no roll', () => {
    expect(metric(rows, 'tiltPitchDeg').ps2 as number).toBeCloseTo(-20, 1);
    expect(Math.abs(metric(rows, 'tiltRollDeg').ps2 as number)).toBeLessThan(1e-6);
  });

  it('measures the root up against the floor normal: PS2 on it, the page 16 degrees off', () => {
    expect(metric(rows, 'tiltUpNormalDeg').ps2 as number).toBeCloseTo(0, 1);
    expect(metric(rows, 'tiltUpNormalDeg').page as number).toBeCloseTo(16.06, 1);
  });

  it('times the settle (within 1 degree of the final): about 14 game frames at 0.2 a frame on PS2, the first tick on the page', () => {
    const s = metric(rows, 'tiltSettleMs');
    expect(s.ps2 as number).toBeGreaterThan(12 * (1000 / 30));
    expect(s.ps2 as number).toBeLessThan(16 * (1000 / 30));
    expect(s.page as number).toBeLessThanOrEqual(1000 / 60 + 1e-6);
  });

  it("reads the build-up rate per the side's own step (PS2 1/30 s) and per second", () => {
    expect(metric(rows, 'tiltEasePerStep').ps2 as number).toBeCloseTo(0.2, 1);
    expect(metric(rows, 'tiltEasePerSecond').ps2 as number).toBeCloseTo(1 - 0.8 ** 30, 2);
  });

  it("reads PS2's ease basis DAT_0066acd0 (the page has none): the root's last up, on the slope", () => {
    const b = metric(rows, 'tiltBasisDeg');
    expect(b.ps2 as number).toBeCloseTo(20, 0);
    expect(b.page).toBeNull();
  });

  it('a page side stepping at the PS2 game frame measures the same: the difference about zero', () => {
    const same = run('root-up', 'root-up', true, 30);
    expect(Math.abs(metric(same, 'tiltFinalDeg').diff!)).toBeLessThan(0.05);
    expect(Math.abs(metric(same, 'tiltSettleMs').diff!)).toBeLessThan(1000 / 30 + 1e-6);
  });

  it('a page stepping each 60 Hz tick (the port bug of FINDINGS Q2): 0.2 a step either side, twice as fast per second', () => {
    const r = run('root-up', 'root-up', true, 60);
    expect(metric(r, 'tiltEasePerStep').ps2 as number).toBeCloseTo(0.2, 1);
    expect(metric(r, 'tiltEasePerStep').page as number).toBeCloseTo(0.2, 1);
    expect(metric(r, 'tiltSettleMs').ps2 as number).toBeGreaterThan(1.6 * (metric(r, 'tiltSettleMs').page as number));
  });

  it('writes the tilt rows in analysis.csv and prints them as a table', () => {
    const csv = analysisCsv(rows);
    expect(csv).toMatch(/\nincline-prone,fx,act1,500,[\d.]+,full from stand,tiltFinalDeg,(19\.9\d*|20(\.\d+)?),3\.9\d*,/);
    const table = tiltTable(rows);
    expect(table.split('\n')[0]).toMatch(/^segment\s+label\s+metric\s+ps2\s+page\s+diff/);
    expect(table).toMatch(/act1\s+full from stand\s+tiltFinalDeg\s+(19\.9\d|20\.0\d)\s+3\.9\d\s+16\.\d\d/);
  });
});

describe('an old run without the tilt columns', () => {
  it('still analyzes: no tilt on the samples, no tilt rows, the other measures as before', () => {
    const ps2 = pcsx2Series(parseCsv(pcsx2Csv('root-up', false)), 10000);
    expect('tilt' in ps2[0]!).toBe(false);
    const rows = run('root-up', 'root-up', false);
    expect(rows.some((r) => r.metric.startsWith('tilt'))).toBe(false);
    expect(rows.some((r) => r.metric === 'transitionMs')).toBe(true);
    expect(tiltTable(rows)).toBe('');
  });

  it('measureTilt over samples with empty tilt cells gives nulls, never a number', () => {
    const m = measureTilt([{ t: 0, tilt: null }, { t: 100, tilt: { up: null, normal: null, normalBody: null, basis: null } }], 0, 100);
    for (const k of TILT_METRICS) expect(m[k], k).toBeNull();
  });
});

describe('the clean-route tilt script (tools/eph/scripts/tilt-bank.txt), dry: parsed and planned, nothing run', () => {
  const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts/tilt-bank.txt'), 'utf8');
  const ev = parseScript(text);

  it('parses, and plans on both sides: PCSX2 keys and page events for every line, one full Triangle act', () => {
    expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual([[500, 'lright', 1], [1100, 'lright', 0], [2100, 'triangle', 1], [2250, 'triangle', 0]]);
    expect(keyActions(ev).length).toBeGreaterThanOrEqual(4);
    expect(new Set(pageEvents(ev).map((e) => e.line))).toEqual(new Set(ev.map((e) => e.line)));
    expect(actMoments(ev).map((a) => [a.kind, a.t])).toEqual([['full', 2100]]);
  });

  it('avoids the three places the paths part: no light Triangle, no prone pop, one stick half at a time', () => {
    expect(ev.some((e) => e.input === 'triangle' && e.pressure > 0 && e.pressure < 0.3)).toBe(false);
    expect(actMoments(ev).length).toBe(1);
    const held = new Set<string>();
    for (const e of ev) {
      if (!isStickHalf(e.input)) continue;
      if (e.pressure > 0) held.add(e.input); else held.delete(e.input);
      expect(held.size).toBeLessThanOrEqual(1);
    }
    expect(ev.some((e) => ['square', 'cross', 'circle', 'lup', 'lleft', 'ldown'].includes(e.input))).toBe(false);
  });

  it('releases the stick a second before the prone press and releases everything by its end', () => {
    const lastStick = Math.max(...ev.filter((e) => isStickHalf(e.input)).map((e) => e.t));
    expect(actMoments(ev)[0]!.t - lastStick).toBeGreaterThanOrEqual(1000);
    const last = new Map<string, number>();
    for (const e of ev) last.set(e.input, e.pressure);
    for (const [k, v] of last) expect(v, k).toBe(0);
  });

  it('says why it goes lright, not lup, and where it came from', () => {
    expect(text).toMatch(/Not lup: at yaw 180 lup runs \+z, where no replay sampled the ground/);
    expect(text).toContain('20261031T154148Z and 154254Z');
  });
});

describe('the stick axes while two halves are held (fwd-then-strafe, strafe-then-fwd)', () => {
  const ev = parseScript('500 lup 1\n1500 lleft 1\n2500 lup 0\n2500 lleft 0\n');
  /** A side walking +z then +z+x, its axes as given; `lat` the lateral axis it reads while both are held. */
  function side(kind: 'ps2' | 'page', lat: number): string {
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k <= 200; k++) {
      const t = (k * 1000) / 60;
      const fwd = t >= 500 && t < 2500 ? 1 : 0, l = t >= 1500 && t < 2500 ? lat : 0;
      const z = 857 + Math.max(0, Math.min(t, 2500) - 500) / 1000 * 60;
      const x = 937 + Math.max(0, Math.min(t, 2500) - 1500) / 1000 * 40 * Math.abs(l);
      if (kind === 'ps2') rows.push({ clockBits: k + 1, t: 10 + k / 60, x, y: -146, z, rootY: 11.484, moveScale: 1, stanceRequest: 0, stickTurn: 0, stickForward: fwd, stickLateral: l });
      else rows.push({ tick: 100 + k, stance: 'stand', posture: 'stand', walking: true, action: null, x, y: -146, z, yaw: 180, stickForward: fwd, stickLateral: l });
    }
    return seriesCsv(rows);
  }
  const analyse = (ps2Lat: number, pageLat: number) => analyzeRun({
    caseName: 'fwd-then-strafe', run: 'fx', events: ev, endMs: 3000,
    pcsx2: pcsx2Series(parseCsv(side('ps2', ps2Lat)), 10000), page: pageSeries(parseCsv(side('page', pageLat)), 100),
  });
  const seg = (rows: AnalysisRow[], m: string) => rows.find((r) => r.label === 'lup=1+lleft=1' && r.metric === m)!;

  it('reports per side the heading and both axes over the segment both are held', () => {
    const { rows, checks } = analyse(-1, -1);
    expect(seg(rows, 'stickLateral').ps2).toBe(-1);
    expect(seg(rows, 'stickLateral').page).toBe(-1);
    expect(seg(rows, 'stickForward').ps2).toBe(1);
    expect(typeof seg(rows, 'headingDeg').ps2).toBe('number');
    expect(checks.notes.some((n) => n.includes('+0x244'))).toBe(false);
  });

  it("flags PCSX2's lateral axis at 0 while the page reads the push: the injector or the key combination, not parity", () => {
    const { rows, checks } = analyse(0, -1);
    expect(seg(rows, 'stickLateral').ps2).toBe(0);
    expect(checks.notes.find((n) => n.includes('+0x244'))).toMatch(/lup=1\+lleft=1.*a harness issue, not parity/);
  });

  it('an old run without the axis columns gives no stick rows', () => {
    const rows = run('root-up', 'root-up', false);
    expect(rows.some((r) => r.metric.startsWith('stick'))).toBe(false);
  });
});

describe('the two-axis case scripts, dry: parsed and planned', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts');
  const cases: [string, [number, string, number][]][] = [
    ['fwd-then-strafe', [[500, 'lup', 1], [1500, 'lleft', 1], [2500, 'lup', 0], [2500, 'lleft', 0]]],
    ['strafe-then-fwd', [[500, 'lleft', 1], [1500, 'lup', 1], [2500, 'lleft', 0], [2500, 'lup', 0]]],
    ['back-then-strafe', [[500, 'ldown', 1], [1000, 'lright', 1], [1500, 'ldown', 0], [1500, 'lright', 0]]],
    ['strafe-then-back', [[500, 'lright', 1], [800, 'ldown', 1], [1300, 'lright', 0], [1300, 'ldown', 0]]],
  ];
  for (const [name, want] of cases) {
    it(`${name}: parses, plans on both sides, holds two halves of different axes together, releases all`, () => {
      const text = readFileSync(`${dir}/${name}.txt`, 'utf8');
      const ev = parseScript(text);
      expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual(want);
      expect(keyActions(ev).length).toBe(4);
      expect(pageEvents(ev).length).toBeGreaterThanOrEqual(4);
      expect(actMoments(ev)).toEqual([]);
      expect(text).toContain(`case ${name}`);
    });
  }
});

describe('the prone-pop slide (MV-PARITY a): speed and top action over the 0.6 s after the light Triangle release', () => {
  const ev = parseScript('500 triangle 1\n650 triangle 0\n3062 lright 1\n3198 triangle 0.2\n3385 triangle 0\n4000 lright 0\n');
  function ps2(slide: number): string {
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k <= 300; k++) {
      const t = (k * 1000) / 60;
      const inPop = t >= 3385 && t < 3985;
      const x = 937 - Math.max(0, Math.min(t, 3985) - 3385) / 1000 * slide;
      rows.push({ clockBits: k + 1, t: 10 + k / 60, x, y: -146, z: 858, rootY: inPop ? 6 : 2, moveScale: 1, stanceRequest: 0, flags105e: inPop ? 0x04 : 0, topActionId: inPop ? 0x1a : 0x12 });
    }
    return seriesCsv(rows);
  }
  function page(): string {
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k <= 300; k++) {
      const t = (k * 1000) / 60;
      const inPop = t >= 3385 && t < 3985;
      rows.push({ tick: 100 + k, stance: inPop ? 'crouch' : 'prone', posture: 'prone', walking: true, action: inPop ? { name: 'proneToCrouch', t: 0.1, reversed: false } : null, x: 939, y: -146, z: 858, yaw: 180, stickForward: 0, stickLateral: t >= 3062 && t < 4000 ? 1 : 0 });
    }
    return seriesCsv(rows);
  }
  const rows = analyzeRun({
    caseName: 'pop-stick', run: 'fx', events: ev, endMs: 5000,
    pcsx2: pcsx2Series(parseCsv(ps2(65)), 10000), page: pageSeries(parseCsv(page()), 100),
  }).rows;
  const get = (m: string) => rows.find((r) => r.segment === 'pop1' && r.metric === m)!;

  it('reports the speed across the ground per side (PS2 65 u/s, the page still)', () => {
    expect(get('popSpeed').ps2 as number).toBeCloseTo(65, 0);
    expect(get('popSpeed').page as number).toBeCloseTo(0, 3);
    expect(get('popSpeed').label).toBe('light from prone');
  });

  it("reports the top action: PS2's id (most frequent), the page's action name; and PS2's jump bit 2", () => {
    expect(get('popTopAction').ps2).toBe('0x1a');
    expect(get('popTopAction').page).toBe('proneToCrouch');
    expect(get('popJumpBit').ps2).toBe(1);
  });
});

describe('the prone-pop case scripts, dry: parsed and planned (incline-prone 16062-16661 as the model)', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts');
  const base: [number, string, number][] = [[500, 'triangle', 1], [650, 'triangle', 0], [3062, 'lright', 1], [3198, 'triangle', 0.2], [3385, 'triangle', 0]];
  const cases: [string, [number, string, number][]][] = [
    ['pop-stick', [...base, [4000, 'lright', 0]]],
    ['pop-stick-square', [...base.slice(0, 4), [3328, 'square', 1], [3385, 'triangle', 0], [3661, 'square', 0], [4000, 'lright', 0]]],
    ['pop-stick-cross', [...base, [3467, 'cross', 1], [3592, 'cross', 0], [4000, 'lright', 0]]],
  ];
  for (const [name, want] of cases) {
    it(`${name}: parses, plans on both sides, a full prone then one light Triangle (press 187 ms) with the stick held`, () => {
      const text = readFileSync(`${dir}/${name}.txt`, 'utf8');
      const ev = parseScript(text);
      expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual(want);
      expect(keyActions(ev).length).toBeGreaterThanOrEqual(want.length);
      expect(pageEvents(ev).length).toBeGreaterThan(0);
      expect(actMoments(ev).map((a) => [a.kind, a.pressT])).toEqual([['full', 500], ['light', 3198]]);
      const last = new Map<string, number>();
      for (const e of ev) last.set(e.input, e.pressure);
      for (const [k, v] of last) expect(v, k).toBe(0);
      expect(text).toContain(`case ${name}`);
    });
  }
});

describe('the PCSX2 series keeps the LAST read of each guest frame (FINDINGS 2026-10-31 Q2: the bogus 5 s settle)', () => {
  /** Each 30 Hz guest frame read twice: first before FUN_00548090 writes the root (identity), then after (written). */
  function earlyLate(): string {
    const nBody = worldToBody(YAW, N_WORLD);
    const rows: Record<string, unknown>[] = [];
    let up: Vec3 = UP;
    const TRANS = 10;   // game frames of Stand -> Prone (0x19) after the act
    for (let f = 0; f <= 60; f++) {
      const t = (f * 1000) / 30;
      const after = t > ACT_MS;
      const fa = after ? Math.round((t - ACT_MS) / (1000 / 30)) : -1;
      const inTrans = after && fa <= TRANS;
      let q = [0, 0, 0, 1];
      if (after && !inTrans) { q = arc(UP, lerp(0.2, up, nBody)); up = rotateByQuat(q, UP); }
      for (const read of ['early', 'late']) {
        const qq = read === 'early' ? [0, 0, 0, 1] : q;
        rows.push({ clockBits: f + 1, t: 10 + f / 30, x: 900, y: -140, z: 850, rootY: after ? 2 : 11.484, moveScale: 1, stanceRequest: 0,
          rootQx: qq[0], rootQy: qq[1], rootQz: qq[2], rootQw: qq[3], floorNx: N_WORLD[0], floorNy: N_WORLD[1], floorNz: N_WORLD[2],
          actorQx: 0, actorQy: 1, actorQz: 0, actorQw: 0, actionId: inTrans ? 0x19 : 0x12 });
      }
    }
    return seriesCsv(rows);
  }
  const ps2 = pcsx2Series(parseCsv(earlyLate()), 10000);

  it('one sample per guest clock value, carrying the late (written) read', () => {
    expect(new Set(ps2.map((x) => x.t)).size).toBe(ps2.length);
    expect(tiltDeg(ps2[ps2.length - 1]!.tilt!.up!)).toBeCloseTo(20, 0);
  });

  it('measures the ease only after the transition (actionId leaves 0x19), 0.2 a game frame', () => {
    const m = measureTilt(ps2, ACT_MS, 2000, 1000 / 30);
    expect(m.tiltEasePerStep as number).toBeCloseTo(0.2, 2);
    expect(m.tiltEasePerSecond as number).toBeCloseTo(1 - 0.8 ** 30, 3);
    expect(m.tiltFinalDeg as number).toBeCloseTo(20, 0);
  });
});

describe('the round-4 case scripts, dry: parsed and planned', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts');
  const cases: [string, [number, string, number][], number][] = [
    ['yaw90-tilt', [[500, 'lright', 1], [950, 'lright', 0], [1950, 'rright', 1], [2650, 'rright', 0], [3650, 'triangle', 1], [3800, 'triangle', 0]], 1],
    ['fwd-then-right', [[500, 'lup', 1], [1000, 'lright', 1], [1500, 'lup', 0], [1500, 'lright', 0]], 0],
    ['right-then-fwd', [[500, 'lright', 1], [1000, 'lup', 1], [1500, 'lright', 0], [1500, 'lup', 0]], 0],
    ['back-then-left', [[500, 'ldown', 1], [1000, 'lleft', 1], [1500, 'ldown', 0], [1500, 'lleft', 0]], 0],
    ['left-then-back', [[500, 'lleft', 1], [1000, 'ldown', 1], [1500, 'lleft', 0], [1500, 'ldown', 0]], 0],
    ['pop-stick-half', [[500, 'triangle', 1], [650, 'triangle', 0], [3062, 'lright', 0.5], [3198, 'triangle', 0.2], [3385, 'triangle', 0], [4000, 'lright', 0]], 2],
    ['pop-nostick', [[500, 'triangle', 1], [650, 'triangle', 0], [3198, 'triangle', 0.2], [3385, 'triangle', 0]], 2],
  ];
  for (const [name, want, acts] of cases) {
    it(`${name}: parses, plans on both sides (the half push a prepared macro), releases all`, () => {
      const text = readFileSync(`${dir}/${name}.txt`, 'utf8');
      const ev = parseScript(text);
      expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual(want);
      expect(keyActions(ev).length).toBeGreaterThanOrEqual(want.length);
      expect(pageEvents(ev).length).toBeGreaterThan(0);
      expect(actMoments(ev).length).toBe(acts);
      const last = new Map<string, number>();
      for (const e of ev) last.set(e.input, e.pressure);
      for (const [k, v] of last) expect(v, k).toBe(0);
      expect(text).toContain(`case ${name}`);
    });
  }
});

describe('where the second axis is lost (MV-PARITY c): the pad bytes, the controller object, or after the copy', () => {
  const ev = parseScript('500 lup 1\n1500 lleft 1\n2500 lup 0\n2500 lleft 0\n');
  /** PCSX2 under W then A: the pad's two move floats, the controller's lateral and the SEAL's lateral as given. */
  function ps2(o: { padA: number; ctlLat: number; lat: number }): string {
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k <= 180; k++) {
      const t = (k * 1000) / 60;
      const both = t >= 1500 && t < 2500, fwd = t >= 500 && t < 2500 ? 1 : 0;
      rows.push({ clockBits: k + 1, t: 10 + k / 60, x: 937, y: -146, z: 855 + Math.max(0, Math.min(t, 2500) - 500) / 1000 * 60, rootY: 11.484, moveScale: 1, stanceRequest: 0,
        stickTurn: 0, stickForward: fwd, stickLateral: both ? o.lat : 0, padMoveA: both ? o.padA : 0, padMoveB: fwd, padFlag0: 1,
        ctlForward: fwd, ctlLateral: both ? o.ctlLat : 0, ctlTurn: 0 });
    }
    return seriesCsv(rows);
  }
  function page(): string {
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k <= 180; k++) {
      const t = (k * 1000) / 60;
      const both = t >= 1500 && t < 2500, fwd = t >= 500 && t < 2500 ? 1 : 0;
      rows.push({ tick: 100 + k, stance: 'stand', posture: 'stand', walking: true, action: null, x: 939, y: -146, z: 857 + Math.max(0, Math.min(t, 2500) - 500) / 1000 * 60, yaw: 180, stickForward: fwd, stickLateral: both ? -1 : 0 });
    }
    return seriesCsv(rows);
  }
  const notes = (o: { padA: number; ctlLat: number; lat: number }) => analyzeRun({
    caseName: 'fwd-then-strafe', run: 'fx', events: ev, endMs: 3000,
    pcsx2: pcsx2Series(parseCsv(ps2(o)), 10000), page: pageSeries(parseCsv(page()), 100),
  });

  it('the pad bytes: one of the pad move floats at rest', () => {
    expect(notes({ padA: 0, ctlLat: 0, lat: 0 }).checks.notes.join(' ')).toMatch(/\+0x244.*lost in the pad bytes/);
  });

  it('the controller object: the pad has both, the controller lateral at rest', () => {
    expect(notes({ padA: -1, ctlLat: 0, lat: 0 }).checks.notes.join(' ')).toMatch(/\+0x244.*lost between the pad and the controller object/);
  });

  it('after the copy: the controller carries it, the SEAL lateral at rest', () => {
    expect(notes({ padA: -1, ctlLat: -1, lat: 0 }).checks.notes.join(' ')).toMatch(/\+0x244.*lost after the copy/);
  });

  it('reports the controller axes and the pad flag per segment on the PS2 side', () => {
    const r = notes({ padA: -1, ctlLat: -1, lat: -1 });
    const seg = (m: string) => r.rows.find((x) => x.label === 'lup=1+lleft=1' && x.metric === m)!;
    expect(seg('ctlLateral').ps2).toBe(-1);
    expect(seg('ctlForward').ps2).toBe(1);
    expect(seg('padFlag0').ps2).toBe(1);
    expect(r.checks.notes.some((n) => n.includes('+0x244'))).toBe(false);
  });
});

describe('the MV-PARITY (c) gap scripts, dry: parsed and planned', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts');
  const cases: [string, [number, string, number][]][] = [
    ['fwd-left-same', [[500, 'lup', 1], [500, 'lleft', 1], [1500, 'lup', 0], [1500, 'lleft', 0]]],
    ['fwd-then-left-half', [[500, 'lup', 1], [1000, 'lleft', 1], [2000, 'lup', 0], [2000, 'lleft', 0]]],
    ['turn-fwd-then-left', [[500, 'rleft', 1], [1380, 'rleft', 0], [2380, 'lup', 1], [3380, 'lleft', 1], [4380, 'lup', 0], [4380, 'lleft', 0]]],
    ['turn-fwd-then-right', [[500, 'rleft', 1], [1380, 'rleft', 0], [2380, 'lup', 1], [3380, 'lright', 1], [4380, 'lup', 0], [4380, 'lright', 0]]],
  ];
  for (const [name, want] of cases) {
    it(`${name}: parses, plans on both sides, releases all`, () => {
      const text = readFileSync(`${dir}/${name}.txt`, 'utf8');
      const ev = parseScript(text);
      expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual(want);
      expect(keyActions(ev).length).toBe(want.length);
      expect(pageEvents(ev).length).toBeGreaterThan(0);
      expect(actMoments(ev)).toEqual([]);
      const last = new Map<string, number>();
      for (const e of ev) last.set(e.input, e.pressure);
      for (const [k, v] of last) expect(v, k).toBe(0);
      expect(text).toContain(`case ${name}`);
    });
  }

  it('strafe-then-fwd is case (a): A held 1.0 s, then W added for 1.0 s', () => {
    const ev = parseScript(readFileSync(`${dir}/strafe-then-fwd.txt`, 'utf8'));
    expect(ev.map((e) => [e.t, e.input, e.pressure])).toEqual([[500, 'lleft', 1], [1500, 'lup', 1], [2500, 'lleft', 0], [2500, 'lup', 0]]);
  });
});
