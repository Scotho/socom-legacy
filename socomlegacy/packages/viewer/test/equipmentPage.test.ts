import { describe, expect, it } from 'vitest';
import {
  buildGrid, CLAYMORE, M67, MATERIAL_WATER, type Grid, type GridParams, type KitRound, type KitTable, type Loadout, type ThrowableRecord, type V3, type WorldPoly,
} from '@s2u/scene';
import { aimPick } from '../src/equipment';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import { RocketLauncher, type RocketSource } from '../src/rocket';
import { KitRounds } from '../src/firearms';
import type { PlaySnapshot } from '../src/walk';

/**
 * The equipment on the page (web sprint 4, M7; spec W4.R5; research 94 §C4-§C5, §C7): the three slots following the
 * loadout -- what each holds, `FUN_005bdc30`'s gate, the kit's own inventory order -- the PMN's arming and trip, C4's
 * plant at a target, the thermal scope and 2X holding nothing in the hand, and the LAW / RPG-7 raised and fired.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);
const floor = (): Grid => {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
};
const run = (u: { update(dt: number): void }, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) u.update(1 / 60); };

const PMN: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, model: 'PMN_mine', icon: 'pmn_mine_icon.tif' };
const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };

function thrower(extra: Partial<GrenadeSource> = {}): { g: GrenadeThrower; events: string[] } {
  const events: string[] = [];
  const grid = floor();
  const g = new GrenadeThrower({ grid: () => grid, snapshot: () => snap(), view: () => 'third', handPoint: () => [102, 62, 192], ...extra });
  g.setRecords([PMN, C4]);
  g.on('equip', (on, item) => events.push(`equip ${on} ${item}`));
  g.on('place', (p) => events.push(`place ${p.item}`));
  g.on('explode', (e) => events.push(`explode ${e.item}`));
  return { g, events };
}

describe('the equipment slots follow the loadout (W4.R5): 3, 4 and 5 in kit order', () => {
  it.each([
    // the three slots' items, which slots take up, what then is in the hand
    ['mp_seal1: M67, HE, 2X -- the 2X slot holds nothing in the hand (FUN_005bdc30: 0xc2)', ['M67', 'HE', 'Double Ammo Load'], [true, true, false], ['M67', 'HE', 'HE']],
    ['a sniper\'s: M67, claymore, thermal scope (0xc3 refused)', ['M67', 'Claymore', 'Thermal Scope'], [true, true, false], ['M67', 'Claymore', 'Claymore']],
    ['a BREACH SEAL\'s: M67, AN-M8, C4 -- C4 is the Action button\'s (0x97 refused)', ['M67', 'AN-M8', 'C4'], [true, true, false], ['M67', 'AN-M8', 'AN-M8']],
    ['a Terrorist\'s: M67, AN-M8, PMN', ['M67', 'AN-M8', 'PMN Mine'], [true, true, true], ['M67', 'AN-M8', 'PMN Mine']],
  ] as const)('%s', (_what, slots, taken, held) => {
    const { g } = thrower();
    g.setKit([...slots]);
    for (let i = 0; i < 3; i++) {
      expect(g.selectEquipment((i + 1) as 1 | 2 | 3), `slot ${i + 1}`).toBe(taken[i]);
      expect(g.held()).toBe(held[i]);
    }
  });

  it('the pouch is the loadout\'s: each slot its record\'s count, the items the kit does not hold at none', () => {
    const { g } = thrower();
    g.setKit(['M67', 'M67', 'PMN Mine']);
    expect(g.stats().leftByItem).toMatchObject({ M67: 6, 'PMN Mine': 4, HE: 0, Claymore: 0 });
    expect(g.select('HE')).toBe(false);
    expect(g.select('Claymore')).toBe(false);
  });

  it('R2 steps through the kit\'s own items in kit order, the Detonator only with a claymore in the kit and one down', () => {
    const { g } = thrower();
    g.setKit(['HE', 'Claymore', 'Double Ammo Load']);
    expect(g.cycleInventory()).toBe('HE');
    expect(g.cycleInventory()).toBe('Claymore');
    expect(g.cycleInventory()).toBe('rifle');                     // no charge down: no Detonator; 2X never taken up
    g.setKit(['M67', 'PMN Mine', 'HE']);
    g.select('PMN Mine');
    g.pull();
    run(g, 3);
    // The PMN set down (a placed charge at rest) -- PAR-96 (research 256 §8): `stats().placed` counts the SEAL's own claymores
    // (`claymoresDown`, FUN_003cc1f0's +0xc5 mark, D:L474101), so it stays 0 with only a PMN down. (Was: `placed` 1, the
    // count of every charge down; checkpoint 27's gate.)
    expect(g.stats().live.filter((l) => l.facing !== undefined && l.state === 'rest')).toHaveLength(1);
    expect(g.stats().placed).toBe(0);
    expect(g.held()).toBe('PMN Mine');                            // no Detonator after a PMN (FUN_005c8a20(0xc1) is 0x99's)
    expect(g.select('Detonator')).toBe(false);                    // the kit has no claymore: FUN_005c74e0 adds none
  });
});

describe('the PMN on the page (research 94 §C5.3)', () => {
  it('placed as the claymore; armed after Timer1 8 s; then an actor inside 10 u sets it off, its owner too', () => {
    let actors: V3[] = [];
    const { g, events } = thrower({ actors: () => actors });
    g.setKit(['M67', 'AN-M8', 'PMN Mine']);
    g.select('PMN Mine');
    g.pull();
    run(g, 1.4);
    expect(events).toContain('place PMN Mine');
    const at = g.stats().live[0]!.pos;
    actors = [[at[0] + 5, at[1], at[2]]];
    run(g, 7.8);                                                    // Timer1 runs from the charge down (1.3 s in)
    expect(events.filter((e) => e.startsWith('explode'))).toEqual([]);   // unarmed: the actor on it does nothing
    run(g, 0.3);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode PMN Mine']);
  });

  it('with no one near once armed it waits', () => {
    const { g, events } = thrower({ actors: () => [[500, 50, 500]] });
    g.setKit(['M67', 'AN-M8', 'PMN Mine']);
    g.select('PMN Mine');
    g.pull();
    run(g, 20);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual([]);
  });
});

describe('the others\' charges on the page (the room\'s `grenade` events)', () => {
  it('a claymore set down by another stays at rest facing its way, and goes off at his Detonator\'s fire within 500 u', () => {
    const { g, events } = thrower();
    g.launchRemote('Claymore', [300, 50.1, 200], [1, 0, 0]);
    run(g, 5);
    expect(g.stats().live[0]).toMatchObject({ state: 'rest', pos: [300, 50.1, 200] });
    expect(g.stats().placed).toBe(0);                               // not the page's own
    expect(g.detonateCharges()).toBe(0);                            // nor its Detonator's
    g.launchRemote('Detonator', [1000, 50, 200], [0, 0, 0]);        // 700 u off: out of reach
    run(g, 0.2);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual([]);
    g.launchRemote('Detonator', [350, 50, 200], [0, 0, 0]);
    run(g, 0.2);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode Claymore']);
  });
  // Ported from Chris's browser-beta-v5 (d578f347, his grenade.test.ts 'peer charge' case and `detonateRemote`): the
  // Detonator sets off its owner's claymores only (`CZKit_DetonateRemoteExplosives` 0x5c0130: the charge's `+0xac`, the
  // actor's id), as the room does (`room.ts` `detonate`, by the player); the wire's `grenade` names the owner (`id`).
  it('another player\'s Detonator sets off his own claymores only, never a third player\'s in the same reach', () => {
    const { g, events } = thrower();
    g.launchRemote('Claymore', [300, 50.1, 200], [1, 0, 0], 1);
    g.launchRemote('Claymore', [310, 50.1, 200], [1, 0, 0], 2);
    run(g, 1);
    g.launchRemote('Detonator', [350, 50, 200], [0, 0, 0], 1);
    run(g, 0.2);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode Claymore']);
    expect(g.stats().live.filter((l) => l.state === 'rest').map((l) => l.pos[0])).toEqual([310]);   // player 2's is still down
    g.launchRemote('Detonator', [350, 50, 200], [0, 0, 0], 2);
    run(g, 0.2);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode Claymore', 'explode Claymore']);
  });
});

describe('C4 on the page (research 94 §C5.1): the Action button at a C4 target, settled', () => {
  /**
   * SUP-03: the target is the scene destructible under the reticle (`c4Target`: `./equipment` `aimPick`, `c4TargetOf`) -- a
   * synthetic access barrier, a wall across x 130 (z 150..250) on the floor, its block taking C4's 18 -- not a type-less
   * action's node (`C4_TARGET_READING` retired). PF-13: held there 0.2 s (`C4Settle`, `c4PlantAllowed`); `material` the
   * wall's byte (7 STONE; 3 INVISIBLE_DI).
   */
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  let wall: WorldPoly | null = null;
  const barrierGrid = (material = 7): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    wall = { ...f, path: DI, ditype: 2, material, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };
  const health = { c4TargetAt: (path: string, damage: number): number | null => (path === DI && damage >= 17 ? 0 : null) };
  /** The view east along the ground from the feet's eye: the reticle on the barrier when within reach. */
  const planter = (over: () => Partial<PlaySnapshot>, extra: Partial<GrenadeSource> = {}, material = 7) => {
    const grid = barrierGrid(material);
    const t = thrower({
      grid: () => grid, snapshot: () => snap(over()),
      aim: () => { const f = snap(over()).feet; return { eye: [f[0], f[1] + 12, f[2]], far: [f[0] + 300, f[1] + 12, f[2]] }; },
      ...extra,
    });
    t.g.setWorld(() => ({ health: { ...health, blastAt: () => [] } }));
    return t;
  };

  it('C4 Action restores the exact prior duplicate slot while an ordinary throw retains its own slot (research 361 §2)', () => {
    const { g } = planter(() => ({}));
    g.setKit(['M67', 'M67', 'C4']);
    g.selectEquipment(2);
    expect(g.heldSlot()).toBe(3);
    expect(g.throwNow(1)?.slot).toBe(3);
    run(g, 2);
    expect(g.stats()).toMatchObject({ slot: 3, left: 2, held: 'M67' });
    expect(g.plantC4()).toBe(true);
    run(g, 3);
    expect(g.stats()).toMatchObject({ slot: 3, left: 2, held: 'M67' });
    expect(g.magazineOf(2)?.rounds).toBe(3);
    expect(g.stats().leftByItem.C4).toBe(3);
  });

  it('is refused away from a target, planted at one, and goes off at its Timer1 (6 s)', () => {
    let feet: V3 = [600, 50, 600];
    const { g, events } = planter(() => ({ feet }), { handPoint: () => [feet[0] + 2, feet[1] + 12, feet[2] - 8] });
    const placed: { target?: number; surface?: { path: string; point: V3 }; eye?: V3 }[] = [];
    g.on('place', (p) => placed.push({ target: p.target, surface: p.surface, eye: p.eye }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    run(g, 0.3);
    expect(g.c4Target()).toBeNull();
    expect(g.plantC4()).toBe(false);
    feet = [100, 50, 200];
    run(g, 0.25);                                                   // the settle: 0.2 s on the barrier (C4_AIM_SETTLE_S)
    expect(g.c4Target()).toBe(0);
    expect(g.plantC4()).toBe(true);
    run(g, 1.05);
    expect(events).not.toContain('place C4');                       // C4_PLANT_SECONDS: 1.098 s (seal_put_onwall)
    run(g, 0.1);
    expect(events).toContain('place C4');
    // The wire's `throw` names the struck node and its point (PF.R18: the room checks them), and (LATER 305) the eye the
    // pick's aim ray left at the settle -- the feet then, 12 up.
    expect(placed).toEqual([{ target: 0, surface: { path: DI, point: [130, 62, 200] }, eye: [100, 62, 200] }]);
    expect(g.stats().leftByItem.C4).toBe(3);
    run(g, 5.75);                                                   // 5.8 s from the charge down
    expect(g.equipped()).toBe(false);                               // back to the firearm (FUN_005c4b10 to the last slot)
    expect(events.filter((e) => e.startsWith('explode'))).toEqual([]);
    run(g, 0.3);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode C4']);
  });

  it("C4 needs the reticle on the same plantable target for 0.2 s: a new target restarts the timer, a target that moved too; the SEAL's own speed is not tested; no C4 in the kit refuses", () => {
    let feet: V3 = [100, 50, 200], vx = 0;
    const { g } = planter(() => ({ feet, vx }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    run(g, 0.1);
    expect(g.c4Target()).toBeNull();                                // 0.1 s on it: not settled
    expect(g.plantC4()).toBe(false);
    run(g, 0.12);
    expect(g.c4Target()).toBe(0);
    // Off the target (the reticle on the floor's far end) and back: the timer restarts.
    feet = [600, 50, 600];
    run(g, 1 / 60);
    feet = [100, 50, 200];
    run(g, 0.1);
    expect(g.c4Target()).toBeNull();
    run(g, 0.12);
    expect(g.c4Target()).toBe(0);
    // The target moved (a pane on a swinging door): the timer restarts though the reticle stayed on it.
    for (let k = 0; k < wall!.points.length; k += 3) wall!.points[k]! += 0.5;
    run(g, 1 / 60);
    expect(g.c4Target()).toBeNull();
    run(g, 0.22);
    expect(g.c4Target()).toBe(0);
    // The SEAL's own speed is not read (PF.R13; C4_STILL_READING retired): moving, settled on the target, it plants.
    vx = 60;
    expect(g.c4Target()).toBe(0);
    expect(g.plantC4()).toBe(true);
    // No C4 in the kit: refused, however long the reticle holds the target.
    const none = planter(() => ({}));
    none.g.setKit(['M67', 'AN-M8', 'HE']);
    run(none.g, 0.5);
    expect(none.g.c4Target()).toBeNull();
    expect(none.g.plantC4()).toBe(false);
  });

  it('C4 on a surface named exactly INVISIBLE_DI is refused on the page too (005c1970 D:L476975-476977); the pick itself is aimPick', () => {
    const invisible = planter(() => ({}), {}, 3);                   // byte 3: SOILS[1], INVISIBLE_DI
    invisible.g.setKit(['M67', 'AN-M8', 'C4']);
    run(invisible.g, 0.5);
    expect(invisible.g.c4Target()).toBeNull();
    expect(invisible.g.plantC4()).toBe(false);
    const grid = barrierGrid(3);
    expect(aimPick(grid, [100, 62, 200], [400, 62, 200])).toMatchObject({ path: DI, point: [130, 62, 200], material: 'INVISIBLE_DI' });
    expect(aimPick(barrierGrid(), [100, 62, 200], [400, 62, 200])).toMatchObject({ path: DI, material: 'STONE' });
    expect(aimPick(grid, [100, 62, 200], [100, 62, 100])).toBeNull();
  });
});

describe('the LAW (AT-4) and the RPG-7 on the page (research 94 §C4.1-§C4.4, R94.6)', () => {
  const HEAT: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, explosionDamage: 20, explosionRadius: 150, icon: 'firemode_at4.tif' };
  const RPG: ThrowableRecord = { ...HEAT, name: 'RPG', id: 186, muzzleVelocity: 400, icon: 'firemode_rpg.tif' };
  const round = (r: ThrowableRecord): KitRound => ({ record: r, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: r.icon });
  const items = new Map([
    [145, { id: 145, name: 'LAW', cls: 'rocketLauncher', magazine: 1, mags: 1, icon: 'AT4_icon.tif', model: 'AT4' }],
    [146, { id: 146, name: 'RPG LAUNCHER', cls: 'rocketLauncher', magazine: 1, mags: 2, icon: 'RPG_icon.tif', model: 'RPG7' }],
    [185, { id: 185, name: 'LAW HEAT', cls: 'rocketRound', magazine: 1, mags: 1, icon: 'firemode_AT4.tif', model: 'AT4_Heat' }],
    [186, { id: 186, name: 'RPG', cls: 'rocketRound', magazine: 1, mags: 1, icon: 'firemode_RPG.tif', model: 'RPGrenade' }],
  ]);
  const table = { arsenal: { items }, records: new Map(), rounds: new Map([[185, round(HEAT)], [186, round(RPG)]]) } as unknown as KitTable;
  const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;

  function launcher(loadout: Loadout) {
    const events: string[] = [];
    const launches: { from: V3; velocity: V3; round: string }[] = [];
    const backblasts: { pos: V3; dir: V3 }[] = [];
    const grid = floor();
    const src: RocketSource = {
      snapshot: () => snap(), grid: () => grid, aim: () => ({ eye: [100, 65, 200], far: [100, 65, -5000] }), muzzle: () => [102, 64, 195],
    };
    const r = new RocketLauncher(src);
    r.setKit(table, loadout, new KitRounds(table, loadout));
    r.on('equip', (on, id) => events.push(`equip ${on} ${id}`));
    r.on('launch', (e) => launches.push({ from: e.from, velocity: e.velocity, round: e.round.name }));
    r.on('backblast', (b) => backblasts.push(b));
    return { r, events, launches, backblasts };
  }

  // LATER 503 (the network's bookkeeping, as the firearm's `Fire.refundRound`): a rocket the room refuses stale never
  // left the room's kit, so the page gives its round back -- by the launch's journal id (`RocketLaunch.shot`), once.
  it("RED: LATER 503 -- a LAW HEAT the room refuses is given back by its launch's shot, once (RocketLauncher.refund)", () => {
    const { r } = launcher(kit(54, 15, 145, 185, 121));
    const shots: unknown[] = [];
    r.on('launch', (e) => shots.push((e as { shot?: unknown }).shot));
    expect(r.selectSlot(1)).toBe(true);
    run(r, 1.5);
    r.pull();
    expect(r.roundsFor(145)).toBe(0);
    expect(shots[0]).toBeTypeOf('number');                          // today: no shot on the launch
    const R = r as unknown as { refund(shot: number): boolean };
    expect(R.refund(shots[0] as number)).toBe(true);
    expect(r.roundsFor(145)).toBe(1);
    expect(R.refund(shots[0] as number)).toBe(false);               // once
    expect(r.roundsFor(145)).toBe(1);
    expect(R.refund(9999)).toBe(false);                             // an unknown shot: nothing
  });

  // LATER 511 (1), the network's bookkeeping: the room's wait never moved for a refused rocket, so the page's comes back
  // with the round -- when no later launch ran (a later one's wait is its own).
  it("RED: LATER 511 (1) -- a refunded rocket gives its wait back: the next fires at once; not past a later launch", () => {
    const law = launcher(kit(54, 15, 145, 185, 121));
    const shots: number[] = [];
    law.r.on('launch', (e) => shots.push((e as { shot: number }).shot));
    law.r.selectSlot(1); run(law.r, 1.5); law.r.pull();
    expect(law.r.refund(shots[0]!)).toBe(true);
    law.r.pull();
    expect(law.launches, 'fired again at once').toHaveLength(2);       // today: 1, held by the refused rocket's 3 s
    const rpg = launcher(kit(54, 15, 146, 186, 186));
    const rs: number[] = [];
    rpg.r.on('launch', (e) => rs.push((e as { shot: number }).shot));
    rpg.r.selectSlot(1); run(rpg.r, 1.5); rpg.r.pull();
    run(rpg.r, 3.1); rpg.r.pull();
    expect(rpg.launches).toHaveLength(2);
    expect(rpg.r.refund(rs[0]!)).toBe(true);
    expect(rpg.r.stats().wait, "the later launch's wait stands").toBeGreaterThan(0);
  });

  // LATER 511's review F1: the refund gives back only the wait its launch set -- a raise since (lowered, picked again) is
  // the raise's own wait, kept.
  it("RED: LATER 511's review F1 -- a stale arriving during a later raise keeps the raise's wait", () => {
    const rpg = launcher(kit(54, 15, 146, 186, 186));
    const rs: number[] = [];
    rpg.r.on('launch', (e) => rs.push((e as { shot: number }).shot));
    rpg.r.selectSlot(1); run(rpg.r, 1.5); rpg.r.pull();
    expect(rpg.launches).toHaveLength(1);
    rpg.r.lower();
    expect(rpg.r.selectSlot(1)).toBe(true);                         // picked again: the raise's wait
    const raise = rpg.r.stats().wait;
    expect(raise).toBeGreaterThan(0);
    expect(rpg.r.refund(rs[0]!)).toBe(true);
    expect(rpg.r.stats().wait, "the raise's wait kept").toBe(raise);   // today: 0, the launch's pre-launch wait
  });

  it('the LAW: its slot raises it (the round\'s slot is not taken up), fire launches the LAW HEAT straight at 200 u/s, the backblast behind; one shot', () => {
    const { r, events, launches, backblasts } = launcher(kit(54, 15, 145, 185, 121));
    expect(r.selectSlot(2)).toBe(false);                            // slot 2 of the three: the LAW HEAT, a round
    expect(r.selectSlot(1)).toBe(true);
    expect(r.held()).toBe(145);
    expect(r.icon()).toBe('at4_icon.tif');
    expect(r.roundIcon()).toBe('firemode_at4.tif');
    expect(r.count()).toBe(1);
    r.pull();
    expect(launches).toHaveLength(0);                               // mid-raise (launcherRaiseSeconds)
    run(r, 1.5);
    r.pull();
    expect(launches).toHaveLength(1);
    expect(launches[0]!.round).toBe('LAW HEAT');
    expect(launches[0]!.from).toEqual([102, 64, 195]);
    const v = launches[0]!.velocity;
    expect(Math.hypot(...v)).toBeCloseTo(200, 6);                   // ROCKET_LAUNCH_SPEED_READING: the muzzle velocity
    expect(v[2]).toBeLessThan(0);                                   // along the aim (-z), no loft
    expect(backblasts).toHaveLength(1);
    expect(backblasts[0]!.pos).toEqual([102, 64, 195]);
    expect(backblasts[0]!.dir[2]).toBeGreaterThan(0);               // backwards
    expect(r.count()).toBe(0);
    run(r, 4);
    r.pull();
    expect(launches).toHaveLength(1);                               // the LAW HEAT one shot
    expect(events[0]).toBe('equip true 145');
  });

  it('the RPG-7 is fed one round at a time: its FireWait (3 s) apart, a slot a rocket', () => {
    const { r, launches } = launcher(kit(54, 15, 146, 186, 186));
    expect(r.selectSlot(1)).toBe(true);
    expect(r.count()).toBe(2);
    run(r, 1.5);
    r.pull();
    run(r, 2.9);
    r.pull();
    expect(launches).toHaveLength(1);
    run(r, 0.2);
    r.pull();
    expect(launches).toHaveLength(2);
    expect(r.count()).toBe(0);
    expect(Math.hypot(...launches[1]!.velocity)).toBeCloseTo(400, 6);
  });

  it('the slot key cannot bring the launcher up wading deeper than 8.5 (FUN_005857e0 D:L444332-444360; LAUNCHER_BODY_READING): the source\'s own grid and feet, or its depth hook', () => {
    // A pool whose surface stands `depth` over the feet (50): the depth is `wadingDepth(grid, snapshot.feet)` by default.
    const pool = (depth: number): Grid => {
      const q = (y: number, material: number, path: string): WorldPoly => ({
        modelName: 'worldmodel', path, region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
        points: Float32Array.from([-2000, y, -2000, 2000, y, -2000, 2000, y, 2000, -2000, y, 2000]),
      });
      const polys = [q(50, 7, 'worldmodel/f'), q(50 + depth, MATERIAL_WATER, 'worldmodel/pool')];
      const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
      return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}0`, first: i, count: 1 })));
    };
    const law = kit(54, 15, 145, 185, 121);
    const at = (src: Partial<RocketSource>) => {
      const r = new RocketLauncher({ snapshot: () => snap(), grid: () => floor(), aim: () => null, ...src });
      r.setKit(table, law, new KitRounds(table, law));
      return r;
    };
    expect(at({ grid: () => pool(9) }).selectSlot(1)).toBe(false);          // 9 deep: refused
    expect(at({ grid: () => pool(8) }).selectSlot(1)).toBe(true);           // 8 deep: up
    expect(at({}).selectSlot(1)).toBe(true);                                // out of the water
    expect(at({ wadingDepth: () => 9 }).selectSlot(1)).toBe(false);         // the hook, when the page gives one
    expect(at({ grid: () => pool(9), wadingDepth: () => 0 }).selectSlot(1)).toBe(true);
    // Already up, then deeper: it stays up (the take-up's test).
    let depth = 0;
    const r = at({ wadingDepth: () => depth });
    expect(r.selectSlot(1)).toBe(true);
    depth = 9;
    expect(r.selectSlot(1)).toBe(true);
    expect(r.held()).toBe(145);
  });

  it('a launcher with no round is not taken up (FUN_005c45c0), and putting it away raises nothing', () => {
    const { r } = launcher(kit(54, 15, 145, 121, 122));
    expect(r.selectSlot(1)).toBe(false);
    expect(r.held()).toBeNull();
  });
});
