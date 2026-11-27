// @vitest-environment jsdom
/**
 * SWAP-FIRE (PLAN-2 s4; SWAPFIRE-XBOX-HELD-TRIGGER): the Lightweight (Xbox prototype) page fires a trigger held through
 * the rifle's raise after a grenade, as the standard page does (TRIGGER-SWAP, `../src/matchFirearm` `triggerOwed`,
 * `../src/matchThrow` `heldPulls`; research 211 s10): a press the hands took, still held, is the firearm's once they hand
 * it over, and the round leaves on the first kit step the raise reads 1 (LATER 180, `FireCore.pullRound`; the trigger
 * function `FUN_005c0ae0` D:L476433-476438, its r0004 twin 0x5c77f0 -- no new press).
 *
 * Measured before this fix (PC 4, four rendered browser runs, unreviewed): on the Lightweight page a trigger held from the
 * swap back through the raise never fired (semi and auto, 3/3); a fresh press after the raise fired. The input
 * (`PrototypeCombatInput`) hands the trigger on at its edge only, and the page's router gave a press taken by an item up to
 * the item alone -- nothing handed it to the firearm once the item left the hand.
 *
 * The rig: the prototype's own firearm (`prototypeCombat`), its own input and its own trigger router
 * (`TriggerOwner`), with a grenade's hands stood in (up or not, a press taken, the put-away). One `fireFrame(GAME_FRAME_DT)`
 * is one kit step; the raise's weight is set per frame (0 at the put-away, 1 from frame `RAISED`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGrid, GAME_FRAME_DT, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { Input } from '../src/gamepad';
import { BAKED_LOADOUT } from '../src/loadout';
import { Play } from '../src/play';
import { WalkMode } from '../src/walk';
import { PrototypeCombatInput, TriggerOwner } from '../src/xboxPrototype/combatInput';
import { prototypeCombat } from '../src/xboxPrototype/combatRuntime';
import type { WalkingMap } from '../src/xboxPrototype/runtimeAssets';

const RAISED = 12;                 // the frame after the swap back on which the raise first reads 1

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.restoreAllMocks(); });

const wall = (): Grid => {
  const points = Float32Array.from([-50, 0, -100, 50, 0, -100, 50, 40, -100, -50, 40, -100]);
  const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  return buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: `${poly.path}0`, first: 0, count: 1 }]);
};

const pad = (o: { fire?: boolean; swap1?: boolean } = {}): Input => ({
  fire: !!o.fire, swap1: !!o.swap1, swap2: false, reload: false, zoom: false, zoomOut: false, fireMode: false,
}) as unknown as Input;

function rig(mode: 1 | 3) {
  const fly = new FlyCamera(document.createElement('canvas')), walk = new WalkMode(fly), play = new Play();
  const map = { origin: [0, 0, 0], metersPerUnit: 0.1, camera: { hfov: 0.5, vfov: 0.4, mid: 640 } } as unknown as WalkingMap;
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 20, 0], far: [0, 20, -1000] });
  vi.spyOn(walk, 'grid').mockReturnValue(wall());
  let weight = 1;
  const stats = play.weaponStats.bind(play);
  vi.spyOn(play, 'weaponStats').mockImplementation(() => { const s = stats(); return { ...s, raise: { ...s.raise, weight } }; });
  const combat = prototypeCombat({ map, fly, walk, play, loadout: () => BAKED_LOADOUT, client: () => null,
    enabled: () => true, online: false, event() {} });
  disposers.push(() => { combat.dispose(); fly.dispose(); });
  for (let i = 0; i < 8 && combat.state().mode !== mode; i++) combat.switchFireMode();
  // A grenade's hands (`./walkingGrenades`): the trigger is theirs while the item is up; a shoulder puts it away, and the
  // item's lower lets the firearm go (`core.on('equip')` -> `suspendFirearm`).
  const hands = { up: false, presses: 0 };
  const owner = new TriggerOwner({
    equipped: () => hands.up, firearmWaits: () => false, rocketsLaunched: () => 0, cancelHold() {},
    trigger(on) { if (on) hands.presses++; },
  }, { trigger: on => combat.trigger(on), held: () => combat.fire.triggerHeld(), pulls: () => combat.fire.pulls(), pull: n => combat.fire.pull(n) });
  const input = new PrototypeCombatInput({
    trigger: on => owner.trigger(on, true), reload() {},
    select() { if (hands.up) { hands.up = false; weight = 0; owner.suspendFirearm(); } },
  });
  let rounds = 0;
  combat.fire.subscribe(event => { if (event.type === 'round') rounds++; });
  /** One game frame: the pad's read, the raise's weight, the hand-over, the kit's step. Returns the rounds it fired. */
  const frame = (input_: Input, raise?: number): number => {
    if (raise !== undefined) weight = raise;
    input.frame(input_, true, GAME_FRAME_DT);
    combat.beforeMove();
    owner.handOver(true);
    const before = rounds;
    combat.fireFrame(GAME_FRAME_DT);
    return rounds - before;
  };
  /** Rifle up, the grenade up (the trigger now its). */
  const grenadeUp = () => { for (let i = 0; i < 4; i++) frame(pad()); hands.up = true; weight = 0; frame(pad()); };
  return { combat, frame, grenadeUp, hands, mode: () => combat.state().mode };
}

/** The frame (from the swap back, 0) of each round over `n` frames, R1 held from the swap back's press throughout. */
function heldThroughRaise(mode: 1 | 3, n = 24): number[] {
  const r = rig(mode);
  expect(r.mode()).toBe(mode);
  r.grenadeUp();
  const fired: number[] = [];
  for (let f = 0; f < n; f++) {
    const rounds = r.frame(pad({ fire: true, swap1: f === 0 }), f < RAISED ? Math.min(0.99, f / RAISED) : 1);
    for (let k = 0; k < rounds; k++) fired.push(f);
  }
  expect(r.hands.presses).toBe(1);                       // the press landed with the item up: the hands took it
  return fired;
}

describe('SWAP-FIRE: the Lightweight page fires a trigger held through the raise (TRIGGER-SWAP, as the standard page)', () => {
  it('SEMI: R1 held from the swap back -- one round, on the first frame the raise reads 1, no new press', () => {
    expect(heldThroughRaise(1)).toEqual([RAISED]);
  });

  it('AUTO: R1 held from the swap back -- the first round on the first frame the raise reads 1, then the held stream', () => {
    const fired = heldThroughRaise(3);
    expect(fired[0]).toBe(RAISED);
    expect(fired.length).toBeGreaterThan(1);
  });

  it('control (unchanged): let go through the raise, a fresh press after it fires', () => {
    for (const mode of [1, 3] as const) {
      const r = rig(mode);
      r.grenadeUp();
      const fired: number[] = [];
      for (let f = 0; f < RAISED + 8; f++) {
        const fire = f === 0 || f >= RAISED + 2;            // the swap back's press with R1, let go, pressed again after the raise
        const rounds = r.frame(pad({ fire, swap1: f === 0 }), f < RAISED ? Math.min(0.99, f / RAISED) : 1);
        for (let k = 0; k < rounds; k++) fired.push(f);
      }
      expect(fired.length).toBeGreaterThan(0);
      expect(fired[0]).toBeGreaterThanOrEqual(RAISED + 2);  // nothing from the let-go press; the re-press fires
    }
  });
});
