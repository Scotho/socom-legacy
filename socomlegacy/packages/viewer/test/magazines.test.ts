import { describe, expect, it } from 'vitest';
import { buildGrid, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Fire, RELOAD_DELAY, type FireEvent } from '../src/fire';
import { RELOAD_SECONDS_PLACEHOLDER } from '../src/reloadClip';
import { DOUBLE_AMMO_ID, magazinesCarried, MagazineRing, RING_SLOTS } from '../src/magazines';

/**
 * The magazines as SOCOM II keeps them (`./magazines`, research 84 §18): one ring of ten slots a weapon
 * (`m_reloads[slot][10]`), the loaded one's index (`m_currentmag`), a reload taking the next slot round the ring with
 * rounds in it (`FUN_005c2a90`), the ammo box's MAGS the slots with rounds less one (`FUN_00237760` / `FUN_005c49b0`).
 * The owner's report (2026-09-29, the Mark 23): "10/12 -> reload -> 12/12 -> 8/12 -> reload -> 11/12".
 */

const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function wall(): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const polys = [quad([-50, 0, -60, 50, 0, -60, 50, 50, -60, -50, 50, -60])];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
function gun(record: WeaponRecord = HELD_SIDEARM): Fire {
  const grid = wall();
  return new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, record, undefined, () => 0.5);
}
/** `n` rounds, each past the weapon's rate. */
function fireN(fire: Fire, n: number): void {
  for (let i = 0; i < n; i++) { expect(fire.shoot()).not.toBeNull(); fire.update(0.5); }
}
/** `R`, and the reload played out. */
function reload(fire: Fire): boolean {
  const ok = fire.reload();
  fire.update(RELOAD_DELAY + 0.001);
  fire.update(RELOAD_SECONDS_PLACEHOLDER + 0.01);
  return ok;
}
const box = (fire: Fire): string => {
  const m = fire.state().magazine;
  return `${m.rounds}/${m.capacity} ${m.spare}`;
};

describe('the ring (FUN_005ba3d0, FUN_005c1970, FUN_005c2a90, FUN_005c49b0)', () => {
  it('fills NumMags full magazines of the capacity, the rest of the ten empty, the first in the weapon', () => {
    const r = new MagazineRing(12, 3);
    expect(RING_SLOTS).toBe(10);
    expect(r.state()).toEqual({ slots: [12, 12, 12, 0, 0, 0, 0, 0, 0, 0], current: 0 });
    expect(r.rounds()).toBe(12);
    expect(r.shownMags()).toBe(2);
    expect(r.total()).toBe(36);
  });

  it('a reload takes the next magazine round the ring with rounds, whole or part-spent; the one out keeps its rounds', () => {
    const r = new MagazineRing(12, 3);
    r.fire(); r.fire();
    expect(r.reload()).toBe(true);
    expect(r.state()).toEqual({ slots: [10, 12, 12, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    for (let i = 0; i < 4; i++) r.fire();
    expect(r.reload()).toBe(true);
    expect(r.state().current).toBe(2);
    expect(r.rounds()).toBe(12);
    expect(r.reload()).toBe(true);                              // round the ring: the part-spent first one
    expect(r.rounds()).toBe(10);
    expect(r.reload()).toBe(true);
    expect(r.rounds()).toBe(8);
    expect(r.total()).toBe(30);                                 // 36 less the six fired, whatever the order
  });

  it('skips the empty slots; the last magazine finds nothing and stays', () => {
    const r = new MagazineRing(12, 3);
    for (let i = 0; i < 12; i++) r.fire();
    expect(r.reload()).toBe(true);
    for (let i = 0; i < 12; i++) r.fire();
    expect(r.reload()).toBe(true);
    expect(r.state().current).toBe(2);
    expect(r.canReload()).toBe(false);
    expect(r.reload()).toBe(false);
    expect(r.state().current).toBe(2);
    for (let i = 0; i < 12; i++) expect(r.fire()).toBe(true);
    expect(r.fire()).toBe(false);                               // dry
    expect(r.total()).toBe(0);
  });

  it('shows MAGS as the magazines with rounds less one: with the weapon empty, one fewer than the others', () => {
    const r = new MagazineRing(12, 3);
    for (let i = 0; i < 12; i++) r.fire();
    expect(r.rounds()).toBe(0);
    expect(r.shownMags()).toBe(1);                              // two others hold rounds: FUN_005c49b0 2, the box 1
    r.reload();
    expect(r.shownMags()).toBe(1);
  });

  it('the Double Ammo Load doubles NumMags, at most ten (FUN_005ba3d0)', () => {
    expect(DOUBLE_AMMO_ID).toBe(0xc2);
    expect(magazinesCarried(3)).toBe(3);
    expect(magazinesCarried(3, true)).toBe(6);
    expect(magazinesCarried(6, true)).toBe(10);
    expect(new MagazineRing(12, magazinesCarried(3, true)).shownMags()).toBe(5);
  });
});

describe('the owner\'s Mark 23 sequence (2026-09-29): where the 11 comes from', () => {
  it('from a fresh pistol: 10/12, reload 12/12 (the second), 8/12, reload 12/12 (the third) -- no 11', () => {
    const fire = gun(HELD_SIDEARM);
    expect(box(fire)).toBe('12/12 2');
    fireN(fire, 2);
    expect(box(fire)).toBe('10/12 2');
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('12/12 2');                          // the 10 kept in the ring: still three with rounds
    fireN(fire, 4);
    expect(box(fire)).toBe('8/12 2');
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('12/12 2');
    // Full, and R still reloads (FUN_005c2a90 477462-477483: the walk from m_currentmag + 1 is the only gate on the
    // magazines): round the ring to the first, the 10; the full third keeps its 12.
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('10/12 2');
    fireN(fire, 1);
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('8/12 2');                           // on to the second, as it was left
  });

  it('a full magazine reloads when another slot holds rounds; with no other slot holding rounds it does not', () => {
    const ring = new MagazineRing(12, 3);
    expect(ring.full()).toBe(true);
    expect(ring.reload()).toBe(true);
    expect(ring.state()).toEqual({ slots: [12, 12, 12, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    expect(new MagazineRing(12, 1).reload()).toBe(false);
    const fresh = gun(HELD_SIDEARM);
    expect(reload(fresh)).toBe(true);
    expect(box(fresh)).toBe('12/12 2');
    const one = gun({ ...HELD_SIDEARM, mags: 1 });
    expect(reload(one)).toBe(false);
    expect(box(one)).toBe('12/12 0');
  });

  it('one round spent from the first magazine before: the second reload comes round to it -- the 11', () => {
    const fire = gun(HELD_SIDEARM);
    fireN(fire, 1);
    expect(reload(fire)).toBe(true);                            // 11 kept, the second in
    fireN(fire, 2);
    expect(box(fire)).toBe('10/12 2');
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('12/12 2');
    fireN(fire, 4);
    expect(box(fire)).toBe('8/12 2');
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('11/12 2');                          // the owner's 11: the first magazine, as it was left
  });

  it('the same for the rifle: 30 a magazine, three of them', () => {
    const fire = gun(HELD_RIFLE);
    fireN(fire, 1); reload(fire); fireN(fire, 2);
    expect(box(fire)).toBe('28/30 2');
    reload(fire);
    expect(box(fire)).toBe('30/30 2');
    fireN(fire, 4); reload(fire);
    expect(box(fire)).toBe('29/30 2');
  });
});

describe('the counts stay whole (conservation, the box, the swaps)', () => {
  // LATER 179 (research 94 §C1.1): was "the automatic reload ... then the next goes in" -- the last round of a firearm of
  // one projectile asks no reload (`FUN_005c5340` D:L479296-479300); the dry branch's press puts the next in at once.
  it('the reload at empty: dry, the box shows the game\'s MAGS (with rounds, less one), then the dry pull puts the next in', () => {
    const fire = gun(HELD_SIDEARM);
    fireN(fire, 11);
    fire.shoot();
    // The 12th emptied it and asked nothing: rounds 0, the two others with rounds -> "1 MAG" (FUN_00237760).
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 12, spare: 1, reloading: false });
    fire.update(RELOAD_DELAY + 0.001);
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 12, spare: 1, reloading: false });
    expect(fire.pull()).toBeNull();                              // `FUN_005c0fd0` D:L476616-476622: FUN_005c2a90 at once
    fire.release();
    expect(fire.state().magazine).toEqual({ rounds: 12, capacity: 12, spare: 1, reloading: true });
    fire.update(RELOAD_SECONDS_PLACEHOLDER);
    expect(fire.state().magazine).toEqual({ rounds: 12, capacity: 12, spare: 1, reloading: false });
  });

  it('with the pouch empty: no reload, a dry click, the rounds stay at 0 and MAGS hidden (0)', () => {
    const fire = gun(HELD_SIDEARM);
    const events: string[] = [];
    fire.subscribe((e) => events.push(e.type));
    // LATER 179: R crosses each magazine (was: the automatic reload).
    for (let m = 0; m < 3; m++) { for (let i = 0; i < 12; i++) { fire.shoot(); fire.update(0.5); } if (m < 2) expect(reload(fire)).toBe(true); fire.update(3); }
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 12, spare: 0, reloading: false });
    expect(fire.reload()).toBe(false);
    fire.pull();
    expect(events.at(-1)).toBe('dry');
    fire.release();
    fire.update(1);
    expect(fire.state().magazine).toEqual({ rounds: 0, capacity: 12, spare: 0, reloading: false });
  });

  it('a swap mid-reload: the new magazine stays in (taken at the start), each weapon keeps its own ring', () => {
    const fire = gun(HELD_SIDEARM);
    const events: FireEvent[] = [];
    fire.subscribe((e) => events.push(e));
    fireN(fire, 3);
    expect(fire.reload()).toBe(true);
    fire.update(RELOAD_DELAY + 0.001);                          // begun: the second magazine in
    fire.setWeapon(HELD_RIFLE);                                 // cut short
    expect(events.at(-1)).toMatchObject({ type: 'reloadEnd', completed: false });
    expect(box(fire)).toBe('30/30 2');
    fireN(fire, 5);
    fire.setWeapon(HELD_SIDEARM);
    expect(box(fire)).toBe('12/12 2');                          // the 9 kept in the ring, the second in the weapon
    fireN(fire, 12);
    expect(reload(fire)).toBe(true);                            // LATER 179: R at empty (was: the automatic reload)
    expect(box(fire)).toBe('12/12 1');                          // the third, whole
    fireN(fire, 12);
    expect(reload(fire)).toBe(true);
    expect(box(fire)).toBe('9/12 0');                           // round the ring to the first, the 9 it kept
    fire.setWeapon(HELD_RIFLE);
    expect(box(fire)).toBe('25/30 2');
  });

  it('whatever the order, the rounds in the weapon and its magazines only fall, by the rounds fired', () => {
    let seed = 7;
    const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const fire = gun(HELD_SIDEARM);
    let shots = 0;
    const totals = { rifle: 90, pistol: 36 };
    const fired = { rifle: 0, pistol: 0 };
    let on: 'rifle' | 'pistol' = 'pistol';
    fire.subscribe((e) => { if (e.type === 'round') fired[on]++; });
    for (let step = 0; step < 400; step++) {
      const a = rand();
      if (a < 0.6) fire.shoot();
      else if (a < 0.8) fire.reload();
      else if (a < 0.87) { on = on === 'rifle' ? 'pistol' : 'rifle'; fire.setWeapon(on === 'rifle' ? HELD_RIFLE : HELD_SIDEARM); }
      fire.update(rand() * 0.6);
      const m = fire.state().magazine;
      expect(m.rounds).toBeGreaterThanOrEqual(0);
      expect(m.rounds).toBeLessThanOrEqual(m.capacity);
      expect(fire.magazineTotal()).toBe(totals[on] - fired[on]);
      shots++;
    }
    expect(shots).toBe(400);
    expect(fired.rifle + fired.pistol).toBeGreaterThan(20);
  });
});

describe('PF-34: the ring read and rebuilt exactly (research 234 s4)', () => {
  it("MagazineRing.entries lists the non-empty slots' counts in ring order and MagazineRing.from rebuilds exactly those with no fill (RING_SLOTS 10)", () => {
    expect(RING_SLOTS).toBe(10);
    const ring = new MagazineRing(30, 3);
    for (let i = 0; i < 7; i++) ring.fire();                     // 23 in the weapon
    ring.reload();                                               // the second goes in, the first keeps its 23
    for (let i = 0; i < 4; i++) ring.fire();                     // 26 in it
    expect(ring.state()).toEqual({ slots: [23, 26, 30, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    expect(ring.entries()).toEqual([23, 26, 30]);
    // From those entries: exactly them, the first slot in the weapon, nothing filled, nothing rounded.
    const back = MagazineRing.from({ magazine: 30, mags: 3 }, [5, 30]);
    expect(back.state()).toEqual({ slots: [5, 30, 0, 0, 0, 0, 0, 0, 0, 0], current: 0 });
    expect(back.total()).toBe(35);
    expect(back.capacity).toBe(30);
    const empty = MagazineRing.from({ magazine: 12, mags: 3 }, []);
    expect(empty.total()).toBe(0);
    expect(empty.entries()).toEqual([]);
    expect(empty.canReload()).toBe(false);
    // Ten slots at most (the ring's); the ten slots of a `state()` given back keep their places.
    expect(MagazineRing.from({ magazine: 12, mags: 3 }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).entries()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(MagazineRing.from({ magazine: 30, mags: 3 }, ring.state().slots).state().slots).toEqual([23, 26, 30, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('NET-REFILL N1: MagazineRing.refill, FUN_005c2a90\'s network write (research 312 §2.2 item 3, §2.3)', () => {
  it('a part-spent last magazine: capacity in the slot in the weapon (FUN_003d2810 into m_reloads[slot][m_currentmag], D:L477498-477500), the index and the other slots as they were; next() still -1', () => {
    const ring = new MagazineRing(12, 3);
    for (let i = 0; i < 12; i++) ring.fire();
    ring.reload();
    for (let i = 0; i < 12; i++) ring.fire();
    ring.reload();
    for (let i = 0; i < 5; i++) ring.fire();                     // the third in, 7 left; the first two empty
    expect(ring.state()).toEqual({ slots: [0, 0, 7, 0, 0, 0, 0, 0, 0, 0], current: 2 });
    expect(ring.next()).toBe(-1);
    ring.refill();
    expect(ring.state()).toEqual({ slots: [0, 0, 12, 0, 0, 0, 0, 0, 0, 0], current: 2 });
    expect(ring.next()).toBe(-1);
    expect([ring.rounds(), ring.shownMags(), ring.total()]).toEqual([12, 0, 12]);
  });

  it('an empty ring (D:L477525-477527): capacity in the current slot, the rest still empty; a ring with another magazine holding rounds is written the same (the walk decides, not refill)', () => {
    const ring = new MagazineRing(30, 2);
    for (let i = 0; i < 30; i++) ring.fire();
    ring.reload();
    for (let i = 0; i < 30; i++) ring.fire();
    expect(ring.state()).toEqual({ slots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    ring.refill();
    expect(ring.state()).toEqual({ slots: [0, 30, 0, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    expect(ring.next()).toBe(-1);
    const two = new MagazineRing(12, 2);
    two.fire();
    two.refill();
    expect(two.state()).toEqual({ slots: [12, 12, 0, 0, 0, 0, 0, 0, 0, 0], current: 0 });
  });
});
