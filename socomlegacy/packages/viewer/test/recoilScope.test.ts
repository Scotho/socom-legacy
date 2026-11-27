// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import * as bend from '../src/recoilBend';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';

/**
 * R4P-256 SCOPED-RECOIL (research 442 s7, `RECOIL_BEND_VIEW_GATE_READING`; reading, pending review): `CZKit::Recoil`
 * (`FUN_005c3360`; r0004 `FUN_005ca830`) adds the body's recoil value (`FUN_0057d510`, D:L477806-477807) only inside its
 * view gate -- body `+0x200`, the zoom state, below 5 and not 4 (D:L477752-477753; D4:L519757-519758). `CZKit::Fire`
 * (`FUN_005c5340` D:L479399-479406; D4:L521470-521476) keeps the scope up on a pull's first round (kit `+0x818` < 2) and
 * drops the view to 1 on a later one, before Recoil runs: so a scoped pull's first round adds no bend and its second
 * does; binoculars (4) never add. The page's order is the same (`matchFirearm.ts`: the gun's `round` drops the scope,
 * then the round event bends), so each test drives the gun's round and then the round event, and asserts the event's
 * subscriber ran (the muzzle effect is called once per round) before it reads the bend.
 */

afterEach(() => { vi.restoreAllMocks(); });

const ROUND = { type: 'round', weapon: { name: 'M4A1' }, from: [0, 0, 0], to: [0, 0, -10], hit: false } as const;

function rig() {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const hud = new Hud();
  const loadouts = new PlayerLoadout();
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud, loadouts, view: () => null, map: () => null, body: () => null, net: () => null,
    blocked: () => false, refreshFog: () => {},
  });
  const gun = (firearm.fire as unknown as { gun: { trigger(down: boolean): void; round(d: [number, number, number]): unknown } }).gun;
  const emit = (e: unknown): void => { (firearm.fire as unknown as { emit(e: unknown): void }).emit(e); };
  // The round's subscriber's first call: its effect (no view here, so nothing drawn); counted to show the path ran.
  const onRound = vi.spyOn(firearm.effects, 'onRound').mockImplementation(() => {});
  const recoilShot = vi.spyOn(play, 'recoilShot');
  /** One round of the pull, in the page's order: the gun's round (the drop), then the round event (the bend). */
  const fireRound = (): void => { gun.round([0, 0, -1]); emit(ROUND); };
  const pull = (): void => { gun.trigger(true); };
  return { firearm, play, onRound, recoilShot, fireRound, pull };
}

describe('R4P-256: recoilAdds, the view gate of FUN_005c3360 (D:L477752-477753)', () => {
  it('adds below 5 and not at 4: 0 third person, 1-2 first person and thermal, 3 night vision; not 4 binoculars, not 5-12 the scope', () => {
    const recoilAdds = (bend as Record<string, unknown>).recoilAdds as ((z: number) => boolean) | undefined;
    expect(typeof recoilAdds, 'recoilBend.ts exports recoilAdds').toBe('function');
    expect([0, 1, 2, 3].map((z) => recoilAdds!(z))).toEqual([true, true, true, true]);
    expect([4, 5, 6, 7, 12].map((z) => recoilAdds!(z))).toEqual([false, false, false, false, false]);
  });
  it('the reading is named and on (research 442 s7)', () => {
    expect((bend as Record<string, unknown>).RECOIL_BEND_VIEW_GATE_READING).toBe(true);
  });
});

describe('R4P-256: the page bends by the zoom state at the round (FUN_005c5340 D:L479399-479406, then FUN_005c3360)', () => {
  it('a scoped pull at zoom state 5: the first round adds no bend and the scope stays up', () => {
    const r = rig();
    r.firearm.zoom.set(5);
    r.pull();
    r.fireRound();
    expect(r.onRound, 'the round event reached the bend path').toHaveBeenCalledTimes(1);
    expect(r.firearm.zoom.state(), 'the first round keeps the scope (kit+0x818 < 2)').toBe(5);
    expect(r.recoilShot, 'RED before: the first scoped round bent').not.toHaveBeenCalled();
  });

  it('binoculars (zoom state 4): no round of the pull adds a bend, and the view stays 4', () => {
    const r = rig();
    r.firearm.zoom.set(4);
    r.pull();
    r.fireRound();
    r.fireRound();
    expect(r.onRound, 'both round events reached the bend path').toHaveBeenCalledTimes(2);
    expect(r.firearm.zoom.state(), 'Fire drops only a view over 4').toBe(4);
    expect(r.recoilShot, 'RED before: each round bent').not.toHaveBeenCalled();
  });

  it('the second round of the same scoped pull drops to first person and bends as before', () => {
    const r = rig();
    r.firearm.zoom.set(5);
    r.pull();
    r.fireRound();
    expect(r.recoilShot).not.toHaveBeenCalled();
    r.fireRound();
    expect(r.onRound, 'both round events reached the bend path').toHaveBeenCalledTimes(2);
    expect(r.firearm.zoom.state(), 'the second round drops the view to 1').toBe(1);
    expect(r.recoilShot, 'the dropped round bends').toHaveBeenCalledTimes(1);
  });

  it('unscoped first rounds bend as before: first person (1) and night vision (3)', () => {
    for (const z of [1, 3]) {
      const r = rig();
      r.firearm.zoom.set(z);
      r.pull();
      r.fireRound();
      expect(r.onRound, `zoom ${z}: the round event reached the bend path`).toHaveBeenCalledTimes(1);
      expect(r.recoilShot, `zoom ${z}: the first round bends`).toHaveBeenCalledTimes(1);
      r.fireRound();
      expect(r.recoilShot, `zoom ${z}: and the second`).toHaveBeenCalledTimes(2);
      expect(r.firearm.zoom.state()).toBe(z);
    }
  });

  it('a new pull resets: back in the scope, its first round adds no bend again', () => {
    const r = rig();
    r.firearm.zoom.set(5);
    r.pull();
    r.fireRound();
    r.fireRound();                                                  // dropped to 1, bent
    expect(r.recoilShot).toHaveBeenCalledTimes(1);
    r.firearm.zoom.set(5);                                          // the scope up again
    r.pull();                                                       // kit+0x818 from 0
    r.fireRound();
    expect(r.onRound, 'all three round events reached the bend path').toHaveBeenCalledTimes(3);
    expect(r.firearm.zoom.state(), 'the new pull keeps the scope on its first round').toBe(5);
    expect(r.recoilShot, 'RED before: the new pull bent on its first round').toHaveBeenCalledTimes(1);
  });
});
