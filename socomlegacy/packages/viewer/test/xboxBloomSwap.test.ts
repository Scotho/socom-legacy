// @vitest-environment jsdom
/**
 * SWAP-FIRE (PLAN-2 s4): the Xbox prototype's bloom takes the item in hand, as the main page's does (BLOOM-SWAP,
 * `../src/matchFirearm` `gunFrame`: `accuracy.setItem(itemReticleOf(table, handItem))` before the same frame's
 * `accuracy.update`). The rule is research 321 section 3.4 (proven: seat ac's capture of r0004 on M51, the M4A1 SD with the
 * Mk141, `bloomSwap.test.ts`): the kit's tick `FUN_005c2670` runs on the SELECTED slot's item (D:L477280); a grenade up
 * closes the one kit size at its own TargetConstrict to 0 (D:L477282-477288). Running: 26 -> 24 on the grenade's first frame,
 * 2 a frame to 0 in 13; back on the rifle, 0 -> 2 and +1 a frame.
 *
 * Measured before this fix (keyjob-nadeswap-port-measure, `NADESWAP SHAPE xbox run_hold=26 nade_first=26 nade_rate=0
 * frames_to_0=never`): `prototypeCombat`'s `poseFrame` ticked the firearm's reticle while a grenade was up.
 *
 * One `poseFrame(TICK)` here is one 30 Hz game frame (`Accuracy.update` -> `tick(TICK)`), so the frame counts are the
 * capture's, as `bloomSwap.test.ts` counts them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_ITEM, readKitTable, type Loadout } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { TICK } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import { Play } from '../src/play';
import { WalkMode } from '../src/walk';
import { prototypeCombat } from '../src/xboxPrototype/combatRuntime';
import type { WalkingMap } from '../src/xboxPrototype/runtimeAssets';

const zweapon = fixture('RUN/ZWEAPON.ZAR');
const table = zweapon ? readKitTable(zweapon) : null;
const MK141 = 123;                 // the capture's grenade (research 321 s3.4)
const RIFLE_ID = 62;               // the capture's M4A1 SD (as matchFirearm.test.ts "BLOOM-SWAP" spawns it)
const RUN_SPEED = 65;              // units a second, past the SD's standing TargetMax 26 (bloomSwap.test.ts RUN)
const LOADOUT: Loadout = [RIFLE_ID, 15, MK141, 126, EMPTY_ITEM];

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.restoreAllMocks(); });

function rig() {
  let speed = 0, item: number | null = null;
  const fly = new FlyCamera(document.createElement('canvas')), walk = new WalkMode(fly), play = new Play();
  const map = { origin: [0, 0, 0], metersPerUnit: 0.1, camera: { hfov: 0.5, vfov: 0.4, mid: 640 },
    arsenal: { table } } as unknown as WalkingMap;
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  vi.spyOn(walk, 'snapshot').mockImplementation(() => ({ stance: 'stand', vx: 0, vy: 0, vz: speed, airborne: false }) as ReturnType<WalkMode['snapshot']>);
  const combat = prototypeCombat({ map, fly, walk, play, loadout: () => LOADOUT, client: () => null, enabled: () => true,
    online: false, event() {}, handItem: () => item });
  disposers.push(() => { combat.dispose(); fly.dispose(); });
  const size = (): number => combat.accuracy.state().size;
  /** One game frame: the run's speed and the hand's item, then the prototype's pose frame (its bloom's tick). */
  const frame = (o: { moving: boolean; nade: boolean }): number => {
    speed = o.moving ? RUN_SPEED : 0; item = o.nade ? MK141 : null;
    combat.poseFrame(TICK);
    return size();
  };
  return { combat, frame, size };
}

describe.skipIf(table === null)(`SWAP-FIRE: the Xbox prototype's bloom runs the item in hand (FUN_005c2670 D:L477280)${table ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("r0004's proven shape, running throughout: rifle 26, the Mk141 24 then 2 a frame to 0 in 13, the rifle back 2 then +1", () => {
    const { combat, frame } = rig();
    expect(combat.selected().record.id).toBe(RIFLE_ID);
    expect(combat.selected().record.stances.stand.targetMax).toBe(26);
    let s = 0;
    for (let f = 0; f < 60; f++) s = frame({ moving: true, nade: false });
    expect(s).toBe(26);                                                  // run_hold 26
    const first = frame({ moving: true, nade: true });
    expect(first).toBeCloseTo(24, 1);                                    // nade_first: the capture's 24.00
    const second = frame({ moving: true, nade: true });
    expect(first - second).toBeCloseTo(2, 1);                            // nade_rate: 2.00 a frame
    let n = 2;
    while (s = frame({ moving: true, nade: true }), n++, s > 0 && n < 20) { /* to 0 */ }
    expect(s).toBe(0);
    expect(n).toBe(13);                                                  // frames_to_0: 13
    for (let i = 0; i < 5; i++) expect(frame({ moving: true, nade: true })).toBe(0);   // the floor is 0
    expect(frame({ moving: true, nade: false })).toBe(2);                // return_first: 0 lifted to 1, +1
    expect(frame({ moving: true, nade: false })).toBe(3);                // return_rate: +1 a frame
  });

  it('the players\' nade swap: run, grenade up, stop, rifle back -- the rifle returns at its minimum, sooner than the control', () => {
    const swap = rig();
    for (let f = 0; f < 60; f++) swap.frame({ moving: true, nade: false });
    swap.frame({ moving: true, nade: true });                            // grenade up running
    for (let f = 0; f < 12; f++) swap.frame({ moving: false, nade: true });   // stopped, grenade up: closes to 0
    expect(swap.size()).toBe(0);
    const min = swap.combat.selected().record.stances.stand.targetMin;
    expect(swap.frame({ moving: false, nade: false })).toBe(min);       // rifle back still: lifted to its TargetMin
    vi.restoreAllMocks();
    const control = rig();
    for (let f = 0; f < 60; f++) control.frame({ moving: true, nade: false });
    for (let f = 0; f < 14; f++) control.frame({ moving: false, nade: false });
    expect(control.size()).toBeGreaterThan(min);                         // 15 frames to 1 stopped (bloomSwap.test.ts control)
  });
});
