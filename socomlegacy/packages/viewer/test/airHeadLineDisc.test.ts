// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { readSkeleton } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { SEAL_ANIMS } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { AIR_POSED_HEAD_READING, airPosedHead, groundPolygons, Walker, wallHeadLine, wallProbeHeights, type GroundMotion } from '../src/mover';
import { Traversal } from '../src/traversal';
import { loadSimMap, type SimMap } from '../src/simMap';

/**
 * AIR-HEAD-LINE (v0.4.21; simulation track; reading, pending review). Players cannot jump through the windows of
 * Desert Glory's (MP6) SEAL building: "an invisible wall". A dev-disc test: `RUN/MP6.ZDB` through `loadSimMap`; it reads
 * `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`) and skips -- said in the suite's title -- without it.
 *
 * The window: `worldmodel/building_wc2/mp6_window_wide` at (1234.5, 1768), an open frame 4 deep (x 1232.5 to 1236.5),
 * 19 wide (z 1758.5 to 1777.5), its sill polygon at y 11.5 and its lintel at 24.5 over the floor at 0 on both sides;
 * the building's walls round it (`fl1_extwall1` outside, `fl1_intwall3` inside) leave a band clear to the walk's level
 * segments from y 11.25 to 24.75 (the investigation's probe, 2026-11-13, agent-mail evidence window-probe; within
 * 0.25). A body's two lines over the feet -- the low line at 6.5 (`WALL_PROBE_READING`) and the head line -- must both
 * pass that band as it reaches the wall.
 *
 * The head line is the head node AS POSED + 2 (`FUN_0054aa30`, the controlled body's branch, D:L415437-415446: the
 * actor's root plus `FUN_002869d0(actor+0x170, actor[0xc2])`, the `head` node; the other arm D:L415459-415461 the
 * same), and the same routine casts the airborne segments (research 217 s2.10: D:L415157-415166, D:L415401-415410).
 * The port held the airborne line at the standing idle head, 19.394 over the feet: the two lines span 12.894 and fit
 * the band only with the feet between 4.75 and 5.36, which no tick of the running jump's arc gives at the wall. The
 * running jump's own clips put the head lower (research 217 s2.2, `AIR_POSED_HEAD_READING`).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_MP6 = DISC !== '' && existsSync(join(DISC, 'RUN', 'MP6.ZDB'));
const RUN = join(DISC, 'RUN');
const HAVE_ANIM = DISC !== '' && ['MP2.ZDB', 'MOTION_P.ZAR', 'READERC.ZAR'].every((file) => existsSync(join(RUN, file)));

/** The window (`mp6_window_wide`, the collision polygons' box) and the walls' clear band through it (the probe's scan). */
const WINDOW = { x: 1234.5, z: 1768, sill: 11.5, lintel: 24.5, near: 1232.5, far: 1236.5, clear: [11.25, 24.75] } as const;
const STILL = { forward: 0, right: 0, boost: false }, FORWARD = { forward: 1, right: 0, boost: false };
const LINE = ['centre', 'head', 'side'] as const;
const f = (v: number): string => v.toFixed(2);

interface Run { through: boolean; plane: number; text: string; first: { line: number; y: number; feet: number; head: number; path: string } | null }

/**
 * A running jump at the window along x (`dir` +1: from outside, x rising; -1 from inside), the harness of
 * `m51DitchBlock.disc.test.ts`: a `Walker` with a `Traversal` driver on the map's grid, placed 60 from the window's
 * middle on the floor (y 0), faced along x, the stick held forward, `jump()` on the first tick the feet are within
 * `press` of the window's middle plane (x 1234.5). THROUGH: the feet end 5 past that plane (3 past the frame).
 */
function jumpAt(map: SimMap, dir: 1 | -1, press: number): Run {
  const w = new Walker(map.grid);
  w.driver = new Traversal(map.grid, groundPolygons(map.ground));
  expect(w.place(WINDOW.x - dir * 60, WINDOW.sill, WINDOW.z)).toBe(true);
  w.state.yaw = dir > 0 ? -90 : 90;                              // forward is (-sin, -cos)
  w.stance = 'stand';
  for (let i = 0; i < 30; i++) w.tick(STILL);
  const floor = w.state.y;
  const plane = (): number => dir * (WINDOW.x - w.state.x);
  // The head line in use (`Walker.probeHeights`, private: the heights the tick's walls were met at).
  const heights = (): readonly [number, number] => (w as unknown as { probeHeights(): readonly [number, number] }).probeHeights();
  let pressed = -1, landed = -1, first: Run['first'] = null, nearest = Infinity;
  for (let t = 0; t < 300; t++) {
    if (pressed < 0 && !w.airborne && plane() <= press && w.jump()) pressed = t;
    w.tick(FORWARD);
    nearest = Math.min(nearest, plane());
    if (pressed >= 0 && first === null) {
      const h = w.wallHits()[0];
      if (h) first = { line: h.line, y: h.y, feet: w.state.y, head: heights()[1], path: h.poly.path };
    }
    if (pressed >= 0 && landed < 0 && t > pressed && !w.airborne) landed = t;
    if (landed >= 0 && t - landed >= 15) break;
    if (pressed < 0 && t > 200) break;
  }
  const end = plane();
  const through = end < -5;
  const met = first
    ? `the first wall met after the press: the ${LINE[first.line]} line at y ${f(first.y)} with the feet at ${f(first.feet)} and the airborne head line`
      + ` ${f(first.head)} over the feet, on ${first.path}`
    : 'no wall met after the press';
  const text = `${dir > 0 ? 'from outside (+x)' : 'from inside (-x)'}, pressed at ${press}${pressed < 0 ? ' (NO JUMP)' : ''}: ended ${f(end)} from the`
    + ` window's plane (nearest ${f(nearest)}), floor ${f(floor)}; ${met}; the opening y ${WINDOW.sill}..${WINDOW.lintel}`
    + ` (${WINDOW.lintel - WINDOW.sill} tall), the walls' clear band y ${WINDOW.clear[0]}..${WINDOW.clear[1]}`;
  return { through, plane: end, text, first };
}

describe.skipIf(!HAVE_MP6)(`a running jump through Desert Glory's SEAL-building window${HAVE_MP6 ? '' : ' (SOCOM_DISC with RUN/MP6.ZDB absent: skipped)'}`, () => {
  let loaded: Promise<SimMap> | null = null;
  const mp6 = (): Promise<SimMap> => (loaded ??= loadSimMap(new FsAssetSource(DISC), 'RUN/MP6.ZDB'));

  // The take-off 43.2 out (the press at 44: the tick the feet come within it): the arc reaches the wall on its way down,
  // the feet 6.29 over the floor in the launch's key 6.7 (`AIR_POSED_HEAD_READING.launch` 16.319, the line 18.32): the
  // low line 12.79 and the head line 24.61 both inside the band; the body steps onto the sill at 11.5 and drops inside.
  it('pressed 44 out, the running jump passes the window both ways (the airborne head line at the launch\'s posed head + 2)', async () => {
    const map = await mp6();
    for (const dir of [1, -1] as const) {
      const run = jumpAt(map, dir, 44);
      expect(run.through, run.text).toBe(true);
    }
  }, 120_000);

  // The control: pressed 28 out the body reaches the wall near the arc's top, the feet 10.55 over the floor -- the head
  // line (the launch's posed head + 2 or the idle head's 19.394 alike) over 24.75, inside the wall above the lintel:
  // a lintel lower than the posed head still stops the body, and the head line is what stops it.
  it('pressed 28 out the body reaches the wall near the arc\'s top: the wall over the lintel stops its head line', async () => {
    const map = await mp6();
    for (const dir of [1, -1] as const) {
      const run = jumpAt(map, dir, 28);
      expect(run.through, run.text).toBe(false);
      expect(run.first, run.text).not.toBeNull();
      expect(LINE[run.first!.line], run.text).toBe('head');
      expect(run.first!.feet + run.first!.head, run.text).toBeGreaterThan(WINDOW.clear[1]);
      expect(run.plane, run.text).toBeGreaterThan(WINDOW.x - WINDOW.near);   // held outside the frame's near face
    }
  }, 120_000);

  // Review F1, on the disc: off the window's sill (y 11.5) into the room (floor 0), the body walks or crawls off the edge
  // and `fall` pushes the action. Standing, the line is the fall's posed head + 2; crouched and prone the idle head's.
  it('off the sill: standing the fall\'s posed head; crouched 12.138 and prone 5.637 as before', async () => {
    const map = await mp6();
    const seen: Record<string, Set<string>> = {};
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const w = new Walker(map.grid);
      w.driver = new Traversal(map.grid, groundPolygons(map.ground));
      expect(w.place(WINDOW.x, WINDOW.sill + 1, WINDOW.z)).toBe(true);
      expect(w.state.y, stance).toBeCloseTo(WINDOW.sill, 1);                   // on the sill
      w.state.yaw = -90;                                                       // facing +x, into the room
      w.stance = stance;
      for (let i = 0; i < 30; i++) w.tick(STILL);
      const lines = new Set<string>();
      let airTicks = 0;
      for (let t = 0; t < 240 && airTicks < 60; t++) {
        w.tick(FORWARD);
        if (!w.airborne || w.action?.name !== 'fall') continue;
        airTicks++;
        const head = (w as unknown as { probeHeights(): readonly [number, number] }).probeHeights()[1];
        const want = w.posture === 'stand' ? airPosedHead({ name: 'fall', t: w.action.t })! + 2 : wallProbeHeights(w.posture)[1];
        expect(head, `${stance} (posture ${w.posture}) at the fall's ${w.action.t.toFixed(3)} s`).toBeCloseTo(want, 6);
        lines.add(`${w.posture}:${head.toFixed(3)}`);
      }
      expect(airTicks, `${stance}: never fell off the sill (ended at ${w.state.x.toFixed(2)}, ${w.state.y.toFixed(2)})`).toBeGreaterThan(0);
      seen[stance] = lines;
    }
    expect([...seen.crouch!]).toEqual(['crouch:12.138']);
    expect([...seen.prone!]).toEqual(['prone:5.637']);
  }, 120_000);

  // Which press distances pass, pinned rather than assumed (the coordinator's ask, 2026-11-13): the investigation's
  // prediction was 11 to 17 (the rising tick at feet 5.64 inside the band). Measured: there the head segment, reaching
  // ahead of the body, meets the wall over the lintel on the next tick (feet 7.26) before the body is past the face, so
  // those stop 5.7 short; only the take-off whose arc reaches the wall falling with the feet at 6.29 passes. The idle
  // head passed none of these (the RED, 4ba2d77db5; the probe's sweep 6 to 44).
  it('of the presses 8 to 54 in half units, exactly 43.5 and 44 pass, both ways', async () => {
    const map = await mp6();
    for (const dir of [1, -1] as const) {
      const passed: number[] = [];
      for (let press = 8; press <= 54; press += 0.5) if (jumpAt(map, dir, press).through) passed.push(press);
      expect(passed, `${dir > 0 ? 'from outside' : 'from inside'}`).toEqual([43.5, 44]);
    }
  }, 300_000);
});

// The rule alone (no disc): which head the line takes in each state (`wallHeadLine`, `airPosedHead`).
describe('the airborne head line: the jump clip\'s posed head + 2 at its key (AIR-HEAD-LINE)', () => {
  const IDLE: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
  const L = AIR_POSED_HEAD_READING.launch, F = AIR_POSED_HEAD_READING.fall;
  const launchAt = (k: number): number => (k * 2.4 * (24 / 25) ** 2) / 24;      // the launch's clock at key k (`oneShotSeconds`)
  const fallAt = (k: number): number => (k * 5 * (13 / 14) ** 2) / 13;
  it('the launch: key 0 at the take-off, the greater of the two keys between, the last key held past the clip\'s 2.212 s', () => {
    expect(wallHeadLine('stand', IDLE, true, { name: 'launch', t: 0 })).toBeCloseTo(16.950 + 2, 6);
    expect(wallHeadLine('stand', IDLE, true, { name: 'launch', t: launchAt(6.7) })).toBeCloseTo(16.319 + 2, 6);    // keys 6, 7
    expect(wallHeadLine('stand', IDLE, true, { name: 'launch', t: launchAt(13.5) })).toBeCloseTo(16.259 + 2, 6);   // keys 13, 14
    expect(wallHeadLine('stand', IDLE, true, { name: 'launch', t: 9 })).toBeCloseTo(L.head[24] + 2, 6);
  });
  it('the fall: its own keys from its start (4.311 s), the last held', () => {
    expect(airPosedHead({ name: 'fall', t: 0 })).toBeCloseTo(15.830, 6);
    expect(airPosedHead({ name: 'fall', t: fallAt(2.5) })).toBeCloseTo(14.745, 6);                                  // keys 2, 3
    expect(airPosedHead({ name: 'fall', t: 60 })).toBeCloseTo(F.head[13], 6);
  });
  it('every airborne line stands under the idle head\'s 19.394, by 0.44 to 2.83', () => {
    const idle = wallProbeHeights('stand')[1];
    expect(idle).toBeCloseTo(19.394, 6);
    for (const row of [L, F]) for (const h of row.head) expect(h + 2).toBeLessThan(idle - 0.44 + 1e-9);
    expect(Math.min(...F.head) + 2).toBeCloseTo(idle - 2.827, 6);
  });
  it('unchanged: a one-shot owning the body on the ground, a blast\'s fall in the air and the ground\'s own table', () => {
    const idle = wallProbeHeights('stand')[1];
    expect(wallHeadLine('stand', IDLE, true)).toBe(idle);                                     // the standing jump, a landing
    expect(wallHeadLine('stand', IDLE, true, { name: 'fallForward', t: 0.3 })).toBe(idle);    // not measured: the idle head
    expect(wallHeadLine('stand', IDLE, true, { name: 'fallBackwards', t: 0.3 })).toBe(idle);
    expect(airPosedHead({ name: 'jump', t: 0.3 })).toBeNull();
    expect(wallHeadLine('stand', { state: 'stand', forward: 1, right: 0, cls: 1 })).toBeCloseTo(15.761 + 2, 6);
    expect(wallHeadLine('crouch', IDLE, false)).toBeCloseTo(wallProbeHeights('crouch')[1], 6);
  });
  // Review F1 (2026-11-13): the jump clips are standing clips; whether the original plays them for a crouched or prone
  // body in the air (a crouch walk or a crawl off a ledge, `fall` pushing the action) is unread, so those keep the idle head.
  it('a crouched or prone body in the air keeps its idle head (12.138, 5.637) under the fall and the launch', () => {
    for (const name of ['fall', 'launch'] as const) for (const t of [0, 0.3, 1]) {
      expect(wallHeadLine('crouch', IDLE, true, { name, t })).toBeCloseTo(10.138 + 2, 6);
      expect(wallHeadLine('prone', IDLE, true, { name, t })).toBeCloseTo(3.637 + 2, 6);
    }
  });
});

describe.skipIf(!HAVE_ANIM)(`AIR_POSED_HEAD_READING is the port's animator over MOTION_P.ZAR${HAVE_ANIM ? '' : ' (SOCOM_DISC with RUN/MP2.ZDB, MOTION_P.ZAR, READERC.ZAR absent: skipped)'}`, () => {
  const REST: MoverSnapshot = {
    vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
    ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
  };
  const fresh = () => {
    const mp2 = new Uint8Array(readFileSync(join(RUN, 'MP2.ZDB')));
    const sk = readSkeleton(Zar.parse(zdbMember(mp2, parseZdb(mp2), 'CLIB_GEO.ZED')), 'seal_A_scuba');
    const clips = clipsFromPack(new Uint8Array(readFileSync(join(RUN, 'MOTION_P.ZAR'))), PLAY_CLIPS);
    const table = motionTableFromArchive(new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))))!;
    return { sk, anim: new Animator(sk, clips, table, { random: () => 0 }), head: sk.indexOf('head') };
  };
  const ROWS = [['launch', SEAL_ANIMS.launch], ['fall', SEAL_ANIMS.inAir]] as const;

  // Each key held through the animator's traversal seam (a one-node play at a set key, no cross-fade) on a fresh
  // animator, as the window-jump probe measured them (2026-11-13).
  it('the head node over the feet at each key of seal_runningjump_launch and seal_runningjump_in_air; their keys and playback', () => {
    for (const [name, clip] of ROWS) {
      const row = AIR_POSED_HEAD_READING[name];
      const { sk, anim, head } = fresh();
      const m = anim.motion(clip);
      expect(m, clip).toBeDefined();
      expect(m!.looped, clip).toBe(false);
      expect(m!.frames, clip).toBe(row.frames);
      expect(m!.period, clip).toBeCloseTo(row.playback, 6);
      for (let k = 0; k < m!.frames; k++) {
        anim.step(1 / 60, { ...REST, traversal: { clip, frame: k, loop: false, rootY: null } });
        expect(sk.world[head]![13]!, `${clip} key ${k}`).toBeCloseTo(row.head[k]!, 2);
      }
    }
  }, 120_000);

  // The rule against the animator's own play of the action, tick by tick past the clip's cross-fade (its BlendTime):
  // the drawn head never stands over the rule's value within a tick of the clock (the greater of two keys bounds the
  // keys' interpolation), and the rule stands at most a key's change over it.
  it('the walker\'s rule bounds the animator\'s drawn head through each action, tick by tick past its cross-fade', () => {
    for (const [name, clip] of ROWS) {
      const { sk, anim, head } = fresh();
      const blend = anim.motion(clip)!.blendTime, ticks = Math.ceil(AIR_POSED_HEAD_READING[name].playback * 60) + 30;
      let worst = -Infinity;
      for (let i = 1; i <= ticks; i++) {
        const t = i / 60;
        anim.step(1 / 60, { ...REST, airborne: true, jumps: 1, vz: -65, vy: name === 'fall' ? -40 : 0, action: { name, serial: 1, t, seconds: null, reversed: false } });
        if (t < blend) continue;
        const drawn = sk.world[head]![13]!;
        const rule = Math.max(...[t - 1 / 60, t, t + 1 / 60].map((u) => airPosedHead({ name, t: Math.max(0, u) })!));
        expect(drawn, `${clip} at ${t.toFixed(3)} s`).toBeLessThanOrEqual(rule + 0.02);
        worst = Math.max(worst, rule - drawn);
      }
      expect(worst, clip).toBeLessThan(name === 'launch' ? 0.5 : 1);
    }
  }, 120_000);
});
