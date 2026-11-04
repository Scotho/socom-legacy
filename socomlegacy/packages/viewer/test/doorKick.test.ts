import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT, NODE_CALLER, type EffectProgram } from '@s2u/scene';
import * as doors from '../src/doors';
import { DoorSet, DOOR_CLIPS, openDoorClip, type DoorSpec } from '../src/doors';

/**
 * LATER 362 (research 92 section 6, "Read 2026-10-27"): a door whose record holds two animations is kicked down instead
 * of opened when the action button's chased pressure is at least 0.5 at its release -- `FUN_005ec4e0` (D:L500521-500567)
 * answers 1, and `FUN_002b44e0` runs the record's second animation (D:L452017-452018). The kick's program pushes anim
 * type 284 (`Kick open door` -> `seal_kickopendoor`; `KICK_DOOR_TYPE_READING`). The pressure is chased each frame at
 * 3 a second rising, 1.5 falling (`FUN_00594cf0` D:L453194-453203: `DAT_006505e0`, `DAT_006505d8`), compared with
 * `DAT_00650ae8` 0.5 (D:L500537). Synthetic doors: no disc needed.
 */

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const program = (name: string, type: number): EffectProgram => ({
  name, root: 0, flags: 0, nodes: ['NA'],
  sequences: [{
    name: 's0', activation: 1,
    ops: [
      { op: 'aiAnimate', type, prewait: 0, postwait: 0.25, blocking: false, select: 0 },
      { op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true },
    ],
  }],
});
const spec = (programs: EffectProgram[]): DoorSpec => ({
  index: 0, node: 'leaf', path: 'leaf', valve: 'v', range: 10, elevation: -1, local: I, parent: I, owners: [],
  sweep: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, programs,
});
const TWO = spec([program('singleDoor_left', 63), program('kick_door', 284)]);
const ONE = spec([program('singleDoor_left', 63)]);
const TICK = 1 / 60;

/** The anim types the set's programs push, after a use with `pick`. */
function pushed(s: DoorSpec, pick: number, actor: 'self' | 'wire' = 'self'): { types: number[]; actors: string[] } {
  const types: number[] = [], actors: string[] = [];
  const set = new DoorSet([s], null, { animate: (_d, type, who) => { types.push(type); actors.push(String(who)); } });
  (set as unknown as { use(i: number, f: null, a: string, p: number): boolean }).use(0, null, actor, pick);
  for (let k = 0; k < 120 && set.state(0).busy; k++) set.step(TICK);
  return { types, actors };
}

type KickApi = {
  doorPick(spec: DoorSpec, press: number): 0 | 1;
  chaseActionPress(v: number, held: boolean, dt: number): number;
  KICK_PRESS: number;
  KICK_SIDE_PLACEHOLDER: string;
  KICK_DOOR_TYPE_READING: number;
};
const api = doors as unknown as KickApi;

describe('LATER 362: the kick (FUN_005ec4e0 -> FUN_002b44e0, the record\'s second animation)', () => {
  it("RED: the use's pick runs the record's second animation; a door with one runs its first", () => {
    expect(pushed(TWO, 1).types).toEqual([284]);                    // today: [63]
    expect(pushed(TWO, 0).types).toEqual([63]);
    expect(pushed(ONE, 1).types).toEqual([63]);                     // FUN_005ec4e0 answers 0 under two animations (+8 < 2)
  });

  it("RED: the kick's anim type plays seal_kickopendoor, the pistol's pair seal_p_kickopendoor; both are loaded", () => {
    expect(api.KICK_DOOR_TYPE_READING).toBe(284);
    expect(openDoorClip(284, false)).toBe('seal_kickopendoor');    // today: null
    expect(openDoorClip(284, true)).toBe('seal_p_kickopendoor');
    expect(openDoorClip(63, true)).toBe('seal_open_door');          // the open has no pistol type in the set
    expect(DOOR_CLIPS).toEqual(expect.arrayContaining(['seal_open_door', 'seal_kickopendoor', 'seal_p_kickopendoor']));
  });

  it('RED: the pick -- two animations and a chased press of at least 0.5 (DAT_00650ae8); the side allowed meanwhile', () => {
    expect(api.KICK_PRESS).toBe(0.5);
    expect(api.KICK_SIDE_PLACEHOLDER).toBe('allow');
    expect(api.doorPick(TWO, 0.5)).toBe(1);
    expect(api.doorPick(TWO, 0.49)).toBe(0);
    expect(api.doorPick(ONE, 1)).toBe(0);
  });

  it("the press chased at 3/s rising and 1.5/s falling (the grenade power's rates), one game frame a step (review F2): 8 frames held then the release's frame kick, 7 do not", () => {
    const held = (n: number): number => { let v = 0; for (let k = 0; k < n; k++) v = api.chaseActionPress(v, true, GAME_FRAME_DT); return api.chaseActionPress(v, false, GAME_FRAME_DT); };
    expect(held(8)).toBeGreaterThanOrEqual(0.5);
    expect(held(7)).toBeLessThan(0.5);
    expect(api.chaseActionPress(0.6, false, TICK)).toBeCloseTo(0.6 * (1 - 1.5 * TICK), 12);
  });

  it("RED: a page following the room's kick (`doorUse` pick 1) runs the second animation off the wire", () => {
    const types: number[] = [];
    const set = new DoorSet([TWO], null, { animate: (_d, type) => types.push(type) });
    (set as unknown as { followPick(i: number, pick: number): void }).followPick(0, 1);   // today: not a function
    set.applyWire([{ valve: 0, phase: 0 }]);
    for (let k = 0; k < 120 && set.state(0).busy; k++) set.step(TICK);
    expect(types).toEqual([284]);
  });

  // P7's review F2 (DOOR_PREDICT_ADAPTATION): two presses of a two-animation door within a round trip -- another's kick
  // (pick 1) taken by the room, this page's open (pick 0) refused. The room's swing is not this page's: its prediction is
  // run back and the room's swing followed with the room's pick (`doorUse`), so the leaf ends where the room's does --
  // a kick and an open turn a leaf different ways (MP83's hq_door1, research 92 section 6). Each program here sets its
  // own rotation, so the two ends differ.
  it("F2: the room's swing of another's press with the other pick is not taken as the page's own -- run back, the room's followed", () => {
    const turned = (name: string, type: number, y: number): EffectProgram => {
      const p = program(name, type);
      return { ...p, sequences: [{ ...p.sequences[0]!, ops: [...p.sequences[0]!.ops, { op: 'rotate', node: NODE_CALLER, ref: 0, flags: 1, xyz: [0, y, 0] }] }] };
    };
    const SWUNG = spec([turned('singleDoor_left', 63, 1), turned('kick_door', 284, -1)]);
    const make = () => {
      let last: number[] = [];
      const set = new DoorSet([SWUNG], null, { moved: (_d, m) => { last = [...m]; } });
      return { set, last: () => last };
    };
    const room = make(), page = make();
    page.set.applyWire([{ valve: 0, phase: 255 }], 10);
    expect(page.set.predict(0, null, 0, 11)).toBe(true);           // this page opens
    expect(room.set.use(0, null, 2, 1)).toBe(true);                 // the room: another's kick first; this page's refused busy
    room.set.step(TICK);
    page.set.followPick(0, 1);                                      // its `doorUse`, then its snapshot
    page.set.applyWire(room.set.wire(), 12);
    for (let k = 0; k < 120; k++) { room.set.step(TICK); page.set.step(TICK); page.set.applyWire(room.set.wire(), 13 + k); }
    expect(page.set.state(0)).toEqual(room.set.state(0));
    expect(page.last()).toEqual(room.last());                       // the leaf at the kick's rotation, as the room's
  });
});
