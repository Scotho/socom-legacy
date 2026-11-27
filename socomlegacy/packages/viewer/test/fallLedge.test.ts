import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, Walker, type WalkInput } from '../src/sim';
import { applyFall, fallDamageFraction, freshHealth } from '../src/net/damage';

/**
 * A crouched walk-off from a real ledge at three heights, through the port's real mover, against the rig's capture of
 * the original walking off real ledges (R145). The companion of `test/fallDrop.test.ts` (the same drops by placement).
 *
 * WHAT WAS MEASURED (a capture of the original, pending review; match q29, MP12, round 2; by WALK-OFF): bodies placed on
 * a ledge's top 25 u back from the edge, CROUCHED, walked off by their own left stick; the fall speed (actor +0x1340)
 * and the root read every row. The record: `evidence/weekend-mega-2026-11-14/rig/RELAY1-q29-R145-half-frames-six-falls-1526Z.md`
 * on the sprint's hub (it supersedes the round-1 record `RELAY1-q29-R145-real-ledges-first-1520Z.md` of the same match).
 * Its datum, quoted: "the true drop to the rest root is 63.4758 / 69.6398 / 99.6125 u" -- the top's root y on the frame
 * the body leaves the edge (106.0508 / 112.2148 / 142.1875) down to the rest root 42.575 on the lower floor. The
 * whole-step runs, quoted from it:
 *   63.4758 u: 23 whole steps -> 180.35 u/s, x 0.856;
 *   69.6398 u: 24 whole steps, no half -> 188.19 u/s, x 0.738;
 *   99.6125 u: 28 whole steps -> last read 211.7150, +1 = 219.56 u/s, x 0.268, alive.
 * On the frame the body leaves the edge the original's speed is already one step (7.8413) "while the root and +0x2e4
 * still read the top's height"; then +7.8413 u/s a frame at 1/30 s; the landing's loss is for the last speed read plus
 * ONE whole step. The record gives the horizontal speed in the air as 65 u/s (2.17 u a frame) -- not compared here.
 *
 * NOT ASSERTED -- THE ORIGINAL'S OWN CLOCK: the record shows the game sometimes takes a HALF frame (0.0167 s, the speed
 * stepping 3.9281, the altitude step halved), and those runs lose differently off the same ledge: 63.48 u with one half
 * frame (21 whole + one half) -> 176.44 u/s, x 0.914; 69.64-69.68 u with one half frame (22 whole + one half) -> 184.27
 * u/s, x 0.797. The port steps whole frames only, so it is compared with the whole-step runs, frame count and factor.
 *
 * WHAT IS RUN (the port): a raised flat platform (a floor polygon at y = h, z 0..1000) ending in a vertical face at
 * z = 0 (wound to face the lower side) over a lower flat floor (y = 0, z -1000..0). The body is placed 25 u back from
 * the edge (the record's set-up), settled, crouched by the mover's own stance press (`Walker.changeStance('crouch')`),
 * left to finish the transition, and walked by the stick (`tick({ forward: 1 })`, yaw 0 faces -z) until it leaves the
 * edge and lands. Recorded per height: the y on the last ground tick, the first three airborne 60 Hz ticks' vy and y,
 * the landing's contact speed, frames = round(speed / G_DT), the loss by `fallDamageFraction`, the factor 1 - loss,
 * dead or alive; and beside them the same height by PLACEMENT at rest (`fallDrop.test.ts`'s `drop(h)`, copied).
 *
 * EVIDENCE KINDS, APART: this is a unit test over synthetic geometry (no disc data); what it is compared with is a
 * capture of the original by walk-off, pending review. A RED KEPT ON THE BRANCH (R145): whichever rows fail stay red;
 * nothing here is tuned to pass or fail, and no mover change is opened from it.
 */

/** One game frame's g dt (g 235, the frame 525 / 15734 s), as `fallDrop.test.ts`: the steps a fall took are its contact speed over this. */
const G_DT = 235 * (525 / 15734);

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };

/** A flat floor (`m_ditype` 3) over x -1000..1000, z z0..z1, at y. */
function floorPoly(y: number, z0: number, z1: number, material = 25): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, y, z0, 1000, y, z0, 1000, y, z1, -1000, y, z1]),
  };
}

/** FLE-2: the lower floor's soil, GRASS (-0.8), and its bare height over the rest height 0. */
const LOWER_SOIL = 4, LOWER_BARE = 0.8;

/** The ledge's vertical face at z = 0 from y 0 to h (`m_ditype` 2), wound so its normal is -z: it faces the lower floor. */
function facePoly(h: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([1000, 0, 0, -1000, 0, 0, -1000, h, 0, 1000, h, 0]),
  };
}

function ledge(h: number): Walker {
  // FLE-2 (the plan's "ledge tests' geometry, stated"): the TOP at the captured root height on a no-offset soil (25:
  // the climb's lookup gives 0); the LOWER floor at its BARE height, the rest height 0 plus 0.8, on GRASS (hull material
  // 4, -0.8): the rig's +0x404 43.375 under the body that rests at 42.575 (research 151 s9.3; l-fle2-soil).
  const polys = [floorPoly(h, 0, 1000), floorPoly(LOWER_BARE, -1000, 0, LOWER_SOIL), facePoly(h)];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const w = new Walker(buildGrid(PARAMS, [], [], polys, owners));
  expect(w.place(0, h + 20, 25), `${h} u: placed on the top`).toBe(true);
  w.settle();
  w.state.yaw = 0;
  return w;
}

interface Tick { vy: number; y: number }
interface WalkOff {
  h: number; leftY: number; air: Tick[]; leftSpeed: number;
  speed: number; frames: number; loss: number; factor: number; dead: boolean;
}

/** A crouched body 25 u back from the edge of an h-high ledge, walked off by the stick until it lands. */
function walkOff(h: number): WalkOff {
  const w = ledge(h);
  expect(w.state.y, `${h} u: on the top`).toBeCloseTo(h, 3);
  w.changeStance('crouch');                                      // the game's stance press
  for (let i = 0; i < 3 * 60; i++) w.tick(STILL);                // the transition clip runs out
  expect(w.stance, `${h} u: crouched`).toBe('crouch');
  expect(w.airborne).toBe(false);
  let leftY = w.state.y, leftSpeed = 0;
  for (let i = 0; i < 20 * 60 && !w.airborne; i++) {
    leftY = w.state.y;
    leftSpeed = Math.hypot(w.state.vx, w.state.vz);
    w.tick(FORWARD);
  }
  expect(w.airborne, `${h} u: left the edge`).toBe(true);
  const air: Tick[] = [{ vy: w.state.vy, y: w.state.y }];
  for (let i = 0; i < 20 * 60 && w.airborne; i++) {
    w.tick(FORWARD);
    if (air.length < 3 && w.airborne) air.push({ vy: w.state.vy, y: w.state.y });
  }
  expect(w.airborne, `${h} u: landed`).toBe(false);
  expect(w.state.y, `${h} u: on the lower floor`).toBeCloseTo(0, 3);
  const landing = w.landing!;
  expect(landing).not.toBeNull();
  const health = freshHealth();
  const dead = applyFall(health, landing.speed);
  const loss = fallDamageFraction(landing.speed);
  return { h, leftY, air, leftSpeed, speed: landing.speed, frames: Math.round(landing.speed / G_DT), loss, factor: 1 - loss, dead };
}

/** `fallDrop.test.ts`'s placement, copied: a body at rest h over one flat floor, no stick, stepped until it lands. */
function flat(): Walker {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(PARAMS, [floorPoly(0, -1000, 1000)], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

function drop(h: number): { speed: number; factor: number; dead: boolean } {
  const w = flat();
  w.state.y = h;
  w.setAirborne(true);
  for (let i = 0; i < 10 * 60 && w.airborne; i++) w.tick(STILL);
  expect(w.airborne, `${h} u placed: landed`).toBe(false);
  const landing = w.landing!;
  const dead = applyFall(freshHealth(), landing.speed);
  return { speed: landing.speed, factor: 1 - fallDamageFraction(landing.speed), dead };
}

/** The record's whole-step runs: true drop, steps, contact speed, health factor. */
const MEASURED: readonly { h: number; steps: number; speed: number; factor: number }[] = [
  { h: 63.4758, steps: 23, speed: 180.35, factor: 0.856 },
  { h: 69.6398, steps: 24, speed: 188.19, factor: 0.738 },
  { h: 99.6125, steps: 28, speed: 219.56, factor: 0.268 },
];

/**
 * THE TWO FRAME TABLES (a capture of the original, pending review; the record
 * `evidence/weekend-mega-2026-11-14/rig/RELAY1-q29-R145-two-frame-tables-R142-sample1-1537Z.md` on the sprint's hub):
 * one entry a game frame, the root y on each AIR frame of two whole-step walk-offs, the last entry the landing frame's
 * (the body at its rest root, 42.575). The record gives the fall speed (`+0x1340` in the rig's layout) on air frame k
 * as k x 7.8413 u/s, the landing frame included (211.7150 at frame 27, 172.5085 at frame 22) -- and the loss as for one
 * step more (28.00 and 23.00 steps). `top` is the root on the two frames before the first air frame; `rest` the root
 * the body rests at on the lower floor, whose record (`+0x404`) reads 43.375, 0.8 above it.
 */
const REST = 42.575;
const TABLES: readonly { name: string; top: number; y: readonly number[] }[] = [
  {
    name: '99.61 u (L3b)', top: 142.1875,
    y: [141.6329, 141.1096, 140.3247, 139.2781, 137.9699, 136.4000, 134.5685, 132.4754, 130.1206, 127.5042, 124.6261,
      121.4864, 118.0851, 114.4221, 110.4974, 106.3112, 101.8632, 97.1537, 92.1825, 86.9496, 81.4551, 75.6990, 69.6812,
      63.4018, 56.8608, 50.0581, 42.5750],
  },
  {
    name: '63.48 u (L1c)', top: 106.0508,
    y: [105.4962, 104.9729, 104.1880, 103.1414, 101.8332, 100.2633, 98.4318, 96.3387, 93.9839, 91.3675, 88.4894,
      85.3497, 81.9483, 78.2854, 74.3607, 70.1744, 65.7265, 61.0170, 56.0458, 50.8129, 45.3184, 42.5750],
  },
];

/**
 * The port's own table for the same ledge: a crouched walk-off of `top - REST` u, one entry for every 60 Hz tick in
 * the air on which the height moved (the height steps once a game frame), in the capture's coordinates (the lower
 * floor's rest root at `REST`). `vy` is the fall speed after the frame's step, positive down; the landing frame's is
 * the contact speed the mover hands on (`Walker.landing.speed`), since the landing zeroes the stored one.
 */
function portFrames(top: number): { y: number; vy: number }[] {
  const h = top - REST;
  const w = ledge(h);
  w.changeStance('crouch');
  for (let i = 0; i < 3 * 60; i++) w.tick(STILL);
  for (let i = 0; i < 20 * 60 && !w.airborne; i++) w.tick(FORWARD);
  expect(w.airborne, `harness: ${h} u: left the edge`).toBe(true);
  expect(w.state.y, `harness: ${h} u: the take-off tick leaves the root at the top`).toBeCloseTo(h, 3);
  const frames: { y: number; vy: number }[] = [];
  let last = w.state.y;
  for (let i = 0; i < 20 * 60 && w.airborne; i++) {
    w.tick(FORWARD);
    if (w.state.y !== last) {
      frames.push({ y: w.state.y + REST, vy: w.airborne ? -w.state.vy : w.landing!.speed });
      last = w.state.y;
    }
  }
  expect(w.airborne, `harness: ${h} u: landed`).toBe(false);
  return frames;
}

describe('the port\'s root y and fall speed, frame by frame, beside the rig\'s two frame tables (q29, MP12, pending review; R145: a red kept)', () => {
  it.each(TABLES)('$name: every air frame\'s root y and speed as the capture\'s', (t) => {
    const port = portFrames(t.top);
    const f = (n: number | undefined, k = 4): string => (n === undefined ? '-' : n.toFixed(k));
    const n = Math.max(port.length, t.y.length);
    const lines: string[] = [];
    let first = -1;
    for (let k = 1; k <= n; k++) {
      const p = port[k - 1], oy = t.y[k - 1], ovy = k <= t.y.length ? k * G_DT : undefined;
      const differs = p === undefined || oy === undefined || Math.abs(p.y - oy) > 0.001 || Math.abs(p.vy - ovy!) > 0.01;
      if (differs && first < 0) first = k;
      lines.push(`${k} | ${f(oy)} | ${f(ovy)} | ${f(p?.y)} | ${f(p?.vy)} | ${p && oy !== undefined ? f(p.y - oy) : '-'}${differs ? ' *' : ''}`);
    }
    console.log([
      `${t.name}: top ${t.top}, rest ${REST}; air frames original ${t.y.length}, port ${port.length}; first frame that differs: ${first < 0 ? 'none' : first}`,
      'air frame | original y | original speed | port y | port speed | port y - original y',
      ...lines,
    ].join('\n'));
    expect(first, `the first air frame whose root y (0.001) or speed (0.01) differs; air frames original ${t.y.length}, port ${port.length}`).toBe(-1);
  });
});

describe('a crouched walk-off from a real ledge against the rig\'s capture (q29, MP12, whole-step runs, pending review; R145: a red kept)', () => {
  it.each(MEASURED)('$h u: $steps steps and every health x $factor (a capture of the original by walk-off, pending review)', (m) => {
    const d = walkOff(m.h);
    expect(d.frames, `speed ${d.speed}`).toBe(m.steps);
    expect(Math.abs(d.factor - m.factor), `factor ${d.factor}`).toBeLessThanOrEqual(0.01);
    if (m.factor > 0) expect(d.dead).toBe(false);
  });

  it('informational: walk-off and placement beside the capture (asserts only three rows)', () => {
    const f = (n: number, k = 2): string => n.toFixed(k);
    const rows = MEASURED.map((m) => {
      const d = walkOff(m.h);
      const p = drop(m.h);
      const air = d.air.map((t) => `${f(t.vy)}@${f(t.y, 3)}`).join(' ');
      return `${m.h} | ${f(d.leftY, 3)} | ${f(d.leftSpeed)} | ${f(d.air[0]!.vy)} | ${air} | ${f(d.speed)} | ${d.frames} (${m.steps}) | `
        + `${d.dead ? 'dead' : f(d.factor, 3)} | ${m.factor} | ${f(p.speed)} | ${p.dead ? 'dead' : f(p.factor, 3)}`;
    });
    console.log([
      'h | left-ground y | port walk speed | first-air vy | first three air ticks vy@y | landing speed | frames (measured) | port factor | measured factor | placed speed | placed factor',
      ...rows,
    ].join('\n'));
    expect(rows).toHaveLength(3);
  });
});
