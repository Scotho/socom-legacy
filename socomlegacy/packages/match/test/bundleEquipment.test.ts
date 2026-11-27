import { describe, expect, it } from 'vitest';
import { AN_M8, arsenalOf, CLAYMORE, DEFAULT_RIFLE, EMPTY_ITEM, HE, HELD_SIDEARM, ITEM, M67, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { MagazineRing } from '../../viewer/src/magazines';
import { KitRounds } from '../../viewer/src/firearms';
import { equipmentSlotsOf, type EquipmentSlots } from '../../viewer/src/equipment';
import { PICKUP_SPENT_EXEMPT_IDS_READING } from '../../viewer/src/net/pickupRules';
import type { BundleEntryWire, ServerEvent } from '../../viewer/src/net/protocol';
import { AMMO_TRANSFER_PLACEHOLDER, dropsOf, type DroppingBody } from '../src/pickups';
import { WorldDrops, type DropSeat } from '../src/worldDrops';

/**
 * R142 head A (LATER 1088), THE RED: a dead body's bundle carries its EQUIPMENT slots (grenades, charges) with their
 * records, and a taker walking over it gains them -- the player report "picking up grenades off a dead enemy does not
 * work". Today the bundle is the two firearm rings only (`BUNDLE_SLOTS_PLACEHOLDER`, `dropsOf`) and an entry that carries
 * an `item` goes to the residual untouched (`transferAmmo`); this file states what head A must reach, at the level of the
 * pure module (`dropsOf`) and the room's `WorldDrops` (`death`, and `step`'s walk-over) -- not the wire to the page.
 *
 * What is measured, the evidence kinds kept apart:
 * - THE GOLDENS (cases i, ii, iii): a CAPTURE OF THE ORIGINAL, pending review -- the relay-1 rig notes of 2026-11-15 on
 *   THE RUINS, `RELAY1-mp12-RPG-pair-M203-set2-B2-case-i-1244Z` (case i, 12:43Z) and
 *   `RELAY1-mp12-RPG-pair2-B2-ii-iii-B1-1254Z` (the carrier's kit read off his own HUD: M4A1 5 MAGS, MARK 23, M67 3/3,
 *   HE 3/3, 2X AMMO; case ii, 12:51Z; case iii, read from the 12:43Z walk -- the same walk as case i). What the rig did not
 *   read (the exact rounds in each firearm magazine) is synthetic here: the carrier's firearm rings full, the taker's
 *   full, so the firearm pour (already the port's, `PICKUP_AMMO_MATCH_READING`) moves nothing and only the equipment moves.
 *   Two more (cases iv, v), the same kind -- a capture of the original, pending review: the relay-1 rig records
 *   `RELAY1-q29-R145-two-frame-tables-R142-sample1-1537Z` (its last paragraph, "R142 FIRST SAMPLE", 15:35Z: a SPENT hand
 *   grenade slot, a team-mate's body) and `RELAY1-q29b-window-open-R142-sample2-1558Z` ("R142 SECOND SAMPLE", 15:57Z: a
 *   TERRORIST's body). Each asserts only what its record states; what it did not read is synthetic and said so per test.
 * - THE RULES: READING, PENDING REVIEW -- source inspection of the decompilation only, two reads filed on the sprint hub
 *   (`R142-bundle-read-2026-11-15`, `R142-slotcost-read-2026-11-15`; where they differ the slotcost read, the later,
 *   decides) and the slotcost read's fresh review (`R142-slotcost-read-review-2026-11-15`), which wins over both where
 *   it differs: F1 (a slot search past the kit's count answers the COUNT -- the item is appended there) and F4 (a body's
 *   bundle walked over in a networked match takes the ask and grant path: an equipment entry is asked against the
 *   taker's kit as it stands, `FUN_005bb990` D:L473590-473605 -> `FUN_005ba770` D:L472842-473007, refused when its
 *   same-item slot has no room; the owner grants every entry whose item and ammunition match an asked one with a count
 *   above zero, `FUN_0059e830` D:L457886-457933 -> `FUN_0059e580` D:L457845-457846; the taker pours each granted entry,
 *   `FUN_0059dfb0` D:L457694-457800 -> `FUN_005bb000`, and the entry is cleared WHOLE whatever fitted, `FUN_003cfc40`
 *   D:L323024-323047; an entry not granted stays; the bundle goes when no entry is left, `FUN_00541bb0`
 *   D:L409125-409131). Cited per test as `FUN_<addr>` and `D:L<line>` of `socom2_game.elf.decomp.c`; nothing is pasted.
 * - THE KIND OF TEST: unit tests over synthetic bodies; no disc, no browser, no capture replayed. The M67 and HE records
 *   are the port's transcriptions (`@s2u/scene` `M67`, `HE`: `Ammo_Capacity` 3, `NumMags` 1, `M67 Ammo` /
 *   `HE Grenade Ammo`, proven equal to `RUN/ZWEAPON.ZAR` by `scene/test/projectile.test.ts`); the M203 FRAG's
 *   `Ammo_Capacity` 1 x `NumMags` 6 is synthetic (it reads 6/6 on the rig's HUD; its disc split is not read here).
 *
 * THE TYPE GAP the build must close (the one field; this file writes against it with no cast):
 * - `DroppingBody.equipmentSlots?: EquipmentSlots` (`packages/match/src/pickups.ts`) -- the shape `DropSeat` already
 *   carries (`worldDrops.ts`, `equipmentSlots?`), and `WorldDrops.death` passing `victim.equipmentSlots` to `dropsOf`.
 *   `BodyWithEquipment` below is `DroppingBody & { equipmentSlots }`, so it compiles today and the RED is an assertion.
 * - The TAKE needs no new field: `DropSeat` already holds the live `loadout`, `rounds` (`KitRounds`: a launcher round's
 *   ring, how the case-ii spent M203 FRAG slot reads as spent) and `equipmentSlots`. The build changes `WorldDrops.walk`
 *   (today it skips a bundle when `transferAmmo` moved nothing, `!out.moved`) and `transferAmmo`'s equipment branch
 *   (today `entry.item !== undefined` goes to the residual); its signature is the build's to shape -- this file asserts
 *   the seat after the walk (read off the seat each time: the build may replace `loadout`, `rounds`, `equipmentSlots`).
 *
 * UNREAD items are `it.todo`, each naming the `*_PLACEHOLDER` the build files in its research note -- never a guess.
 *
 * EXISTING TESTS that pin today's behaviour and that head A's build will have to change (not touched here):
 * `pickups.test.ts` :173-176 (an `M67 Ammo` entry with `item` stays residual -- head A takes it) and, to re-check,
 * :40-70 (its victim holds an M67 in slot 2 but lends no equipment rings, so it stays green only while the new field is
 * optional); `roomPickups.test.ts` :147-168 (:157, exactly two firearm entries from a Terrorist whose slot 2 is the M67,
 * spawned full -- head A adds `{ ammo: 'M67 Ammo', item: 121, count: 3 }`), with :212-247, :384-436, :506-524 to re-check;
 * `refusalRepro.test.ts` :841-852; the viewer's `takeKit.test.ts`, `matchFirearm.test.ts` :466-493, `netPageRound.test.ts`
 * :397-401 and :439, `drops.test.ts`, `joinState.test.ts` :127, `equipmentSlots.test.ts` :103 (the scope read's list).
 */

type V3 = [number, number, number];
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;

/** A ring of `capacity` with exactly `slots` (the ten slots' rounds) and `current` in the weapon (pickups.test.ts's). */
const ring = (capacity: number, slots: number[], current = 0): MagazineRing => {
  const r = new MagazineRing(capacity, 3);
  r.restore({ slots: [...slots, ...new Array<number>(10 - slots.length).fill(0)], current });
  return r;
};

/** The rig's records: the M4A1 (54) and the M4A1-M203 (61) on 5.56 x 45mm, the Mark 23 (15); the carrier's 2X-applied. */
const M4_203: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M4A1-M203', id: ITEM.M4_203 };
const CARRIER_RIFLE: WeaponRecord = { ...DEFAULT_RIFLE, mags: 6 };          // 2X AMMO: `withDoubleAmmo`, NumMags 3 -> 6
const CARRIER_PISTOL: WeaponRecord = { ...HELD_SIDEARM, mags: 6 };

/** The arsenal rows the kit's tests read (roomPickups.test.ts's shape): the class comes from the id (`itemClass`). */
const row = (name: string, id: number, capacity = 1, mags = 1): unknown[] =>
  ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', [String(capacity)], 'NumMags', [String(mags)], 'AMMO_TYPES', [[]]];
const ARSENAL = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  row('M67', M67.id, 3, 1), row('HE', HE.id, 3, 1), row('M203', ITEM.M203), row('M203 FRAG', ITEM.M203_FRAG, 1, 6),
  row('LAW', ITEM.LAW), row('LAW HEAT', ITEM.LAW_HEAT), row('RPG-7', ITEM.RPG7), row('RPG', ITEM.RPG_ROUND),
  row('Claymore', CLAYMORE.id, 4, 1), row('Double Ammo Load', ITEM.DOUBLE_AMMO, 0, 0), row('Thermal Scope', ITEM.THERMAL, 0, 0),
] as never]);
const TABLE = {
  arsenal: ARSENAL, records: new Map([DEFAULT_RIFLE, M4_203, HELD_SIDEARM].map((r) => [r.id, r])), rounds: new Map(),
  throwables: new Map([[M67.id, { record: M67, piercing: 4 }], [HE.id, { record: HE, piercing: 4 }], [CLAYMORE.id, { record: CLAYMORE, piercing: 0 }]]),
} as unknown as KitTable;

/** A seat as `WorldDrops` reads it (`DropSeat`), its equipment rings always present. */
interface Seat extends DropSeat { equipmentSlots: EquipmentSlots }
function seatOf(id: number, loadout: Loadout, records: readonly [WeaponRecord, WeaponRecord], mags: [MagazineRing, MagazineRing], at: V3, table: KitTable = TABLE): Seat {
  const equipmentSlots = equipmentSlotsOf(loadout, table);
  return {
    id, alive: true, loadout, records, mags, rounds: new KitRounds(table, loadout), grenades: equipmentSlots.totals(), equipmentSlots,
    weapon: 0, mounted: null, cone: { frame: () => undefined, setWeapon: () => undefined },
    sim: { seq: 0, walker: { state: { x: at[0], y: at[1], z: at[2], yaw: 0 }, action: null, heldModels: { rifle: null, pistol: null } } },
  };
}
/** Throws `n` of the equipment in `slot` (`EquipmentSlots.spend`): M67 3/3 less one is the rig's 2/3. */
const spend = (s: Seat, slot: number, n: number): void => {
  const kind = s.equipmentSlots.kind(slot)!;
  for (let i = 0; i < n; i++) expect(s.equipmentSlots.spend(kind, slot), `spend ${kind} at ${slot}`).toBe(slot);
};
/** The seat's equipment as `slot -> "<kind> <rounds>"`, read off the seat now (the build may replace the object). */
const equipment = (s: Seat): Record<number, string> =>
  Object.fromEntries(s.equipmentSlots.state().map((e) => [e.slot, `${e.kind} ${e.rounds.reduce((n, r) => n + r, 0)}`]));
const frag = (s: Seat): number => s.rounds.ring(ITEM.M203_FRAG)?.total() ?? 0;

/** A room's drops with its sinks recorded; the carrier dies at the origin, the taker stands 5 units off (in reach, 20). */
function world(table: KitTable = TABLE) {
  const events: { to: number | null; ev: ServerEvent }[] = [];
  const drops = new WorldDrops(
    { broadcast: (ev) => events.push({ to: null, ev }), send: (id, ev) => events.push({ to: id, ev }), refused: () => undefined, swapRifle: () => undefined },
    { table: () => table, staleTicks: 6 },
  );
  /** The carrier's death, then one tick's walk-over by the taker (`step`, the round live). */
  const dieAndWalk = (carrier: Seat, taker: Seat): void => {
    drops.death(carrier);
    carrier.alive = false;
    drops.step(new Map([[carrier.id, carrier], [taker.id, taker]]), true);
  };
  const bundle = (): BundleEntryWire[] => drops.wire().filter((d) => d.kind === 'ammo').flatMap((d) => d.entries ?? []);
  return { drops, events, dieAndWalk, bundle };
}

const M67_ENTRY = (count: number): BundleEntryWire => ({ ammo: M67.ammo, item: M67.id, count });
const HE_ENTRY = (count: number): BundleEntryWire => ({ ammo: HE.ammo, item: HE.id, count });

/** The rig's carrier (both batches): M4A1, MARK 23, M67 3/3, HE 3/3, 2X AMMO -- his firearm rings full (synthetic). */
const rigCarrier = (): Seat => seatOf(9, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, HE.id, ITEM.DOUBLE_AMMO), [CARRIER_RIFLE, CARRIER_PISTOL],
  [ring(30, [30, 30, 30, 30, 30, 30]), ring(12, [12, 12, 12])], [0, 0, 0]);
/** The rig's firearm entries of that carrier: 180 of 5.56 x 45mm, 36 of 45 ACP (synthetic counts, full rings). */
const RIG_FIREARMS: BundleEntryWire[] = [{ ammo: '5.56 x 45mm', count: 180 }, { ammo: '45 ACP', count: 36 }];
/** The rig's host taker (M4A1-M203, MARK 23 12/12, M203, M203 FRAG, M67 in slots 2-4 by the kit pick's order). */
const rigTaker = (): Seat => seatOf(2, kit(ITEM.M4_203, HELD_SIDEARM.id, ITEM.M203, ITEM.M203_FRAG, M67.id), [M4_203, HELD_SIDEARM],
  [ring(30, [30, 30, 30]), ring(12, [12, 12, 12])], [5, 0, 0]);

describe('R142 head A, the goldens: the rig captures of the original (pending review)', () => {
  it("the carrier's death lays ONE bundle holding an entry for every slot with rounds, his M67 3/3 and HE 3/3 among them, each with its record (item) and its ammunition's name, in slot order; his equipment rings are cleared (FUN_005ba040 D:L472580-472626: a slot with a record, an ammo item at +0x15c, a round, class not 0xb9; the carrier's kit off his HUD, 12:54Z note)", () => {
    const w = world(), carrier = rigCarrier();
    w.drops.death(carrier);
    expect(w.bundle()).toEqual([...RIG_FIREARMS, M67_ENTRY(3), HE_ENTRY(3)]);
    expect(carrier.equipmentSlots.totals()).toEqual({ M67: 0, HE: 0 });
  });

  it('case (i), 12:43Z: a taker holding M67 2/3 walks over the body, no button -- his M67 becomes 3/3 and nothing else of his kit changes; the M67 entry, granted, is cleared whole though only one fitted, the HE (no slot for it) stays (the review F4: FUN_0059dfb0 D:L457694-457800 pours, FUN_003cfc40 clears; a firearm entry\'s remainder is still AMMO_TRANSFER_PLACEHOLDER\'s)', () => {
    expect(AMMO_TRANSFER_PLACEHOLDER).toBe('the remainder stays on the ground');
    const w = world(), carrier = rigCarrier(), taker = rigTaker();
    spend(taker, 4, 1);                                                   // M67 2/3 after one throw
    const before = { loadout: [...taker.loadout], rifle: taker.mags[0].state(), pistol: taker.mags[1].state() };
    expect(equipment(taker)).toEqual({ 4: 'M67 2' });
    expect(frag(taker)).toBe(6);
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)).toEqual({ 4: 'M67 3' });
    expect([...taker.loadout]).toEqual(before.loadout);
    expect(taker.mags[0].state()).toEqual(before.rifle);
    expect(taker.mags[1].state()).toEqual(before.pistol);
    expect(frag(taker)).toBe(6);                                           // M203 6/6 unchanged
    // Not the capture (the rig read the taker's HUD, not the bundle): the M67 entry granted and cleared whole (F4).
    expect(w.bundle()).toEqual([...RIG_FIREARMS, HE_ENTRY(3)]);
  });

  it("case (ii), 12:51Z: a taker whose M203 FRAG slot is SPENT (0/6), M67 full 3/3 -- the HE 3/3 is installed as a NEW entry in the spent M203 FRAG's slot; the M67, the Mark 23 and the rifle unchanged; the M67 not taken (its same-id slot is full: FUN_005bb000 D:L473212-473238); the slot found by D:L473239-473285 (spent, item 0xaf not protected), installed by FUN_005bc410 D:L473823-473829, poured by FUN_005ba3d0", () => {
    const w = world(), carrier = rigCarrier(), taker = rigTaker();
    taker.rounds.ring(ITEM.M203_FRAG)!.restore({ slots: [], current: 0 });   // the six M203 FRAG fired
    expect(frag(taker)).toBe(0);
    const rifle = taker.mags[0].state(), pistol = taker.mags[1].state();
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([ITEM.M4_203, HELD_SIDEARM.id, ITEM.M203, HE.id, M67.id]);
    expect(equipment(taker)).toEqual({ 3: 'HE 3', 4: 'M67 3' });
    expect(frag(taker)).toBe(0);                                           // the launcher mode now reads 0/0
    expect(taker.mags[0].state()).toEqual(rifle);
    expect(taker.mags[1].state()).toEqual(pistol);
    expect(w.bundle()).toEqual([...RIG_FIREARMS, M67_ENTRY(3)]);
    // The taker is told his new kit (the `kit` event's loadout; its equipment rings on the wire are head A's page work).
    const kits = w.events.filter((e) => e.to === taker.id && e.ev.type === 'kit').map((e) => e.ev as Extract<ServerEvent, { type: 'kit' }>);
    expect(kits[kits.length - 1]?.loadout).toEqual([ITEM.M4_203, HELD_SIDEARM.id, ITEM.M203, HE.id, M67.id]);
  });

  it('case (iii), the 12:43Z walk: a taker whose equipment slots are all loaded with other items (M203, M203 FRAG 6/6, M67 2/3) gains the M67 (to 3/3) and NOT the HE -- no slot 2-4 is spent-and-unprotected or empty (FUN_005bb000 D:L473239-473285; none: nothing taken, D:L473284, D:L473341)', () => {
    const w = world(), carrier = rigCarrier(), taker = rigTaker();
    spend(taker, 4, 1);
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)).toEqual({ 4: 'M67 3' });
    expect([...taker.loadout]).toEqual([ITEM.M4_203, HELD_SIDEARM.id, ITEM.M203, ITEM.M203_FRAG, M67.id]);
    expect(frag(taker)).toBe(6);
    expect(w.bundle().filter((e) => e.item === HE.id)).toEqual([HE_ENTRY(3)]);
  });

  it("case (iv), 15:35Z (RELAY1-q29-R145-two-frame-tables-R142-sample1-1537Z, 'R142 FIRST SAMPLE'; a capture of the original, pending review): a taker whose AN-M8 slot is SPENT (0/3, three thrown), M67 full 3/3, walks over a team-mate's body carrying M67 3 and HE 3 -- the HE 3/3 now sits in the spent AN-M8's place (kit word 3), no AN-M8 entry left, the M67 unchanged (its same-item slot full: FUN_005bb000 D:L473212-473238; the slot found by D:L473239-473285, the AN-M8 122 not protected; installed by FUN_005bc410 D:L473823-473829)", () => {
    // From the record: the taker's AN-M8 0/3 in kit word 3 and his M67 3/3; the body's "FRAG 3, HE 3" (read as the M67,
    // the hand frag, 3 -- the M203 FRAG is 6 -- and the HE: the rig carrier's kit, `rigCarrier`). Synthetic: the M67's
    // slot (2), slot 4 (EQUIP_NONE; the search stops at slot 3 whatever it holds), the firearms (full, so nothing pours).
    // The body's side (a team-mate) is not expressed: `WorldDrops` has no side, and the take reads none.
    // Not asserted: the posted lines "HE Grenade / Ammo" and "THE BOMB HAS BEEN PICKED UP" -- head A posts no line
    // (`PICKUP_TEXT_PLACEHOLDER`: the page's, viewer `src/pickupLine.ts`); nor the bundle after (the rig read the HUD only).
    const w = world(), carrier = rigCarrier();
    const taker = seatOf(2, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, AN_M8.id, EMPTY_ITEM), [DEFAULT_RIFLE, HELD_SIDEARM],
      [ring(30, [30, 30, 30]), ring(12, [12, 12, 12])], [5, 0, 0]);
    spend(taker, 3, 3);                                                   // AN-M8 0/3 after three thrown
    expect(equipment(taker)).toEqual({ 2: 'M67 3', 3: 'AN-M8 0' });
    w.dieAndWalk(carrier, taker);
    expect(taker.loadout[3]).toBe(HE.id);                                 // kit word 3: the HE in the smoke's place
    expect([...taker.loadout]).not.toContain(AN_M8.id);
    expect(equipment(taker)).toEqual({ 2: 'M67 3', 3: 'HE 3' });           // HE 3/3; M67 unchanged; no AN-M8 entry
  });

  it("case (v), 15:57Z (RELAY1-q29b-window-open-R142-sample2-1558Z, 'R142 SECOND SAMPLE'; a capture of the original, pending review): a taker with M67 2/3 (one thrown) and HE 3/3 walks past a TERRORIST's body 3 s after the kill -- his M67 reads 3/3 (the same-item slot's pour, FUN_005bb000 D:L473212-473238, D:L473351-473352)", () => {
    // The body's side (a Terrorist) cannot be expressed: `WorldDrops` and `takeEquipment` read no side -- the record's
    // point (a Terrorist's body refills a SEAL's grenade as a team-mate's does) is what a side-blind take gives.
    // The round's end (the take ran with "SEALS VICTORIOUS!" up) is `step`'s `live` true: the room passes `inRound()`,
    // which holds through the 'decided' phase (room.ts), not exercised here. Synthetic: the body's kit (an M67 at 3,
    // what a spawned kit holds; the record names only the M67 by the posted "M67 Ammo"), the taker's slot order and
    // firearms. Not asserted: the posted "M67 Ammo" (head A posts no line, `PICKUP_TEXT_PLACEHOLDER`: head B's), and the
    // rest of the taker's kit after the take -- the record says it could not be stepped.
    const w = world(), carrier = carrierOf(M67.id, EMPTY_ITEM, EMPTY_ITEM), taker = takerOf(M67.id, HE.id, EMPTY_ITEM);
    spend(taker, 2, 1);                                                   // M67 2/3 after one thrown
    expect(equipment(taker)).toEqual({ 2: 'M67 2', 3: 'HE 3' });
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)[2]).toBe('M67 3');
  });
});

/** A carrier at the origin with no firearm rounds (the bundle is his equipment alone) and `loadout`'s slots 2-4. */
const carrierOf = (...equip: number[]): Seat => seatOf(9, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, ...equip), [DEFAULT_RIFLE, HELD_SIDEARM],
  [ring(30, []), ring(12, [])], [0, 0, 0]);
/** A taker 5 units off with full firearm rings and `loadout`'s slots 2-4. */
const takerOf = (...equip: number[]): Seat => seatOf(2, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, ...equip), [DEFAULT_RIFLE, HELD_SIDEARM],
  [ring(30, [30, 30, 30]), ring(12, [12, 12, 12])], [5, 0, 0]);

describe('R142 head A, the rules (reading, pending review: R142-bundle-read and R142-slotcost-read, 2026-11-15)', () => {
  it('the builder (FUN_005ba040 D:L472580-472626): every kit slot with a record, an ammo item and a round joins the bundle -- equipment included, each entry carrying its record (item) -- and the MISSILE class 0xb9-0xbd (D:L472623, D:L324243, D:L324347: the LAW HEAT 185 and the RPG round 186 alike) never does; the rings given are cleared (DroppingBody.equipmentSlots, the field the build adds)', () => {
    type BodyWithEquipment = DroppingBody & { equipmentSlots: EquipmentSlots };
    const feet: V3 = [0, 0, 0];
    const loadout = kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, ITEM.LAW, ITEM.LAW_HEAT);
    const slots = equipmentSlotsOf(loadout, TABLE);
    const lawHeat = { ring: (id: number) => (id === ITEM.LAW_HEAT || id === ITEM.RPG_ROUND ? { total: () => 1 } : null) };
    const body: BodyWithEquipment = {
      id: 9, loadout, records: [DEFAULT_RIFLE, HELD_SIDEARM], mags: [ring(30, [30, 12]), ring(12, [5])], rounds: lawHeat, feet, yaw: 0,
      table: TABLE, equipmentSlots: slots,
    };
    const ammo = dropsOf(body).filter((d) => d.kind === 'ammo');
    expect(ammo).toHaveLength(1);
    expect(ammo[0]!.entries).toEqual([{ ammo: '5.56 x 45mm', count: 42 }, { ammo: '45 ACP', count: 5 }, M67_ENTRY(3)]);
    expect(ammo[0]!.entries!.some((e) => e.item === ITEM.LAW_HEAT || e.item === ITEM.RPG_ROUND)).toBe(false);
    expect(slots.totals()).toEqual({ M67: 0 });
    // The RPG-7 and its round (0xba): the same class exclusion.
    const rpgLoadout = kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, HE.id, ITEM.RPG7, ITEM.RPG_ROUND);
    const rpg: BodyWithEquipment = { ...body, loadout: rpgLoadout, mags: [ring(30, []), ring(12, [])], equipmentSlots: equipmentSlotsOf(rpgLoadout, TABLE) };
    expect(dropsOf(rpg).filter((d) => d.kind === 'ammo').flatMap((d) => d.entries ?? [])).toEqual([HE_ENTRY(3)]);
    // A spent equipment slot adds no entry (a round in the ring, D:L472610-472622).
    const spentLoadout = kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, HE.id, EMPTY_ITEM);
    const spentSlots = equipmentSlotsOf(spentLoadout, TABLE);
    for (let i = 0; i < 3; i++) spentSlots.spend('M67', 2);
    const spentBody: BodyWithEquipment = { ...body, loadout: spentLoadout, mags: [ring(30, []), ring(12, [])], rounds: null, equipmentSlots: spentSlots };
    expect(dropsOf(spentBody).filter((d) => d.kind === 'ammo').flatMap((d) => d.entries ?? [])).toEqual([HE_ENTRY(3)]);
  });

  it("R4P-223: the death stash never takes C4 -- r0004's FillAmmoPickupInstance FUN_005c07c0 D4:L514110-514157 clears every ring entry of an item 0x97 (151) before the sum and the positive-entry test, so the stash add is never called for it (r0001 FUN_005ba040 D:L472580-472631 sums and adds it); the claymore (153) keeps its path; both rings are cleared (reading, pending review)", () => {
    type BodyWithEquipment = DroppingBody & { equipmentSlots: EquipmentSlots };
    // Synthetic: the C4's record (an ammo item, Ammo_Capacity 2) and the counts; the claymore is the port's transcription.
    const c4 = { ...CLAYMORE, name: 'C4', id: ITEM.C4, capacity: 2, mags: 1, ammo: 'C4 Ammo' };
    const throwables = new Map((TABLE as unknown as { throwables: Map<number, unknown> }).throwables);
    throwables.set(ITEM.C4, { record: c4, piercing: 0 });
    const table = { ...TABLE, throwables } as unknown as KitTable;
    const bodyOf = (loadout: Loadout, rounds: Record<number, number>): BodyWithEquipment => {
      const equipmentSlots = equipmentSlotsOf(loadout, table);
      const s = equipmentSlots.state();
      for (const e of s) e.rounds = [rounds[e.slot] ?? 0, ...new Array<number>(9).fill(0)];
      expect(equipmentSlots.restore(s)).toBe(true);
      return {
        id: 9, loadout, records: [DEFAULT_RIFLE, HELD_SIDEARM], mags: [ring(30, []), ring(12, [])], rounds: null, feet: [0, 0, 0], yaw: 0,
        table, equipmentSlots,
      };
    };
    const mixed = bodyOf(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, ITEM.C4, CLAYMORE.id, EMPTY_ITEM), { 2: 2, 3: 1 });
    const ammo = dropsOf(mixed).filter((d) => d.kind === 'ammo');
    expect(ammo).toHaveLength(1);
    expect(ammo[0]!.entries).toEqual([{ ammo: CLAYMORE.ammo, item: CLAYMORE.id, count: 1 }]);
    expect(mixed.equipmentSlots.state().map((e) => e.rounds.reduce((n, r) => n + r, 0))).toEqual([0, 0]);
    // C4 alone: no bundle, its ring cleared all the same.
    const alone = bodyOf(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, ITEM.C4, EMPTY_ITEM, EMPTY_ITEM), { 2: 2 });
    expect(dropsOf(alone).filter((d) => d.kind === 'ammo')).toEqual([]);
    expect(alone.equipmentSlots.totals()).toEqual({ C4: 0 });
  });

  it('a same-item slot gets the pour, the first one holding a round preferred; with none holding a round the LAST same-item slot (FUN_005bb000 D:L473212-473238; the pour D:L473351-473352)', () => {
    // Two M67 slots, slot 2 spent (0/3) and slot 3 part-spent (1/3): slot 3 takes 2, slot 2 stays empty; the entry,
    // granted, is cleared whole -- the 1 that did not fit is lost (F4: FUN_003cfc40 D:L323024-323047).
    const w = world(), carrier = carrierOf(M67.id, EMPTY_ITEM, EMPTY_ITEM), taker = takerOf(M67.id, M67.id, ITEM.THERMAL);
    spend(taker, 2, 3); spend(taker, 3, 2);
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)).toEqual({ 2: 'M67 0', 3: 'M67 3' });
    expect(w.bundle()).toEqual([]);
    // Both spent: the last same-item slot (3) is kept and takes the three.
    const w2 = world(), c2 = carrierOf(M67.id, EMPTY_ITEM, EMPTY_ITEM), t2 = takerOf(M67.id, M67.id, ITEM.THERMAL);
    spend(t2, 2, 3); spend(t2, 3, 3);
    w2.dieAndWalk(c2, t2);
    expect(equipment(t2)).toEqual({ 2: 'M67 0', 3: 'M67 3' });
    expect(w2.bundle()).toEqual([]);
  });

  it('a FULL same-item slot takes nothing and no new slot is used for that item -- the whole count stays (D:L473212-473238: "no new slot ... even when the same-id slot is full") -- while an item he carries none of is installed in a free slot', () => {
    const w = world(), carrier = carrierOf(M67.id, HE.id, EMPTY_ITEM), taker = takerOf(M67.id, ITEM.THERMAL, EMPTY_ITEM);
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, ITEM.THERMAL, HE.id]);
    expect(equipment(taker)).toEqual({ 2: 'M67 3', 4: 'HE 3' });
    expect(w.bundle()).toEqual([M67_ENTRY(3)]);
  });

  it('no same-item slot: the item is installed in the FIRST of slots 2-4 that is spent and not protected, or holds EQUIP_NONE (FUN_005bb000 D:L473239-473285; the install FUN_005bc410 D:L473823-473829, the pour FUN_005ba3d0) -- a spent M67 slot takes the HE before a later empty slot', () => {
    const w = world(), carrier = carrierOf(HE.id, EMPTY_ITEM, EMPTY_ITEM), taker = takerOf(M67.id, EMPTY_ITEM, EMPTY_ITEM);
    spend(taker, 2, 3);
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, HE.id, EMPTY_ITEM, EMPTY_ITEM]);
    expect(equipment(taker)).toEqual({ 2: 'HE 3' });
    expect(w.bundle()).toEqual([]);
    // Spent protected items (the M203 0x8d, the 2X 0xc2) are passed over; EQUIP_NONE (0xff) is re-admitted (D:L473278-473279).
    const w2 = world(), c2 = carrierOf(HE.id, EMPTY_ITEM, EMPTY_ITEM), t2 = takerOf(ITEM.M203, ITEM.DOUBLE_AMMO, EMPTY_ITEM);
    w2.dieAndWalk(c2, t2);
    expect([...t2.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, ITEM.M203, ITEM.DOUBLE_AMMO, HE.id]);
    expect(equipment(t2)).toEqual({ 4: 'HE 3' });
  });

  it("the protected ids are the ten of PICKUP_SPENT_EXEMPT_IDS_READING (inline at D:L473266-473269 and D:L473316-473319; the same ten as FUN_005bae60's): a spent slot holding any of them is never overwritten, so with no other slot nothing is taken -- EQUIP_NONE alone re-admitted by the third test (D:L473278); the same-item M67 is poured all the same", () => {
    expect(PICKUP_SPENT_EXEMPT_IDS_READING).toHaveLength(10);
    for (const id of PICKUP_SPENT_EXEMPT_IDS_READING) {
      const w = world(), carrier = carrierOf(M67.id, HE.id, EMPTY_ITEM), taker = takerOf(id, id, M67.id);
      spend(taker, 4, 2);                                                 // M67 1/3
      w.dieAndWalk(carrier, taker);
      const name = `protected ${id}`;
      // The M67 entry, granted, is cleared whole though only two of its three fitted (F4).
      if (id === EMPTY_ITEM) {
        expect([...taker.loadout], name).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, HE.id, EMPTY_ITEM, M67.id]);
        expect(equipment(taker), name).toEqual({ 2: 'HE 3', 4: 'M67 3' });
        expect(w.bundle(), name).toEqual([]);
      } else {
        expect([...taker.loadout], name).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, id, id, M67.id]);
        expect(equipment(taker), name).toEqual({ 4: 'M67 3' });
        expect(w.bundle(), name).toEqual([HE_ENTRY(3)]);
      }
    }
  });

  it("the cap is the item's own NumMags x Ammo_Capacity (FUN_005ba3d0 D:L472718-472773: +0x2c, +0x28), never doubled for a grenade even with the 2X in the kit (the doubling only for classes 0x04, 0x1f, 0x33, 0x51, 0x5b, 0x65, D:L472725-472741) -- two M67 entries give a spent M67 slot 3, not 6", () => {
    expect(M67.mags * M67.capacity).toBe(3);
    const w = world(), carrier = carrierOf(M67.id, M67.id, EMPTY_ITEM), taker = takerOf(M67.id, ITEM.DOUBLE_AMMO, ITEM.THERMAL);
    spend(taker, 2, 3);
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)).toEqual({ 2: 'M67 3' });
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, ITEM.DOUBLE_AMMO, ITEM.THERMAL]);
    // Both entries were asked against the kit as it stood (the spent slot had room: FUN_005bb990 asks each entry in its
    // loop, D:L473590-473605, before any pour) and both granted (FUN_0059e580 D:L457845-457846: item and ammunition
    // match, count above zero); the second poured nothing into the now-full slot and is cleared whole all the same (F4).
    expect(w.bundle()).toEqual([]);
  });

  it("the review F1: a slot search that runs past the kit's count answers the COUNT (FUN_005bae60 D:L473106-473107; inlined D:L473244-473245) -- in a kit of three slots the item is appended at slot 3 (FUN_005bc410 D:L473823-473829 raises the count to slot + 1)", () => {
    const w = world(), carrier = carrierOf(HE.id, EMPTY_ITEM, EMPTY_ITEM);
    const taker = seatOf(2, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id), [DEFAULT_RIFLE, HELD_SIDEARM], [ring(30, [30, 30, 30]), ring(12, [12, 12, 12])], [5, 0, 0]);
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, HE.id]);
    expect(equipment(taker)).toEqual({ 2: 'M67 3', 3: 'HE 3' });
    expect(w.bundle()).toEqual([]);
  });

  it("R4P-219 (PICKUP_EQUIPMENT_POUR_READING): the ask's room test skips the slot's magazine in the hand when the record's own NumMags is 2 or more, as the pour does -- r0004's ask FUN_005c0e40 D4:L514401-514403 (r0001's FUN_005ba5b0 D:L472779-472837 counts it) and pour FUN_005c0c20 D4:L514322-514323, no class test; a taker whose same-item ring's only room is the loaded magazine is not asked, not granted, and the entry stays whole", () => {
    // Synthetic: no baked throwable or charge has NumMags 2, so the AN-M8's record is given Ammo_Capacity 1 x NumMags 2 here.
    const two = { ...AN_M8, capacity: 1, mags: 2 };
    const throwables = new Map((TABLE as unknown as { throwables: Map<number, unknown> }).throwables);
    throwables.set(AN_M8.id, { record: two, piercing: 0 });
    const table = { ...TABLE, throwables } as unknown as KitTable;
    const w = world(table);
    const carrier = seatOf(9, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, AN_M8.id), [DEFAULT_RIFLE, HELD_SIDEARM], [ring(30, []), ring(12, [])], [0, 0, 0], table);
    const taker = seatOf(2, kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, AN_M8.id), [DEFAULT_RIFLE, HELD_SIDEARM], [ring(30, [30, 30, 30]), ring(12, [12, 12, 12])], [5, 0, 0], table);
    const s = taker.equipmentSlots.state(); s[0]!.rounds[0] = 0; s[0]!.rounds[1] = 1; s[0]!.current = 0;
    expect(taker.equipmentSlots.restore(s)).toBe(true);
    w.dieAndWalk(carrier, taker);
    expect(taker.equipmentSlots.state()[0]!.rounds.slice(0, 2)).toEqual([0, 1]);
    expect(w.bundle()).toEqual([{ ammo: AN_M8.ammo, item: AN_M8.id, count: 2 }]);
  });

  // UNREAD -- each becomes a named placeholder in head A's research note; nothing is asserted for them here.
  it.todo('PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER: a SlotCost 2 entry (the Satchel, arsenal `slotCost`) needs a second slot 2-4 (FUN_005bb000 D:L473286-473340, FUN_003c5970 +0x27c) -- whether the second may be the first (D:L473293 against D:L472952) and that the taker writes nothing into it (FUN_005bc410) are unread; settles: 0x5bb338-0x5bb4c8 against 0x5ba9f8-0x5bab88, or a rig take of a Satchel bundle');
  it.todo('PICKUP_EQUIPMENT_SLOT_PLACEHOLDER: after the review F1 (past the count answers the count, tested above), what is left of the strict "count < slot" test (D:L473245, D:L472904): a kit of count 4 whose slot 4 holds neither a spent unprotected record nor 0xff finds no slot (index 5 never tried), and whether the original\'s empty slots hold 0xff records (the port\'s five-slot kit, EMPTY_ITEM in each); and the Detonator\'s kit index (LATER 1129, the review\'s F4): the original appends 0xc1 at the count +0x82c (FUN_005c74e0 D:L480197), which with empty equipment slots can be 3 or 4, and the finder passes over a slot holding 0xc1 (D:L473268) -- the port keeps the Detonator as a flag and would install there; settles: the disassembly at 0x5bb2xx, a rig take by a kit with an empty slot');
  it.todo('AMMO_TRANSFER_PLACEHOLDER, online: a FIREARM entry\'s remainder -- the owner\'s grant (FUN_0059dfb0 D:L457694-457800) clears each granted entry WHOLE (FUN_003cfc40 D:L323024-323047, D:L457701-457702), which the equipment entries above now follow (the review F4); the firearm entries keep the port\'s placeholder (the remainder stays) until the owner\'s ruling it names');
  it.todo("PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER (the build's fresh review, finding 1): a body with dry firearms and three equipment rings, M67, HE and AN-M8, walked over by a taker with a part-spent M67 and one free slot -- all three asked and granted; the original as decompiled tops up the M67, installs the HE in the free slot and LEAVES THE AN-M8 ON THE GROUND: the getter FUN_003cfd70 (D:L323073-323102) and the clearer FUN_003cfc40 (D:L323024-323047) act only when the index is at most the entries with a non-zero count, FUN_0059dfb0 clears in index order (D:L457700-457800) and compacts only after (FUN_00541bb0 D:L409125-409131), so index 2 meets one entry left: nothing poured, not cleared. The port deletes it (every granted entry cleared) until the AMMO_TRANSFER_PLACEHOLDER ruling lets the firearm entries into the list; settles: that ruling, then a rig sample of this case");
  it.todo('BUNDLE_SLOTS (remaining): which equipment records carry an ammo item at +0x15c (a non-empty AMMO_TYPES) -- a grenade-launcher round (171-183, the port\'s KitRounds) and each charge -- and so join the bundle; settles: a dev-disc assertion over ZWEAPON records\' ammoId');
  it.todo('PICKUP_TEXT_PLACEHOLDER (the page, not this module): the line posted on a take ("M67 Ammo", "HE Grenade / Ammo" on the rig) -- the ZAMMO key at ammo +4 and the +0xc0 virtual +0x2c gate (D:L473356-473375) are unread');
});

/** The taker's last `kit` (the room's word to his page after a take). */
const lastKit = (w: ReturnType<typeof world>, id: number): Extract<ServerEvent, { type: 'kit' }> | undefined =>
  w.events.filter((e) => e.to === id && e.ev.type === 'kit').map((e) => e.ev as Extract<ServerEvent, { type: 'kit' }>).at(-1);
type KitEquipment = { slot: number; kind: string; rounds: number[]; current: number; added?: number[] };
const kitEquipment = (k: Extract<ServerEvent, { type: 'kit' }> | undefined): KitEquipment[] | undefined =>
  (k as unknown as { equipment?: KitEquipment[] } | undefined)?.equipment;
const kitDetonator = (k: Extract<ServerEvent, { type: 'kit' }> | undefined): boolean | undefined =>
  (k as unknown as { detonator?: boolean } | undefined)?.detonator;
type DetonatorSeat = Seat & { detonator?: boolean };

describe('LATER 1129 (R142 head B, the room half): the page is told, and the Detonator is kept (reading, pending review)', () => {
  it("the case that sank head A: a taker who has thrown all his claymores walks over a body carrying HE -- the HE is installed over the SPENT Claymore slot (FUN_005bb000 D:L473239-473285; the Claymore 0x99 not among the ten kept ids), and his Detonator is KEPT: FUN_005c74e0 (D:L480156-480202) only ADDS 0xc1 to the kit, never removes it, and FUN_005bdc30 (D:L474637-474641) gates 0xc1 on claymores down alone; his `kit` names the installed slot's ring whole and the kept Detonator", () => {
    const w = world(), carrier = carrierOf(HE.id, EMPTY_ITEM, EMPTY_ITEM);
    const taker: DetonatorSeat = takerOf(M67.id, CLAYMORE.id, EMPTY_ITEM);
    taker.detonator = true;                                                // the spawn's kit held a claymore: 0xc1 added
    spend(taker, 3, CLAYMORE.capacity * CLAYMORE.mags);                    // every claymore set down
    expect(equipment(taker), 'harness: M67 full, the Claymore slot spent').toEqual({ 2: 'M67 3', 3: 'Claymore 0' });
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, HE.id, EMPTY_ITEM]);
    expect(equipment(taker)).toEqual({ 2: 'M67 3', 3: 'HE 3' });
    expect(taker.detonator, 'the Detonator kept over the install').toBe(true);
    const k = lastKit(w, taker.id);
    expect(kitDetonator(k)).toBe(true);
    const he = taker.equipmentSlots.state().find((s) => s.slot === 3)!;
    expect(kitEquipment(k)).toEqual([{ slot: 3, kind: 'HE', rounds: he.rounds, current: he.current }]);
  });

  it("a top-up tells only what the pour wrote: the same-item slot's `added` per magazine (as the firearm transfer's `added`), so a throw the page has spent ahead of the room is not given back", () => {
    const w = world(), carrier = carrierOf(M67.id, EMPTY_ITEM, EMPTY_ITEM);
    const taker: DetonatorSeat = takerOf(M67.id, EMPTY_ITEM, EMPTY_ITEM);
    taker.detonator = false;
    spend(taker, 2, 1);
    const before = taker.equipmentSlots.state().find((s) => s.slot === 2)!;
    w.dieAndWalk(carrier, taker);
    expect(equipment(taker)).toEqual({ 2: 'M67 3' });
    const after = taker.equipmentSlots.state().find((s) => s.slot === 2)!;
    const k = lastKit(w, taker.id);
    expect(kitEquipment(k)).toEqual([{ slot: 2, kind: 'M67', rounds: after.rounds, current: after.current, added: after.rounds.map((r, i) => r - before.rounds[i]!) }]);
    expect(kitDetonator(k), 'no Detonator held: the field absent').toBeUndefined();
  });

  it('a Claymore installed from a body gives the Detonator: FUN_005ba3d0 ends in FUN_005c74e0 (D:L472771), which adds 0xc1 when the kit holds 0x99', () => {
    const w = world(), carrier = carrierOf(CLAYMORE.id, EMPTY_ITEM, EMPTY_ITEM);
    const taker: DetonatorSeat = takerOf(M67.id, EMPTY_ITEM, EMPTY_ITEM);
    taker.detonator = false;
    w.dieAndWalk(carrier, taker);
    expect([...taker.loadout]).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, M67.id, CLAYMORE.id, EMPTY_ITEM]);
    expect(taker.detonator).toBe(true);
    expect(kitDetonator(lastKit(w, taker.id))).toBe(true);
  });
});
