import { describe, expect, it } from 'vitest';
import { AMMO_BUNDLE_MODEL_PLACEHOLDER, dropModels, PICKUP_HOLD_PER_CLASS_READING, PICKUP_PROMPT_PICK_PLACEHOLDER, WorldDrops, type DropObject } from '../src/drops';
import { PICKUP_LAUNCHER_READING, PICKUP_REACH_READING, type PickupKitSlot } from '../src/net/pickupRules';
import type { DropWire } from '../src/net/protocol';

/**
 * PF-34 (ruling PF.R54; web research 234 s5): the page's world drops -- each weapon drop's model laid where the room
 * says (`DROP_PLACEMENT_PLACEHOLDER`), a bundle kept but unseen (`AMMO_BUNDLE_MODEL_PLACEHOLDER`), and the weapon the
 * action button's `pickup` context would claim (`prompt`). Headless: the models come through a dep, as `grenade.ts`
 * takes its own; `main.ts` wires the deps (held for the controller's wave 4: research 234 s6).
 */

type V3 = [number, number, number];
interface Placed extends DropObject { item: number; at: V3; removed: boolean }

function rig() {
  const made: Placed[] = [];
  const drops = new WorldDrops({
    model: (item) => {
      const o: Placed = { item, at: [0, 0, 0], removed: false, position: { set: (x, y, z) => { o.at = [x, y, z]; } }, rotation: { y: 0 } };
      made.push(o);
      return o;
    },
    remove: (o) => { (o as Placed).removed = true; },
  });
  return { drops, made };
}

const weapon = (did: number, at: V3, item = 62, yaw = 0.25): DropWire => ({ did, kind: 'weapon', item, at, yaw, from: 3 });

describe('PF-34: the drops on the page (research 234 s5)', () => {
  it("WorldDrops places a weapon drop's model at its point and yaw and removes it by did; a bundle is unseen (AMMO_BUNDLE_MODEL_PLACEHOLDER); a did placed twice replaces (a rejoin's envelope)", () => {
    expect(AMMO_BUNDLE_MODEL_PLACEHOLDER).toBe('unseen');
    const { drops, made } = rig();
    drops.place(weapon(1, [10, 0, -5]));
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ item: 62, at: [10, 0, -5], removed: false });
    expect(made[0]!.rotation.y).toBeCloseTo((0.25 * Math.PI) / 180, 12);   // the wire's yaw is the walker's, in degrees
    // A bundle: kept (its did known) but no model asked for.
    drops.place({ did: 0, kind: 'ammo', entries: [{ item: 62, rounds: [17] }], at: [10, 0, -5], yaw: 0.25, from: 3 });
    expect(made).toHaveLength(1);
    expect(drops.dids()).toEqual([1, 0]);
    // The same did again (a bundle's residual, a rejoin's envelope): the old one replaced, never doubled.
    drops.place(weapon(1, [11, 0, -5]));
    expect(made).toHaveLength(2);
    expect(made[0]!.removed).toBe(true);
    expect(made[1]).toMatchObject({ at: [11, 0, -5], removed: false });
    expect(drops.dids()).toEqual([0, 1]);
    // Removed by did; an unknown did is nothing; the round's reset takes every one.
    drops.remove(1);
    expect(made[1]!.removed).toBe(true);
    expect(drops.dids()).toEqual([0]);
    drops.remove(99);
    drops.place(weapon(2, [0, 0, 0]));
    drops.reset();
    expect(drops.dids()).toEqual([]);
    expect(made.every((m) => m.removed)).toBe(true);
    // No model for the item (not loaded yet): the drop is still known and still offered.
    const bare = new WorldDrops({ model: () => null, remove: () => { throw new Error('nothing to remove'); } });
    bare.place(weapon(5, [0, 0, -10]));
    expect(bare.prompt([0, 0, 0], [0, 0, -1])).toBe(5);
    bare.remove(5);
  });

  it('prompt returns the nearest weapon drop within 20 u in front of the feet and null past it or behind (PICKUP_PROMPT_PICK_PLACEHOLDER)', () => {
    expect(PICKUP_PROMPT_PICK_PLACEHOLDER).toBe('nearest in reach');
    expect(PICKUP_REACH_READING).toBe(20);
    const { drops } = rig();
    const feet: V3 = [0, 0, 0], ahead: V3 = [0, 0, -1];
    expect(drops.prompt(feet, ahead)).toBeNull();
    drops.place(weapon(1, [0, 0, -15]));
    drops.place(weapon(2, [3, 0, -8]));
    drops.place(weapon(3, [0, 0, 8]));                          // behind
    drops.place({ did: 4, kind: 'ammo', entries: [{ item: 62, rounds: [30] }], at: [0, 0, -2], yaw: 0, from: 3 });   // a bundle: walked, not prompted
    expect(drops.prompt(feet, ahead)).toBe(2);                   // the nearest in front
    drops.remove(2);
    expect(drops.prompt(feet, ahead)).toBe(1);
    expect(drops.prompt([0, 0, 5.1], ahead)).toBeNull();         // 20.1 off: past the reach (and 3 is behind)
    expect(drops.prompt([0, 0, 4.9], ahead)).toBe(1);            // 19.9
    expect(drops.prompt(feet, [0, 0, 1])).toBe(3);               // turned round: the one behind is in front
    // From the walker's yaw in degrees: 0 faces -z, 180 faces +z (`Pose.yaw` faces (-sin yaw, -cos yaw)); no feet, none.
    expect(drops.promptAt(feet, 0)).toBe(1);
    expect(drops.promptAt(feet, 180)).toBe(3);
    expect(drops.promptAt(null, 0)).toBeNull();
    // The reach is 3D, from the feet (a drop on a floor below is further).
    drops.reset();
    drops.place(weapon(6, [0, -19, -8]));
    expect(drops.prompt(feet, ahead)).toBeNull();
  });

  it("replaceAll lays a rejoin's envelope as the whole set: a weapon taken while the page was away is no longer drawn nor offered, one still lying is kept once", () => {
    const { drops, made } = rig();
    drops.place(weapon(1, [0, 0, -10]));
    drops.place(weapon(2, [0, 0, -15]));
    drops.replaceAll([weapon(2, [0, 0, -15])]);                  // did 1 was taken meanwhile
    expect(drops.dids()).toEqual([2]);
    expect(made[0]!.removed).toBe(true);
    expect(drops.prompt([0, 0, 0], [0, 0, -1])).toBe(2);
    drops.replaceAll([]);
    expect(drops.dids()).toEqual([]);
    expect(drops.prompt([0, 0, 0], [0, 0, -1])).toBeNull();
  });

  it("dropModels builds a weapon's world model from the kit table's ModelName (a clone of the held model) into the scene, and takes it out again", () => {
    const scene = { added: [] as DropObject[], removed: [] as DropObject[], add(o: DropObject) { this.added.push(o); }, remove(o: DropObject) { this.removed.push(o); } };
    const table = { arsenal: { items: new Map([[62, { model: 'm4Acarbine_sd' }]]) } } as never;
    const asked: string[] = [];
    const deps = dropModels(scene, () => table, (name) => { asked.push(name); return { position: { set: () => undefined }, rotation: { y: 0 } }; });
    const o = deps.model(62)!;
    expect(asked).toEqual(['m4Acarbine_sd']);
    expect(scene.added).toEqual([o]);
    expect(deps.model(99)).toBeNull();                            // no item: no model asked, nothing added
    expect(dropModels(scene, () => null, () => null).model(62)).toBeNull();   // no tables yet
    deps.remove(o);
    expect(scene.removed).toEqual([o]);
  });
});

/**
 * PAR-34 group 7 (research 252 s4; PICKUP_HOLD_PER_CLASS_READING): `FUN_00593da0` runs the weapon prompt's hold down once
 * for its first candidate (D:L452547-452549) and again for its second (D:L452563-452565); `FUN_00541d40` (D:L409206)
 * hands the pistols (a drop's `+0xd` bit 1, `FUN_0059f730` D:L458445 for a corpse's, `FUN_0059ec60` D:L458047 for a replicated node: `FUN_005b8820`'s class 2, ids 4-30) to the second
 * and every other weapon to the first. `holdCandidates` counts the classes the port's pick finds (PICKUP_PROMPT_PICK_PLACEHOLDER).
 */
describe('PAR-34 group 7: the claim hold counted once per candidate class (PICKUP_HOLD_PER_CLASS_READING)', () => {
  it('a rifle and a pistol in reach in front are 2 (a classic death lays both); one of either, or two rifles, 1; behind or past the reach, 0', () => {
    const feet: V3 = [0, 0, 0], ahead: V3 = [0, 0, -1];
    expect(PICKUP_HOLD_PER_CLASS_READING).toBe('once per candidate class');
    const both = rig().drops;
    both.place(weapon(1, [0, 0, -5], 62)); both.place(weapon(2, [1, 0, -4], 4));      // the corpse's rifle and pistol
    expect(both.holdCandidates(feet, ahead)).toBe(2);
    expect(both.holdCandidatesAt(feet, 0)).toBe(2);
    expect(both.holdCandidates(feet, [0, 0, 1])).toBe(0);                             // turned away
    const rifles = rig().drops;
    rifles.place(weapon(1, [0, 0, -5], 62)); rifles.place(weapon(2, [1, 0, -4], 62));
    expect(rifles.holdCandidates(feet, ahead)).toBe(1);
    const pistol = rig().drops;
    pistol.place(weapon(2, [1, 0, -4], 4)); pistol.place(weapon(1, [0, 0, -25], 62));  // the rifle past the reach
    expect(pistol.holdCandidates(feet, ahead)).toBe(1);
    expect(rig().drops.holdCandidatesAt(null, 0)).toBe(0);
  });
});

/**
 * NU-5 L1 (web research 323 R323.5, §1.6, §7 L1; F1 of its review): the page offers a rocket launcher (class 0x91) only
 * when `FUN_005bac30` answers for the page's own kit -- `FUN_005a9c70` / `FUN_005a9f40` pass `FUN_005bac30(kit) == 0` to
 * `FUN_00541d40` (D:L463675, D:L463751), which then refuses a class-0x91 candidate (D:L409249-409253): no prompt and no
 * hold's run-down for it. The kit comes through `WorldDropsDeps.kit` (`launcherOffered`, `../src/net/pickupRules`); a
 * page that lends none is offered no launcher (the room refused every launcher before L1).
 */
describe('NU-5 L1: a rocket launcher offered only to a kit FUN_005bac30 answers for (PICKUP_LAUNCHER_READING)', () => {
  const LAW = 145, RPG7 = 146;
  const slots = (items: number[], rounds: number[]): PickupKitSlot[] => items.map((item, i) => ({ item, rounds: rounds[i] ?? 0 }));
  const FREE = slots([54, 15, 121, 255, 255], [0, 0, 3]);                        // the M4A1, the Mark 23, M67s, two empty slots
  const ONE = slots([54, 15, 121, 126, 255], [0, 0, 3, 3]);                      // one empty slot: the launcher's, none for its round
  const M203 = slots([61, 15, 121, 126, 255], [0, 0, 3, 3]);                     // the M4A1-M203: a launcher-list item
  const CARRIER = slots([54, 15, LAW, 185, 255], [0, 0, 0, 1]);                  // a LAW carried
  const FULL = slots([54, 15, 121, 126, 151], [0, 0, 3, 3, 4]);                 // no slot free or replaceable
  const rigWith = (kit: (() => readonly PickupKitSlot[] | null) | undefined) => new WorldDrops({ model: () => null, remove: () => undefined, ...(kit ? { kit } : {}) });
  const feet: V3 = [0, 0, 0], ahead: V3 = [0, 0, -1];

  it('the LAW and the RPG-7 are prompted to a kit with no launcher and a free slot, not to one carrying an M203 rifle or a LAW, nor to one with no slot, nor without the kit; a rifle is prompted to all', () => {
    expect(PICKUP_LAUNCHER_READING).toBe('claimable with one round, by a kit carrying no launcher');
    for (const item of [LAW, RPG7]) {
      expect(rigWith(() => FREE).prompt(feet, ahead) ?? 'none').toBe('none');      // nothing laid yet
      const offered = (kit: (() => readonly PickupKitSlot[] | null) | undefined): number | null => {
        const d = rigWith(kit);
        d.place(weapon(7, [0, 0, -5], item));
        return d.prompt(feet, ahead);
      };
      expect(offered(() => FREE), `${item} free`).toBe(7);
      expect(offered(() => M203), `${item} M203`).toBeNull();
      expect(offered(() => CARRIER), `${item} carrier`).toBeNull();
      expect(offered(() => FULL), `${item} full`).toBeNull();
      expect(offered(() => ONE), `${item} one slot (PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER)`).toBeNull();
      expect(offered(() => null), `${item} no kit yet`).toBeNull();
      expect(offered(undefined), `${item} no kit dep`).toBeNull();
    }
    // A launcher skipped, the rifle behind it in reach is the one offered; to a free kit the nearer launcher.
    const d = rigWith(() => M203);
    d.place(weapon(1, [0, 0, -3], LAW)); d.place(weapon(2, [0, 0, -9], 62));
    expect(d.prompt(feet, ahead)).toBe(2);
    const e = rigWith(() => FREE);
    e.place(weapon(1, [0, 0, -3], LAW)); e.place(weapon(2, [0, 0, -9], 62));
    expect(e.prompt(feet, ahead)).toBe(1);
  });

  it("holdCandidates counts a launcher in the first class only when it is offered: a lone LAW is 1 to a free kit and 0 to an M203 kit; beside a pistol, 2 and 1", () => {
    const lone = (kit: () => readonly PickupKitSlot[] | null): number => { const d = rigWith(kit); d.place(weapon(1, [0, 0, -5], LAW)); return d.holdCandidates(feet, ahead); };
    expect(lone(() => FREE)).toBe(1);
    expect(lone(() => M203)).toBe(0);
    const pair = (kit: () => readonly PickupKitSlot[] | null): number => { const d = rigWith(kit); d.place(weapon(1, [0, 0, -5], LAW)); d.place(weapon(2, [1, 0, -4], 4)); return d.holdCandidates(feet, ahead); };
    expect(pair(() => FREE)).toBe(2);
    expect(pair(() => M203)).toBe(1);
  });

  it("dropModels hands its kit on to the drops' deps (the page's own kit, as main.ts and matchMount.ts would lend it)", () => {
    const scene = { add: () => undefined, remove: () => undefined };
    expect(dropModels(scene, () => null, () => null).kit).toBeUndefined();
    const kit = (): readonly PickupKitSlot[] => FREE;
    expect(dropModels(scene, () => null, () => null, kit).kit).toBe(kit);
  });

  it("OBF-15 (FUN_0059f730 D:L458419-458432: the dropped weapon is the node taken off the body's mount): the page's OWN weapon drop takes that weapon off its own body (`ownDropped`, by the item); a drop of another's, a bundle, or no hook does nothing", () => {
    const own: number[] = [];
    const drops = new WorldDrops({ model: () => null, remove: () => undefined, ownDropped: (item) => { own.push(item); } });
    drops.place(weapon(1, [0, 0, 0], 62));                       // another seat's
    drops.place(weapon(2, [0, 0, 0], 62), true);                 // the page's own rifle
    drops.place(weapon(3, [0, 0, 0], 15), true);                 // the page's own sidearm
    drops.place({ did: 4, kind: 'ammo', entries: [{ item: 62, rounds: [17] }], at: [0, 0, 0], yaw: 0, from: 3 }, true);
    expect(own).toEqual([62, 15]);
    expect(() => new WorldDrops({ model: () => null, remove: () => undefined }).place(weapon(5, [0, 0, 0]), true)).not.toThrow();
    const scene = { add: () => undefined, remove: () => undefined };
    const hook = (item: number): void => { own.push(item); };
    expect(dropModels(scene, () => null, () => null, undefined, hook).ownDropped).toBe(hook);
  });
});

/**
 * LkPaioX5 part 2 (c) (research 234 §7; `FUN_00541d40` D:L409206-409267): the two candidates are two classes -- a weapon
 * drop whose `+0xd` bit 1 is set (a corpse's pistol, `PICKUP_HOLD_PER_CLASS_READING`'s split, the port's: a pistol) goes
 * to the second (`+0x150`, action 5), every other to the first (`+0x14c`, action 4) -- each the nearest of its class.
 */
describe('LkPaioX5 (c): the first and second candidates', () => {
  it('a rifle and a pistol in reach: the rifle is the first, the pistol the second; each alone, only its own', () => {
    const { drops } = rig();
    const feet: V3 = [0, 0, 0];
    drops.place(weapon(1, [0, 0, -4], 62));      // a rifle
    drops.place(weapon(2, [0, 0, -2], 10));      // a pistol, nearer
    expect(drops.prompt(feet, [0, 0, -1])).toBe(1);
    expect(drops.prompt(feet, [0, 0, -1], 2)).toBe(2);
    expect(drops.promptAt(feet, 0)).toBe(1);
    expect(drops.promptAt(feet, 0, 2)).toBe(2);
    drops.remove(1);
    expect(drops.prompt(feet, [0, 0, -1])).toBeNull();
    expect(drops.prompt(feet, [0, 0, -1], 2)).toBe(2);
    expect(drops.itemOf(2)).toBe(10);
    expect(drops.itemOf(1)).toBeNull();
  });
});
