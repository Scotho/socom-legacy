// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { DoorSet, PHASE_REST, type DoorSpec } from '../src/doors';
import { apply4, mul4 } from '../src/doorMath';
import { simMapFromBytes } from '../src/simMap';
import { GAME_FRAME_DT } from '@s2u/scene';

/**
 * TA-COMBATFX: the doors (socomlegacy/docs/research/92-doors.md), registered in docs/parity/registry/combatfx.json.
 * `test/golden/doors.json` pins the `DOOR` actions Frostfire (MP2) and Desert Glory (MP6) decode to -- `actions.rdr`'s
 * node, valve, range and elevation, the node's matrices on the disc, and the `MZANIM.ZAR` swing they run
 * (`singleDoor_right`) -- and the unit tests run the door's own code (`DoorSet`, the zAnim sequencer) on them with no
 * hull and no game data. The last block re-reads the maps and compares the pin whole (it skips without the fixtures).
 */

const PIN = JSON.parse(readFileSync(new URL('./golden/doors.json', import.meta.url), 'utf8')) as { MP2: DoorSpec[]; MP6: DoorSpec[] };

/** A door set on no hull that records its sounds and its leaf's last move (`inv(W0) W`, row-major). */
function doors(specs: DoorSpec[]) {
  const sounds: string[] = [];
  const delta = new Map<string, Float32Array>();
  const set = new DoorSet(specs, null, { sound: (name) => sounds.push(name), moved: (d, m) => delta.set(d.node, Float32Array.from(m)) });
  return { set, sounds, delta };
}
/** The turn of a pure rotation matrix, degrees. */
const turn = (m: Float32Array | undefined): number => (m ? (Math.acos(Math.min(1, Math.max(-1, (m[0]! + m[5]! + m[10]! - 1) / 2))) * 180) / Math.PI : 0);
/** How far the leaf's far edge moves: a point at the swing's reach from the hinge, before and after. */
function edgeMove(spec: DoorSpec, m: Float32Array): number {
  const hinge = apply4(mul4(spec.local, spec.parent), 0, 0, 0);
  const r = (spec.sweep.maxX - spec.sweep.minX) / 2;
  const p: [number, number, number] = [hinge[0] + r, hinge[1], hinge[2]];
  const q = apply4(m, ...p);
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}
const run = (set: DoorSet, i: number, seconds: number, dt = 1 / 60): void => {
  for (let k = 0; k < Math.round(seconds / dt) && set.state(i).busy; k++) set.step(dt);
};
/**
 * The program's head before the valve (research 92 section 2, corrected 2026-10-23): the `ai::ANIMATE`'s push of `Open
 * door` on the presser at the first whole game frame after the use, and its 0.25 s post-wait counted in game frames (8),
 * before `VALVE`, `SOUND` and the swing -- the ninth game frame, 0.300 s, 19 ticks at 60 Hz. `use` itself runs the
 * timeless head only (the IF, the CALL_SEQUENCE, the MOVE, the pre-wait).
 */
const ANIMATE_TICKS = Math.ceil((9 * GAME_FRAME_DT) * 60 - 1e-9);
const animate = (set: DoorSet): void => { for (let k = 0; k < ANIMATE_TICKS; k++) set.step(1 / 60); };

describe('Frostfire\'s doors (actions.rdr, MZANIM.ZAR singleDoor_right)', () => {
  it('are bdoor_4, wdoor_1 and wdoor_2, each its own valve, range 30, no elevation, swung by singleDoor_right', () => {
    expect(PIN.MP2.map((d) => [d.node, d.valve, d.range, d.elevation, d.programs.map((p) => p.name)])).toEqual([
      ['bdoor_4', 'bdoor_4', 30, -1, ['singleDoor_right']], ['wdoor_1', 'wdoor_1', 30, -1, ['singleDoor_right']], ['wdoor_2', 'wdoor_2', 30, -1, ['singleDoor_right']],
    ]);
  });

  it("the action opens a shut door: the ANIMATE's 0.25 s, then the valve set, .DOOR_WOOD_OPEN, a 100-degree swing in 0.7 s; refused while it runs", () => {
    const { set, sounds, delta } = doors(PIN.MP2);
    expect(set.state(0)).toEqual({ open: false, busy: false, valve: 0 });
    expect(set.use(0)).toBe(true);
    expect(set.valve(0)).toBe(0);                                  // the ANIMATE first: `VALVE` waits its 0.25 s
    expect(sounds).toEqual([]);
    expect(set.use(0)).toBe(false);                                // FUN_002b44e0: refused while its animation runs
    animate(set);
    expect(set.valve(0)).toBe(1);                                  // `VALVE` set 1 before the swing
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    expect(turn(delta.get('bdoor_4'))).toBeCloseTo(0, 3);          // nothing swung yet
    for (let k = 0; k < 21; k++) set.step(1 / 60);                 // 0.35 s: half the turn (a slerp)
    expect(turn(delta.get('bdoor_4'))).toBeCloseTo(50, 0);
    expect(set.wire()[0]).toEqual({ valve: 1, phase: Math.floor((21 / 60 / 0.7) * PHASE_REST) });
    run(set, 0, 1);
    expect(set.state(0)).toEqual({ open: true, busy: false, valve: 1 });
    expect(turn(delta.get('bdoor_4'))).toBeCloseTo(100, 3);
    expect(set.wire()[0]).toEqual({ valve: 1, phase: PHASE_REST });
    // The leaf's far edge, 13.1 units from the hinge, swings 20 units out (the survey's 16-32).
    expect(edgeMove(PIN.MP2[0]!, delta.get('bdoor_4')!)).toBeCloseTo(2 * ((PIN.MP2[0]!.sweep.maxX - PIN.MP2[0]!.sweep.minX) / 2) * Math.sin((50 * Math.PI) / 180), 3);
    // The other doors did not move.
    expect([set.state(1).valve, set.state(2).valve]).toEqual([0, 0]);
  });

  it("the action again shuts it: the ANIMATE's 0.25 s, the valve 0, back to the disc's rotation in 0.7 s, and only then .DOOR_WOOD_CLS", () => {
    const { set, sounds, delta } = doors(PIN.MP2);
    set.use(0);
    run(set, 0, 2);
    expect(set.use(0)).toBe(true);
    expect(set.valve(0)).toBe(1);                                  // the close's ANIMATE first
    animate(set);
    expect(set.valve(0)).toBe(0);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);                   // the close's sound follows its swing
    set.step(0.69);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    run(set, 0, 1);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN', '.DOOR_WOOD_CLS']);
    expect(set.state(0)).toEqual({ open: false, busy: false, valve: 0 });
    expect(turn(delta.get('bdoor_4'))).toBeCloseTo(0, 2);
  });

  // Within a round (ruling PF.R10): the round's start is the one thing that shuts a door (the test below).
  it('nothing shuts a door by itself within a round: open, it stays open', () => {
    const { set } = doors(PIN.MP2);
    set.use(2);
    for (let k = 0; k < 60 * 60; k++) set.step(1 / 60);
    expect(set.state(2)).toEqual({ open: true, busy: false, valve: 1 });
  });

  it("the round's reset shuts every door at once and silently: each valve 0, each leaf at the disc's rotation and at rest, a swing cut off (PF.R10)", () => {
    const { set, sounds, delta } = doors(PIN.MP2);
    set.use(0);
    run(set, 0, 1);                                                // bdoor_4 open
    set.use(2);
    for (let k = 0; k < 21; k++) set.step(1 / 60);                 // wdoor_2 mid-swing
    expect(set.state(2).busy).toBe(true);
    sounds.length = 0;
    set.reset();
    expect([0, 1, 2].map((i) => set.state(i))).toEqual([0, 1, 2].map(() => ({ open: false, busy: false, valve: 0 })));
    expect(set.wire()).toEqual([0, 1, 2].map(() => ({ valve: 0, phase: PHASE_REST })));
    expect(turn(delta.get('bdoor_4'))).toBeCloseTo(0, 3);
    expect(turn(delta.get('wdoor_2'))).toBeCloseTo(0, 3);
    for (let k = 0; k < 120; k++) set.step(1 / 60);
    expect(sounds).toEqual([]);                                    // no swing, no sound
    expect(turn(delta.get('wdoor_2'))).toBeCloseTo(0, 3);
    expect(set.use(0)).toBe(true);                                 // and it opens again from shut
    animate(set);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
  });
});

describe('Desert Glory\'s door', () => {
  it('cdoor1 swings 170 degrees in 1.0 s with the metal door\'s .DOOR_METAL_OPN, and shuts with .DOOR_METAL_CLS', () => {
    const { set, sounds, delta } = doors(PIN.MP6);
    expect(PIN.MP6.map((d) => [d.node, d.range, d.elevation])).toEqual([['cdoor1', 30, -1]]);
    set.use(0);
    run(set, 0, 0.98);
    expect(set.state(0).busy).toBe(true);
    run(set, 0, 1);
    expect(set.state(0)).toEqual({ open: true, busy: false, valve: 1 });
    expect(turn(delta.get('cdoor1'))).toBeCloseTo(170, 3);
    set.use(0);
    run(set, 0, 2);
    expect(sounds).toEqual(['.DOOR_METAL_OPN', '.DOOR_METAL_CLS']);
    expect(turn(delta.get('cdoor1'))).toBeCloseTo(0, 2);
  });
});

// ---- the data-backed half -------------------------------------------------------------------------------------------

const maps = { MP2: fixture('RUN/MP2.ZDB'), MP6: fixture('RUN/MP6.ZDB') };
describe(`the doors' pin against the maps${maps.MP2 && maps.MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  for (const [stem, bytes] of Object.entries(maps)) {
    it.skipIf(!bytes)(`doors.json's ${stem} is ${stem}.ZDB's DOOR actions, re-read through simMapFromBytes`, () => {
      const read = simMapFromBytes(bytes!, `RUN/${stem}.ZDB`).doors ?? [];
      expect(JSON.parse(JSON.stringify(read))).toEqual(PIN[stem as 'MP2' | 'MP6']);
    });
  }
});
