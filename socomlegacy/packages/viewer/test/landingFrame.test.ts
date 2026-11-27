// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, Walker, type WalkInput } from '../src/mover';

/**
 * LATER 1176 (simulation track; research 151 section 8 -- reading, pending review, backed by a capture comparison and a
 * memory trace of the original on r0004): a walk-off LANDS ONE GAME FRAME AFTER the frame that reaches the floor.
 *
 * The source (D): `FUN_0057e050`, pushing the fall action (9), sets `+0x1061` bit 0x02 (D:L440727-440728); while it is
 * set `FUN_0059b440`'s strict landing is not reached (D:L456506-456516). `FUN_0059ad30`'s last block (D:L456314-456323)
 * clamps the altitude to the frame-end floor and clears 0x02 -- the fall speed and the airborne bit left alone. The next
 * frame `FUN_0059b440` adds g dt (D:L456496), hands the speed over and zeroes it (D:L456515-456516) and clears the
 * airborne bit (D:L456528). So the damage (`FUN_005af590` D:L466910 -> `FUN_005ac1f0` D:L466656) reads the contact
 * frame's fall speed + g dt.
 * The original (C; research 151 s8.1, 8.4, 8.5): on MP51's stair cap the frame that reaches the street leaves the body ON
 * it with the airborne bit set, and the next frame lands: run-z540's 164.67 (the last airborne frame's word) hands
 * 172.51 (x 0.9730 measured), run-z510's 156.83 hands 164.67 (unhurt) -- the port hands a frame's g dt less and
 * leaves the cap unhurt.
 *
 * Every number here is written from the note's law (235 down, the 525/15734 s game frame), never read back from the
 * mover's constants.
 */

const G = 235;
const FRAME = 525 / 15734;

function floorPoly(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

function world(polys: WorldPoly[], cellDim = 1000): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim, cellsX: 4, cellsZ: 4, originX: -2 * cellDim, originZ: -2 * cellDim };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FACE_X = -90;

interface Row { airborne: boolean; y: number; vy: number }

/** A walk off a deck `h` high onto a floor at 0, every tick recorded from the step-off to 30 ticks past the landing. */
function walkOff(h: number): { w: Walker; rows: Row[] } {
  const w = new Walker(world([floorPoly(-200, -200, 0, 200, h), floorPoly(-200, -200, 600, 200, 0)]));
  w.place(-30, h + 1, 0);
  w.state.yaw = FACE_X;
  const rows: Row[] = [];
  for (let i = 0; i < 400 && !w.airborne; i++) w.tick(FORWARD);
  let landedAt = -1;
  for (let i = 0; i < 400 && (landedAt < 0 || rows.length < landedAt + 30); i++) {
    w.tick(FORWARD);                                             // the stick held: no soft landing's clip
    rows.push({ airborne: w.airborne, y: w.state.y, vy: w.state.vy });
    if (landedAt < 0 && !w.airborne) landedAt = rows.length - 1;
  }
  return { w, rows };
}

describe('LATER 1176: a walk-off lands a game frame after the frame that reaches the floor (FUN_0059ad30, FUN_0059b440)', () => {
  it('the frame that reaches the floor puts the feet on it, still airborne, falling; the next frame lands', () => {
    const { rows } = walkOff(40);
    const contact = rows.findIndex((r) => r.y <= 1e-6);
    expect(contact).toBeGreaterThanOrEqual(0);
    expect(rows[contact]!.y).toBeCloseTo(0, 6);                 // the clamp: the altitude to the frame-end floor
    expect(rows[contact]!.airborne).toBe(true);                 // the airborne bit left set (D:L456314-456323)
    const landed = rows.findIndex((r) => !r.airborne);
    expect(landed).toBeGreaterThan(contact);
    // the landing is the next game frame's: within a frame's ticks (two, or three at the frame clock's long frame)
    expect(landed - contact).toBeLessThanOrEqual(3);
    for (let i = contact; i < landed; i++) expect(rows[i]!.y).toBeCloseTo(0, 6);   // the feet held on the floor between
  });

  it('it hands the contact frame\'s fall speed + g FRAME (D:L456496, D:L456515-456516)', () => {
    const { w, rows } = walkOff(40);
    const contact = rows.findIndex((r) => r.y <= 1e-6);
    const atContact = -rows[contact]!.vy;
    expect(atContact).toBeGreaterThan(0);
    expect(w.landing?.speed).toBeCloseTo(atContact + G * FRAME, 6);
  });

  it('off a 26 deck the walk-off now lands hard: 14 frames reach the floor (27.47), the 15th lands at 15 g FRAME = 117.62', () => {
    const { w } = walkOff(26);
    expect(w.landing?.speed).toBeCloseTo(15 * G * FRAME, 6);     // over land_hard_fall_rate 115
    expect(w.landing?.clip).toBe('landHard');
  });

  it('off a 23 deck: 13 frames reach the floor (23.80), the 14th lands at 14 g FRAME = 109.78, no clip', () => {
    const { w } = walkOff(23);
    expect(w.landing?.speed).toBeCloseTo(14 * G * FRAME, 6);
    expect(w.landing?.clip).toBeNull();
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const ZDB = DISC ? join(DISC, 'RUN', 'MP51.ZDB') : '';
const HAVE = !!ZDB && existsSync(ZDB);

/**
 * The sweep's run drops replayed (relay-3's placement, `agent-mail/evidence/later1176-sweep/` README: x 636 on the cap,
 * y = 117.7 - (z - 484) / 56 + 2, facing +x, 1.3 s settle, W held 2 s). The speeds the original handed are the last
 * airborne frame's word + g dt (research 151 s8.4, 8.5): run-z540 172.51 (x 0.9730), run-z510 164.67 (unhurt, under the
 * damage class's 170.70).
 */
describe.skipIf(!HAVE)('LATER 1176 on MP51 Vigilance\'s stair cap (dev disc): the sweep\'s run drops hand the original\'s speeds', () => {
  const drop = (z: number): Walker => {
    const grid = simMapFromBytes(new Uint8Array(readFileSync(ZDB)), 'RUN/MP51.ZDB').grid;
    const w = new Walker(grid);
    w.stance = 'stand';
    expect(w.place(636, 117.7 - (z - 484) / 56 + 2 + probeLiftOf('stand'), z)).toBe(true);
    w.state.yaw = FACE_X;
    for (let i = 0; i < 78; i++) w.tick(STILL);                    // 1.3 s settle
    let landed = false, wasAir = false;
    for (let i = 0; i < 240 && !landed; i++) {
      w.tick(i < 120 ? FORWARD : STILL);
      if (w.airborne) wasAir = true;
      else if (wasAir) landed = true;
    }
    expect(landed).toBe(true);
    return w;
  };
  it('run-z540: 172.51, the first damage class (the original: every part x 0.9730)', () => {
    const w = drop(540);
    expect(w.landing?.speed).toBeCloseTo(172.51, 1);
    expect(w.landing?.cls).toBe(1);
  }, 120_000);
  it('run-z510: 164.67, unhurt (the original: unhurt)', () => {
    const w = drop(510);
    expect(w.landing?.speed).toBeCloseTo(164.67, 1);
    expect(w.landing?.cls).toBe(0);
  }, 120_000);
});
