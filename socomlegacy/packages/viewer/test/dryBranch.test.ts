// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGrid, DEFAULT_RIFLE, type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { fireInterval, roundsPerPull } from '../src/accuracy';
import { Fire, RELOAD_DELAY, type FireEvent, type FireGun } from '../src/fire';

/**
 * LATER 179 with LATER 48 (research 94 §C1.1, research 312 §4.1; reading, pending review): the reload at empty. An
 * unmounted firearm of one projectile arms no `ReloadDelay` at its last round (`FUN_005c5340` D:L479287-479300); its empty
 * magazine reloads from the kit frame's dry branch (`FUN_005c0fd0` D:L476573-476633), every frame it is open: the pressed
 * path (the trigger down, the pull's count under `FUN_005c0940`'s limit, D:L476283-476310, D:L476591-476592) and, online,
 * a refill weapon's with no press (`bVar6`, D:L476596-476615) -- the click while the count is under 2 (D:L476617-476620),
 * `FUN_005c2a90` at once (D:L476621-476622), asked again each frame it refuses, the count raised only when none is asked
 * (D:L476630-476631). A shotgun's later pellets keep the arm at the last shell (D:L479296-479320, D:L475604-475624).
 */

type V3 = [number, number, number];
const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
const wallAt = (z: number): WorldPoly => quad([-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** The fire mode's gun (`./accuracy`): single 1, burst 2, automatic 3 -- the pull's limit and wait, straight rays. */
const gunOf = (mode: number): FireGun => ({ trigger: () => {}, roundsPerPull: () => roundsPerPull(mode), interval: (w) => fireInterval(w, mode), round: (d) => d });
const MARK_23: WeaponRecord = { ...DEFAULT_RIFLE, name: 'Mark 23', id: 15, fireWait: 0.2, magazine: 12, mags: 3 };
/** A 12 gauge of four pellets (the 870's `ReloadDelay` 1; R94.10 the pellets): synthetic, no disc. */
const SHOTGUN: WeaponRecord = { ...DEFAULT_RIFLE, name: '870', id: 84, magazine: 7, mags: 3, pellets: 4, reloadDelay: 1 } as WeaponRecord;
const DT = 1 / 60;

function rig(record: WeaponRecord, rings: readonly number[], o: { mode?: number; online?: boolean } = {}) {
  const air = { on: false };
  /** The firearm the item in the hand (`FireSource.inHand`): false while a grenade or the launcher is up. */
  const hand = { on: true };
  const events: FireEvent[] = [];
  const grid = world([wallAt(-600)]);
  const fire = new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0] as V3, far: [0, 20, -1000] as V3 }), airborne: () => air.on, inHand: () => hand.on }, record, undefined, () => 0.5);
  if (o.mode !== undefined) fire.setGun(gunOf(o.mode));
  if (o.online) fire.setNetRefill({ respawn: false });
  fire.takeWeapon(record, rings);
  fire.subscribe((e) => events.push(e));
  const types = (): string[] => events.map((e) => e.type).filter((t) => t !== 'round');
  const frames = (n: number): void => { for (let i = 0; i < n; i++) fire.update(DT); };
  return { fire, events, air, hand, types, frames };
}

describe('LATER 179: the last round of a firearm of one projectile arms no reload (FUN_005c5340 D:L479296-479300)', () => {
  it('a semi-automatic\'s last round leaves 0/N -- no reload, no click, held or let go -- until the next press: the click and the reload at once', () => {
    const r = rig(DEFAULT_RIFLE, [1, 30], { mode: 1 });
    expect(r.fire.pull()).not.toBeNull();                                          // the last round
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    r.frames(10);                                                                  // held: the pull's count 1 is the limit 1
    r.fire.release();
    r.frames(10);
    expect(r.types()).toEqual([]);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, spare: 0, reloading: false });
    expect(r.fire.pull()).toBeNull();                                              // the press: the dry branch's pressed path
    expect(r.types()).toEqual(['dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 30, reloading: true });
  });

  it('R still reloads it over ReloadDelay (FUN_00594cf0 D:L453459-453463, unchanged)', () => {
    const r = rig(DEFAULT_RIFLE, [1, 30], { mode: 1 });
    r.fire.pull(); r.fire.release(); r.frames(5);
    expect(r.fire.reload()).toBe(true);
    expect(r.types()).toEqual(['reloadPress']);
    r.fire.update(RELOAD_DELAY + 0.001);
    expect(r.types()).toEqual(['reloadPress', 'reloadStart']);
  });

  it('an automatic held through empty reloads on the next frame, at once, with the click only when the emptying round was the pull\'s first (D:L476618)', () => {
    const first = rig(DEFAULT_RIFLE, [1, 30], { mode: 3 });
    first.fire.pull();                                                             // the pull's first round empties it
    first.frames(1);                                                               // the press's own frame: its round, no dry branch
    expect(first.types()).toEqual([]);
    first.frames(1);
    expect(first.types()).toEqual(['dry', 'reloadStart']);
    const third = rig(DEFAULT_RIFLE, [3, 30], { mode: 3 });
    third.fire.pull();
    let k = 0;
    while (third.fire.state().magazine.rounds > 0 && k++ < 200) third.frames(1);   // the third round leaves on some frame
    expect(third.types()).toEqual([]);                                             // not on the emptying round's own frame
    third.frames(1);
    expect(third.types()).toEqual(['reloadStart']);                                // the count 3: no click; no reloadPress (no timer)
  });

  it('a burst emptied on its third round is a semi: the count is the limit, nothing until the next press (FUN_005c0940 3)', () => {
    const r = rig(DEFAULT_RIFLE, [3, 30], { mode: 2 });
    r.fire.pull();
    r.frames(60);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    expect(r.types()).toEqual([]);
    r.fire.release(); r.frames(1);
    r.fire.pull();
    expect(r.types()).toEqual(['dry', 'reloadStart']);
  });

  it('a dry trigger held in the air: the click each frame while the reload is refused (the count under 2), the reload on the landing frame', () => {
    const r = rig(DEFAULT_RIFLE, [0, 30], { mode: 1 });
    r.air.on = true;
    expect(r.fire.pull()).toBeNull();
    r.frames(3);                                                                   // the press's frame ran it once; two more frames
    expect(r.types()).toEqual(['dry', 'dry', 'dry']);
    r.air.on = false;
    r.frames(1);
    expect(r.types()).toEqual(['dry', 'dry', 'dry', 'dry', 'reloadStart']);
    r.frames(5);
    expect(r.types().length).toBe(5);
  });

  it('the trigger let go in the air: nothing on landing, offline -- the next press reloads', () => {
    const r = rig(DEFAULT_RIFLE, [0, 30], { mode: 1 });
    r.air.on = true;
    r.fire.pull(); r.fire.release();
    r.air.on = false;
    r.frames(10);
    expect(r.types()).toEqual(['dry']);
    r.fire.pull();
    expect(r.types()).toEqual(['dry', 'dry', 'reloadStart']);
  });

  it('nothing to reload: one click a press, held or not (FUN_005c0940 1, the count raised, D:L476290-476292, D:L476630-476631)', () => {
    const r = rig(DEFAULT_RIFLE, [0, 0, 0], { mode: 3 });
    r.fire.pull(); r.frames(10);
    r.fire.release(); r.frames(10);
    r.fire.pull(); r.frames(10);
    expect(r.types()).toEqual(['dry', 'dry']);
  });

  it('the shotgun keeps its arm at the last shell: ReloadDelay, then the reload (its pellets after the first, D:L479296-479320)', () => {
    const r = rig(SHOTGUN, [1, 7], { mode: 1 });
    expect(r.fire.pull()).not.toBeNull();
    expect(r.types()).toEqual(['reloadPress']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: true });
    r.fire.update(0.5);
    expect(r.types()).toEqual(['reloadPress']);
    r.fire.update(0.501);
    expect(r.types()).toEqual(['reloadPress', 'reloadStart']);
  });
});

describe('LATER 48: online, a refill weapon\'s dry branch asks with no press (bVar6, D:L476596-476615)', () => {
  it('the Mark 23 fired dry and let go: the next frame the click and the reload, no press, no reloadPress', () => {
    const r = rig(MARK_23, [1, 12], { mode: 1, online: true });
    r.fire.pull(); r.fire.release();
    r.frames(1);                                                                   // the round's own frame
    expect(r.types()).toEqual([]);
    r.frames(1);
    expect(r.types()).toEqual(['dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12 });
  });

  it('fired dry in the air: the click each frame while refused, the reload (the refill: its last magazine) on the landing frame, the trigger up', () => {
    const r = rig(MARK_23, [1], { mode: 1, online: true });
    r.air.on = true;
    r.fire.pull(); r.fire.release();
    r.frames(3);                                                                   // the round's own frame, then two
    expect(r.types()).toEqual(['dry', 'dry']);
    r.air.on = false;
    r.frames(1);
    expect(r.types()).toEqual(['dry', 'dry', 'dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12, spare: 0 });
  });

  it('offline the same pistol waits for a press (the pressed path only)', () => {
    const r = rig(MARK_23, [1, 12], { mode: 1 });
    r.fire.pull(); r.fire.release();
    r.frames(10);
    expect(r.types()).toEqual([]);
  });
});

/**
 * LATER 179's review (F1): the dry branch reads the item in the hand's slot (`FUN_005c0fd0` D:L476574-476590, the kit's
 * `kit+0xe4[kit+0x824]`), and a grenade's or an explosive's class shuts it (`FUN_003d1e20` D:L324476-324479) -- so a
 * firearm stowed under a throwable is neither clicked nor reloaded (`FireSource.inHand`).
 */
describe('LATER 179\'s review F1: the dry branch is the hand\'s item\'s -- a stowed firearm is not reloaded (D:L476574-476590)', () => {
  it('online, the Mark 23 emptied in the air, a grenade taken up: no click and no refill on landing; the pistol back in the hand, the click and the refill', () => {
    const r = rig(MARK_23, [1, 12], { mode: 1, online: true });
    r.air.on = true;
    r.fire.pull(); r.fire.release();
    r.hand.on = false;                                                             // the grenade up (no airborne gate, no kit swap)
    r.frames(3);
    r.air.on = false;
    r.frames(5);
    expect(r.types()).toEqual([]);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    r.hand.on = true;
    r.frames(1);
    expect(r.types()).toEqual(['dry', 'reloadStart']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 12, reloading: true });
  });

  it('offline, a dry trigger held in the air: the clicks stop while the hand holds another item, and nothing on landing; the rifle back, the click and the reload', () => {
    const r = rig(DEFAULT_RIFLE, [0, 30], { mode: 1 });
    r.air.on = true;
    r.fire.pull();
    r.frames(2);                                                                   // the press's frame, then one more
    expect(r.types()).toEqual(['dry', 'dry']);
    r.hand.on = false;
    r.frames(3);
    r.air.on = false;
    r.frames(3);
    expect(r.types()).toEqual(['dry', 'dry']);
    expect(r.fire.state().magazine).toMatchObject({ rounds: 0, reloading: false });
    r.hand.on = true;
    r.frames(1);
    expect(r.types()).toEqual(['dry', 'dry', 'dry', 'reloadStart']);
  });
});
