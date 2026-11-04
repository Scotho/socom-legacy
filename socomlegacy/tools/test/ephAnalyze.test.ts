import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  START_TOLERANCE, analysisCsv, analyzeRun, analyzeRunDir, caseNameOf, csvCell, headingOf, matrixRows, matrixCsv, pageSeries, parseCsv, pcsx2Series,
  segmentsOf, type AnalysisRow, type Sample,
} from '../eph/analyze';
import { parseScript } from '../eph/script';

/**
 * The EPH parity matrix analyzer (tools/eph/analyze.ts): both sides' series on the script clock, cut at the script's
 * events, measured per segment, and the trials summarised. A validation instrument (product track, OT.R53).
 */

/** A straight line at `speed` u/s along `dir` (unit x, z) from `t0` to `t1`, still before and after; `dt` ms apart. */
function line(o: { from: [number, number, number]; dir: [number, number]; speed: number; t0: number; t1: number; end: number; dt: number; stance?: string }): Sample[] {
  const out: Sample[] = [];
  for (let t = 0; t <= o.end; t += o.dt) {
    const run = Math.max(0, Math.min(t, o.t1) - o.t0) / 1000;
    out.push({ t, x: o.from[0] + o.dir[0] * o.speed * run, y: o.from[1], z: o.from[2] + o.dir[1] * o.speed * run, rootY: null, yaw: null, stance: o.stance ?? 'stand', busy: false });
  }
  return out;
}

const SCRIPT = parseScript('500 lup 1\n2500 lup 0\n');

describe('the series', () => {
  it('puts PCSX2 on the script clock from guest0, one row per guest clock value, the stance from the root height', () => {
    const rows = parseCsv('clockBits,t,x,y,z,rootY,moveScale,stanceRequest,wallMs\n1,10.0,1,2,3,11.484375,1,0,0\n1,10.0,1,2,3,11.484375,1,0,1\n2,10.0333,1.5,2,3,5.5,1,0,2\n');
    expect(pcsx2Series(rows, 10000)).toEqual([
      { t: 0, x: 1, y: 2, z: 3, rootY: 11.484375, yaw: null, stance: 'stand', busy: false },
      { t: expect.closeTo(33.3, 6), x: 1.5, y: 2, z: 3, rootY: 5.5, yaw: null, stance: 'crouch', busy: false },
    ]);
  });

  it('puts the page on the script clock from tick0 at 1000/60 ms a tick, one row per tick, skipping rows without feet', () => {
    const rows = parseCsv('tick,stance,posture,walking,action_name,action_t,action_reversed,x,y,z,yaw\n'
      + '100,stand,stand,true,,,,1,2,3,180\n100,stand,stand,true,,,,1,2,3,180\n106,crouch,crouch,true,standToCrouch,0.1,false,1,2,4,180\n107,stand,stand,false,,,,,,,\n');
    expect(pageSeries(rows, 100)).toEqual([
      { t: 0, x: 1, y: 2, z: 3, rootY: null, yaw: 180, stance: 'stand', busy: false },
      { t: 100, x: 1, y: 2, z: 4, rootY: null, yaw: 180, stance: 'crouch', busy: true },
    ]);
  });
});

/**
 * The movement hunt's I1 (agent-mail/evidence/eph-hunt-2026-11-01 REPORT): the page was busy only while action_name was
 * set, but seal_dive2prone and the run-crouch carry none, so a dive's transitionMs read 50-67 ms against the PS2's
 * 1201-1234. Where page.csv carries topClip (the walker's top play), the page is busy while that clip is not the
 * ground play of its posture (seal_stand, seal_crouch, seal_prone); a run without it keeps the action_name rule.
 */
describe('the page busy by topClip (hunt I1)', () => {
  const head = 'tick,stance,posture,walking,action_name,action_t,action_reversed,x,y,z,yaw,topClip,topPhase,stickForward,stickLateral\n';
  it('a dive with no action is busy through seal_dive2prone, settled on seal_prone', () => {
    const rows = parseCsv(head
      + '100,stand,stand,true,,,,0,0,0,180,seal_stand,0,1,0\n'
      + '101,prone,prone,true,,,,0,0,1,180,seal_dive2prone,0.1,1,0\n'
      + '102,prone,prone,true,,,,0,0,2,180,seal_prone,0,0,0\n');
    expect(pageSeries(rows, 100).map((x) => x.busy)).toEqual([false, true, false]);
  });

  it('a stance clip on top is busy whatever action_name says; an action over the ground play is not', () => {
    const rows = parseCsv(head
      + '100,crouch,crouch,true,,,,0,0,0,180,seal_stand2crouch,0.5,0,0\n'
      + '101,crouch,crouch,true,reload,0.1,false,0,0,0,180,seal_crouch,0,0,0\n');
    expect(pageSeries(rows, 100).map((x) => x.busy)).toEqual([true, false]);
  });

  it('review: a stance-transition clip in animClip (seal_<a>2<b>) is busy too, whatever topClip says', () => {
    const h2 = 'tick,stance,posture,walking,action_name,action_t,action_reversed,x,y,z,yaw,topClip,topPhase,stickForward,stickLateral,animPlay,animClip,animPhase,rootHeight' + String.fromCharCode(10);
    const rows = parseCsv(h2
      + '100,crouch,crouch,true,,,,0,0,0,180,seal_crouch,0,0,0,crouch,seal_stand2crouch,0.4,8' + String.fromCharCode(10)
      + '101,crouch,crouch,true,,,,0,0,0,180,seal_crouch,0,0,0,loco:crouch:0,seal_crouchwalk,0.1,5.5' + String.fromCharCode(10));
    expect(pageSeries(rows, 100).map((x) => x.busy)).toEqual([true, false]);
  });

  it('a row with topClip empty falls back on action_name', () => {
    const rows = parseCsv(head + '100,crouch,crouch,true,standToCrouch,0.1,false,0,0,0,180,,,0,0\n');
    expect(pageSeries(rows, 100)[0]!.busy).toBe(true);
  });
});

describe('the segments', () => {
  it('cut the run at each distinct event time and name what is held', () => {
    const s = segmentsOf(parseScript('500 lup 1\n500 lleft 0.5\n1500 lleft 0\n2500 lup 0\n'), 4000);
    expect(s.map((x) => [x.t0, x.t1, x.label])).toEqual([
      [0, 500, 'rest'], [500, 1500, 'lup=1+lleft=0.5'], [1500, 2500, 'lup=1'], [2500, 4000, 'rest'],
    ]);
  });
});

describe('a run', () => {
  const ps2 = line({ from: [939, -145, 857], dir: [0, 1], speed: 65, t0: 500, t1: 2500, end: 5000, dt: 1000 / 30 });
  const page = line({ from: [939.4, -145, 857.1], dir: [0, 1], speed: 52, t0: 500, t1: 2500, end: 5000, dt: 1000 / 60 });
  const a = analyzeRun({ caseName: 'mx-stand-fwd-100', run: 'r1', events: SCRIPT, endMs: 5000, pcsx2: ps2, page });
  const get = (seg: number, metric: string): AnalysisRow => a.rows.find((r) => r.segment === seg && r.metric === metric)!;

  it('measures the steady speed of each side and their ratio and difference (PS2 over page)', () => {
    const r = get(1, 'steadySpeed');
    expect(r.ps2).toBeCloseTo(65, 0);
    expect(r.page).toBeCloseTo(52, 0);
    expect(r.ratio).toBeCloseTo(65 / 52, 1);
    expect(r.diff).toBeCloseTo(13, 0);
  });

  it('measures the heading of travel in Pose.yaw degrees (facing (-sin yaw, -cos yaw)): +z is 180', () => {
    expect(headingOf(0, 1)).toBeCloseTo(180, 6);
    expect(headingOf(-1, 0)).toBeCloseTo(90, 6);
    expect(get(1, 'headingDeg').ps2).toBeCloseTo(180, 3);
  });

  it('checks the two starts against each other (the same insertion point, game units on both sides)', () => {
    expect(a.checks.startOffset).toBeCloseTo(Math.hypot(0.4, 0.1), 6);
    expect(a.checks.startOffset).toBeLessThan(START_TOLERANCE);
    expect(a.checks.notes).toEqual([]);
  });

  it('measures an instant start with no acceleration time to speak of, and an instant stop as no stop distance', () => {
    expect(get(1, 't90Ms').ps2).toBeLessThan(120);
    expect(get(2, 'stopDist').page).toBeLessThan(5);
  });

  it('flags a PCSX2 series that never moves while the page walks (the 2026-10-31 live run)', () => {
    const still = line({ from: [936.9, -145.5, 855], dir: [0, 1], speed: 0, t0: 500, t1: 2500, end: 5000, dt: 1000 / 30 });
    const b = analyzeRun({ caseName: 'x', run: 'r', events: SCRIPT, endMs: 5000, pcsx2: still, page });
    expect(b.checks.notes.join(' ')).toMatch(/PCSX2 position never moved/);
  });

  it('flags a still PCSX2 series under a held stick when the page carries no feet (a run before the matrix)', () => {
    const still = line({ from: [936.9, -145.5, 855], dir: [0, 1], speed: 0, t0: 500, t1: 2500, end: 5000, dt: 1000 / 30 });
    const b = analyzeRun({ caseName: 'x', run: 'r', events: SCRIPT, endMs: 5000, pcsx2: still, page: [] });
    expect(b.checks.notes.join(' ')).toMatch(/PCSX2 position never moved .* left stick held 2.0 s/);
  });

  it('flags two starts farther apart than START_TOLERANCE', () => {
    const far = line({ from: [960, -140, 696], dir: [0, 1], speed: 52, t0: 500, t1: 2500, end: 5000, dt: 1000 / 60 });
    const b = analyzeRun({ caseName: 'x', run: 'r', events: SCRIPT, endMs: 5000, pcsx2: ps2, page: far });
    expect(b.checks.notes.join(' ')).toMatch(/starts .* apart/);
  });

  it('writes one CSV row per segment and metric', () => {
    const csv = analysisCsv(a.rows);
    expect(csv.split('\n')[0]).toBe('case,run,segment,t0,t1,label,metric,ps2,page,ratio,diff');
    expect(csv).toMatch(/^mx-stand-fwd-100,r1,1,500,2500,lup=1,steadySpeed,/m);
  });
});

describe('the deceleration', () => {
  it('measures the stop distance and time after the release on a side that glides', () => {
    // The page brakes over 400 ms from 60 u/s (12 units), PS2 stops at once.
    const page: Sample[] = [];
    for (let t = 0; t <= 4000; t += 1000 / 60) {
      const v = t < 500 ? 0 : t <= 2500 ? 60 : Math.max(0, 60 * (1 - (t - 2500) / 400));
      const prev = page[page.length - 1];
      const z = prev ? prev.z + v * (1000 / 60) / 1000 : 0;
      page.push({ t, x: 0, y: 0, z, rootY: null, yaw: null, stance: 'stand', busy: false });
    }
    const ps2 = line({ from: [0, 0, 0], dir: [0, 1], speed: 60, t0: 500, t1: 2500, end: 4000, dt: 1000 / 30 });
    const a = analyzeRun({ caseName: 'c', run: 'r', events: SCRIPT, endMs: 4000, pcsx2: ps2, page });
    const r = a.rows.find((x) => x.segment === 2 && x.metric === 'stopDist')!;
    expect(r.page).toBeGreaterThan(9);
    expect(r.page).toBeLessThan(14);
    expect(r.ps2).toBeLessThan(3);
    const ms = a.rows.find((x) => x.segment === 2 && x.metric === 'stopMs')!;
    expect(ms.page).toBeGreaterThan(300);
  });
});

describe('the stance transitions', () => {
  it('times each Triangle act to the settled new stance on each side', () => {
    const ev = parseScript('500 triangle 1\n650 triangle 0\n');
    const ps2: Sample[] = [];
    for (let t = 0; t <= 3000; t += 1000 / 30) {
      const k = Math.min(1, Math.max(0, (t - 500) / 900));
      const rootY = 11.484 - k * (11.484 - 2);
      ps2.push({ t, x: 0, y: 0, z: 0, rootY, yaw: null, stance: k >= 1 ? 'prone' : k === 0 ? 'stand' : 'unknown', busy: false });
    }
    const page: Sample[] = [];
    for (let t = 0; t <= 3000; t += 1000 / 60) {
      page.push({ t, x: 0, y: 0, z: 0, rootY: null, yaw: 180, stance: t >= 500 ? 'prone' : 'stand', busy: t >= 500 && t < 1200 });
    }
    const a = analyzeRun({ caseName: 'prone-from-stand', run: 'r', events: ev, endMs: 3000, pcsx2: ps2, page });
    const tr = a.rows.find((r) => r.metric === 'transitionMs')!;
    expect(tr.label).toBe('full from stand');
    expect(tr.ps2).toBeGreaterThan(850);
    expect(tr.ps2).toBeLessThan(1000);
    expect(tr.page).toBeGreaterThan(650);
    expect(tr.page).toBeLessThan(760);
    expect(a.rows.find((r) => r.segment === 'act1' && r.metric === 'endStance')).toMatchObject({ ps2: 'prone', page: 'prone' });
  });

  /**
   * PR #644's review (Codex, 2026-11-03, P2): a stance reached after a later act is that act's, not the earlier one's --
   * each act's settle is searched up to the next act on that side's lateness-adjusted clock (hunt-stances-spam-mixed).
   */
  const twoPresses = (): { ev: ReturnType<typeof parseScript>; ps2: Sample[]; page: Sample[] } => {
    const ev = parseScript('500 triangle 1\n650 triangle 0\n1000 triangle 1\n1150 triangle 0\n');
    const side = (dt: number): Sample[] => {
      const out: Sample[] = [];
      for (let t = 0; t <= 3000; t += dt) out.push({ t, x: 0, y: 0, z: 0, rootY: t >= 1300 ? 2 : 11.484, yaw: null, stance: t >= 1300 ? 'prone' : 'stand', busy: false });
      return out;
    };
    return { ev, ps2: side(1000 / 30), page: side(1000 / 60) };
  };
  it('leaves an act unsettled when the stance lands only after the next act, and gives the next act the landing', () => {
    const { ev, ps2, page } = twoPresses();
    const a = analyzeRun({ caseName: 'two-presses', run: 'r', events: ev, endMs: 3000, pcsx2: ps2, page });
    const at = (seg: string, metric: string) => a.rows.find((r) => r.segment === seg && r.metric === metric)!;
    expect(at('act1', 'transitionMs')).toMatchObject({ ps2: null, page: null });
    expect(at('act1', 'endStance')).toMatchObject({ ps2: 'stand', page: 'stand' });
    expect(at('act2', 'transitionMs').ps2).toBeGreaterThanOrEqual(290);
    expect(at('act2', 'transitionMs').ps2).toBeLessThan(340);  // the first 30 Hz sample at or after 1300
    expect(at('act2', 'transitionMs').page).toBeGreaterThanOrEqual(290);
    expect(at('act2', 'transitionMs').page).toBeLessThan(320);
    expect(at('act2', 'endStance')).toMatchObject({ ps2: 'prone', page: 'prone' });
  });
  it('bounds each side by the next act on its own lateness-adjusted clock', () => {
    const { ev, ps2, page } = twoPresses();
    const line2 = ev.find((e) => e.t === 1000)!.line;
    const late = { pcsx2: new Map([[line2, 400]]), page: new Map<number, number>() };
    const a = analyzeRun({ caseName: 'two-presses', run: 'r', events: ev, endMs: 3000, pcsx2: ps2, page, late });
    const tr = a.rows.find((r) => r.segment === 'act1' && r.metric === 'transitionMs')!;
    // PCSX2's second act lands at 1400 on its clock, after the stance at 1300 (its first 30 Hz sample at or after it)
    expect(tr.ps2).toBeGreaterThanOrEqual(790);
    expect(tr.ps2).toBeLessThan(840);
    expect(tr.page).toBeNull();
  });
});

describe('the matrix', () => {
  it('takes the median of the trials and their spread per case, segment and metric', () => {
    const row = (run: string, ps2: number, page: number): AnalysisRow => ({
      case: 'mx', run, segment: 1, t0: 500, t1: 2500, label: 'lup=1', metric: 'steadySpeed', ps2, page, ratio: ps2 / page, diff: ps2 - page,
    });
    const m = matrixRows([row('a', 64, 50), row('b', 66, 54), row('c', 65, 52)]);
    expect(m).toEqual([{
      case: 'mx', segment: 1, label: 'lup=1', metric: 'steadySpeed', n: 3,
      ps2Median: 65, ps2Spread: 2, pageMedian: 52, pageSpread: 4, ratio: 65 / 52, diff: 13,
    }]);
    expect(matrixCsv(m).split('\n')[0]).toBe('case,segment,label,metric,n,ps2Median,ps2Spread,pageMedian,pageSpread,ratio,diff');
  });
});

describe('the case name and the CSV cells (record.json carries the script TEXT in `script`)', () => {
  const TEXT = '# EPH script (tools/eph/script.ts grammar). Movement campaign, case incline-prone (tools/eph/scripts/movement-campaign.sh).\n# Tests: a, b, and c.\n500 lup 1\n2500 lup 0\n';

  it('takes the case from scriptFile (run.ts, EPH-TILT on), else the text header, else the bare file name', () => {
    expect(caseNameOf({ script: TEXT, scriptFile: 'tools/eph/scripts/mx-stand-fwd-100.txt' })).toBe('mx-stand-fwd-100');
    expect(caseNameOf({ script: TEXT })).toBe('incline-prone');
    expect(caseNameOf({ script: 'tools/eph/scripts/smoke.txt' })).toBe('smoke');
    expect(caseNameOf({ script: '500 lup 1\n' })).toBe('script');
    expect(caseNameOf({})).toBe('script');
  });

  it('quotes a cell holding a comma, a quote or a line break (RFC 4180), leaves the rest bare', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(1.23456)).toBe('1.2346');
    expect(csvCell(null)).toBe('');
  });

  it('a run directory whose record.json holds multi-line script text gives a one-word case and well-formed rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eph-case-'));
    try {
      writeFileSync(join(dir, 'record.json'), JSON.stringify({ script: TEXT, guest0: 10000, tick0: 100, events: [] }));
      writeFileSync(join(dir, 'script.txt'), TEXT);
      const ps2 = ['clockBits,t,x,y,z,rootY,moveScale,stanceRequest,wallMs'];
      const page = ['tick,stance,posture,walking,action_name,action_t,action_reversed,x,y,z,yaw'];
      for (let k = 0; k <= 90; k++) {
        ps2.push(`${k + 1},${10 + k / 30},900,-140,${850 + Math.max(0, Math.min(k / 30, 2.5) - 0.5) * 65},11.484,1,0,${k}`);
        page.push(`${100 + 2 * k},stand,stand,true,,,,900,-140,${850 + Math.max(0, Math.min(k / 30, 2.5) - 0.5) * 60},180`);
      }
      writeFileSync(join(dir, 'pcsx2.csv'), ps2.join('\n') + '\n');
      writeFileSync(join(dir, 'page.csv'), page.join('\n') + '\n');
      const out = analyzeRunDir(dir);
      expect(out.caseName).toBe('incline-prone');
      const lines = readFileSync(join(dir, 'analysis.csv'), 'utf8').trimEnd().split('\n');
      expect(lines.length).toBe(out.rows.length + 1);
      for (const l of lines.slice(1)) {
        expect(l.startsWith('incline-prone,')).toBe(true);
        expect(l.split(',').length).toBe(11);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a run that never started its script', () => {
  it('is skipped with a note (no guest0/tick0), and the others still measure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eph-skip-'));
    try {
      writeFileSync(join(dir, 'record.json'), JSON.stringify({ script: '500 lup 1\n', scriptFile: 'tools/eph/scripts/tilt-bank.txt', guest0: null, tick0: null, outcome: 'failed: EPH run: no PCSX2 row in 30 s' }));
      writeFileSync(join(dir, 'script.txt'), '500 lup 1\n');
      writeFileSync(join(dir, 'pcsx2.csv'), '');
      writeFileSync(join(dir, 'page.csv'), '');
      const out = analyzeRunDir(dir);
      expect(out.skipped).toBe(true);
      expect(out.rows).toEqual([]);
      expect(out.caseName).toBe('tilt-bank');
      expect(out.checks.notes.join(' ')).toMatch(/skipped: no guest0\/tick0.*no PCSX2 row in 30 s/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
