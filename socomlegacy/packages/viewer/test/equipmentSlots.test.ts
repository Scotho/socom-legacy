import { describe, expect, it } from 'vitest';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';
import { EquipmentSlots, type EquipmentSlotState } from '../src/equipmentSlots';
import { fixture } from '../../archive/test/fixtures';
import { readKitTable } from '@s2u/scene';

const snapshot = (): PlaySnapshot => ({
  feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false,
  stance: 'stand', landing: null, jumps: 0,
} as PlaySnapshot);

function thrower(kit: readonly (string | null)[]) {
  const g = new GrenadeThrower({ grid: () => null, snapshot, view: () => 'third' });
  g.setKit(kit);
  return g;
}

describe('equipment slot ammunition (research 361)', () => {
  it('shows the selected duplicate stack independently while retaining the aggregate pouch total', () => {
    const g = thrower(['M67', 'M67', 'AN-M8']);
    expect(g.selectEquipment(1)).toBe(true);
    expect(g.stats().leftByItem.M67).toBe(6);
    expect(g.stats().left).toBe(3);
    expect(g.throwNow(1)?.item).toBe('M67');
    g.update(2);
    expect(g.stats().left).toBe(2);
    expect(g.selectEquipment(2)).toBe(true);
    expect(g.stats().left).toBe(3);
    expect(g.stats().leftByItem.M67).toBe(5);
  });

  it('keeps an exhausted manual slot selected and refuses its trigger without borrowing from its duplicate', () => {
    const g = thrower(['M67', 'M67', 'M67']);
    expect(g.selectEquipment(2)).toBe(true);
    for (let n = 0; n < 3; n++) expect(g.throwNow(1)?.item).toBe('M67');
    g.update(2);
    expect(g.stats()).toMatchObject({ equipped: true, held: 'M67', phase: 'ready', left: 0 });
    expect(g.stats().leftByItem.M67).toBe(6);
    g.pull();
    expect(g.phase()).toBe('ready');
    expect(g.throwNow(1)).toBeNull();
    expect(g.selectEquipment(1)).toBe(true);
    expect(g.stats().left).toBe(3);
    expect(g.selectEquipment(2)).toBe(true);
    expect(g.stats().left).toBe(0);
  });

  it('switching duplicate slots during the wind-up cancels the hold without spending either stack', () => {
    const g = thrower(['M67', 'M67', null]);
    g.selectEquipment(1); g.pull(); g.update(0.25);
    expect(g.phase()).toBe('holding');
    expect(g.selectEquipment(2)).toBe(true);
    expect(g.heldSlot()).toBe(3);
    expect(g.phase()).toBe('ready');
    expect(g.stats().power).toBe(0);
    expect(g.stats().leftByItem.M67).toBe(6);
  });

  it('refuses a throw before consuming a slot, refunds the exact duplicate, and refills every stack at a spawn', () => {
    const g = thrower(['M67', 'M67', 'HE']);
    g.selectEquipment(2);
    expect(g.throwNow(0.001)).toBeNull();
    expect(g.stats().leftByItem.M67).toBe(6);
    expect(g.throwNow(1)?.slot).toBe(3);
    g.update(2);
    g.selectEquipment(1);
    expect(g.giveBack('M67', 3)).toBe(true);
    expect(g.magazineOf(3)?.rounds).toBe(3);
    expect(g.giveBack('HE', 3)).toBe(false);
    expect(g.giveBack('M67', 3)).toBe(false);
    g.selectEquipment(2); g.throwNow(1); g.update(2);
    g.refill();
    expect(g.stats().equipmentSlots.map(s => s.rounds[0])).toEqual([3, 3, 3]);
    expect(g.equipped()).toBe(false);
  });

  it('restores exact authoritative slot counts and deterministically reconstructs legacy totals without new ammo', () => {
    const g = thrower(['M67', 'M67', 'HE']);
    const slots = g.stats().equipmentSlots;
    slots[0]!.rounds[0] = 0;
    slots[1]!.rounds[0] = 2;
    slots[2]!.rounds[0] = 1;
    g.setLeft({ M67: 2, HE: 1 }, slots);
    g.selectEquipment(1); expect(g.stats().left).toBe(0);
    g.selectEquipment(2); expect(g.stats().left).toBe(2);
    const invalid = structuredClone(slots); invalid[0]!.rounds[0] = 4;
    g.setLeft({ M67: 6, HE: 3 }, invalid);
    expect(g.stats().leftByItem).toMatchObject({ M67: 2, HE: 1 });
    g.setLeft({ M67: 0, HE: 0 }, slots);
    expect(g.stats().leftByItem).toMatchObject({ M67: 2, HE: 1 }); // contradictory aggregate/slot metadata is atomic too
    g.setLeft({ M67: 4 });
    expect(g.stats().equipmentSlots.map(s => s.rounds[0])).toEqual([3, 1, 0]);
    expect(g.stats().leftByItem).toMatchObject({ M67: 4, HE: 0 });
  });

  it('keeps slot counts across a live launcher pickup and can restore its smaller reconnect snapshot', () => {
    const g = thrower(['M67', 'M67', null]);
    g.selectEquipment(1);
    for (let n = 0; n < 3; n++) g.throwNow(1);
    g.update(2);
    g.selectEquipment(2); g.throwNow(1); g.update(2);
    g.takeKit(['LAW', 'M67', 'LAW HEAT']);
    expect(g.stats()).toMatchObject({ slot: 3, left: 2, held: 'M67' });
    expect(g.stats().equipmentSlots).toHaveLength(1);
    expect(g.takeable(1)).toBeNull();
    const resumed = g.stats().equipmentSlots; resumed[0]!.rounds[0] = 1;
    g.setLeft({ M67: 1 }, resumed);
    expect(g.stats().left).toBe(1);
  });
});

describe('shared equipment slot rings', () => {
  const pouch = () => new EquipmentSlots([
    { slot: 2, record: { name: 'M67', capacity: 3, mags: 1 } },
    { slot: 3, record: { name: 'M67', capacity: 3, mags: 1 } },
    { slot: 4, record: { name: 'Mark141', capacity: 6, mags: 1 } },
  ]);

  it('validates a supplied slot against kind/count and consumes legacy messages from the first nonempty match', () => {
    const p = pouch();
    expect(p.spend('M67', 4)).toBeNull();
    expect(p.spend('M67', 3)).toBe(3);
    expect(p.magazine(2)).toEqual({ rounds: 3, capacity: 3, mags: 0 });
    expect(p.magazine(3)).toEqual({ rounds: 2, capacity: 3, mags: 0 });
    for (let n = 0; n < 3; n++) expect(p.spend('M67')).toBe(2);
    expect(p.spend('M67', 2)).toBeNull();
    expect(p.spend('M67')).toBe(3);
    expect(p.totals()).toEqual({ M67: 1, Mark141: 6 });
  });

  it.each([
    ['duplicate slot', (s: EquipmentSlotState[]) => { s[1]!.slot = 2; }],
    ['foreign slot', (s: EquipmentSlotState[]) => { s[0]!.slot = 1; }],
    ['wrong kind', (s: EquipmentSlotState[]) => { s[0]!.kind = 'HE'; }],
    ['extra round', (s: EquipmentSlotState[]) => { s[0]!.rounds[0] = 4; }],
    ['extra magazine', (s: EquipmentSlotState[]) => { s[0]!.rounds[1] = 1; }],
    ['fractional round', (s: EquipmentSlotState[]) => { s[0]!.rounds[0] = 1.5; }],
    ['invalid current', (s: EquipmentSlotState[]) => { s[0]!.current = 1; }],
    ['partial snapshot', (s: EquipmentSlotState[]) => { s.pop(); }],
    ['sparse rounds', (s: EquipmentSlotState[]) => { delete s[0]!.rounds[0]; }],
  ])('rejects %s atomically', (_name, mutate) => {
    const p = pouch(); p.spend('M67', 2);
    const before = p.state(), after = structuredClone(before);
    mutate(after);
    expect(p.restore(after)).toBe(false);
    expect(p.state()).toEqual(before);
  });

  it('retains all magazine states, reports current ammunition and derives spare counts', () => {
    const p = new EquipmentSlots([{ slot: 2, record: { name: 'M67', capacity: 3, mags: 2 } }]);
    const s = p.state();
    s[0]!.rounds[0] = 1; s[0]!.rounds[1] = 2; s[0]!.current = 1;
    expect(p.restore(s)).toBe(true);
    expect(p.magazine(2)).toEqual({ rounds: 2, capacity: 3, mags: 1 });
    expect(p.spend('M67', 2)).toBe(2);
    expect(p.state()[0]!.rounds.slice(0, 2)).toEqual([1, 1]);
    expect(p.totals()).toEqual({ M67: 2 });
  });

  it('legacy use skips a matching slot whose current magazine is empty even when another magazine holds rounds', () => {
    const p = new EquipmentSlots([2, 3].map(slot => ({ slot, record: { name: 'M67', capacity: 3, mags: 2 } })));
    const s = p.state(); s[0]!.rounds[0] = 0;
    expect(p.restore(s)).toBe(true);
    expect(p.byName('M67')).toBe(2); // Original name lookup tests all magazines; a legacy use needs a usable current one.
    expect(p.spend('M67')).toBe(3);
    expect(p.magazine(2)?.rounds).toBe(0);
    expect(p.magazine(3)?.rounds).toBe(2);
  });

  it("R142: take sums and clears a slot's ten entries (FUN_005ba040 D:L472600-472626), keeping its hand index; 0 for a slot with no ring", () => {
    const p = new EquipmentSlots([{ slot: 2, record: { name: 'M67', capacity: 3, mags: 2 } }]);
    const s = p.state(); s[0]!.rounds[0] = 1; s[0]!.rounds[1] = 3; s[0]!.current = 1;
    expect(p.restore(s)).toBe(true);
    expect(p.take(2)).toBe(4);
    expect(p.state()).toEqual([{ slot: 2, kind: 'M67', rounds: new Array<number>(10).fill(0), current: 1 }]);
    expect(p.take(2)).toBe(0);
    expect(p.take(3)).toBe(0);
    expect(p.totals()).toEqual({ M67: 0 });
  });

  it("R142: room answers whether any of the slot's first `cap` entries is below Ammo_Capacity (FUN_005ba5b0 D:L472779-472837); none past the cap counts", () => {
    const p = pouch();
    expect(p.room(2, 1)).toBe(false);                      // full 3/3
    p.spend('M67', 2);
    expect(p.room(2, 1)).toBe(true);                       // 2/3
    expect(p.room(2, 0)).toBe(false);                      // no magazine under the cap
    expect(p.room(3, 2)).toBe(true);                       // its second entry (past the ring's one magazine) is empty
    expect(p.room(1, 1)).toBe(false);                      // no ring
  });

  it("R4P-219: room with skipLoaded passes over the magazine in the hand, as pour does -- r0004's ask FUN_005c0e40 D4:L514401-514403 beside r0001's FUN_005ba5b0 D:L472779-472837 (reading, pending review)", () => {
    const two = new EquipmentSlots([{ slot: 2, record: { name: 'Two', capacity: 1, mags: 2 } }]);
    const s = two.state(); s[0]!.rounds[0] = 0; s[0]!.rounds[1] = 1; s[0]!.current = 0;
    expect(two.restore(s)).toBe(true);
    expect(two.room(2, 2, true)).toBe(false);              // the only room is the magazine in the hand
    expect(two.room(2, 2, false)).toBe(true);              // r0001's ask counts it
    const t = two.state(); t[0]!.rounds[0] = 1; t[0]!.rounds[1] = 0; t[0]!.current = 0;
    expect(two.restore(t)).toBe(true);
    expect(two.room(2, 2, true)).toBe(true);               // room past the hand's magazine
    expect(two.room(2, 2, false)).toBe(true);
  });

  it('R142: pour tops up the entries under the cap in order and zeroes the rest (FUN_005ba3d0 D:L472718-472773), returns what did not fit; skipLoaded passes over the magazine in the hand; null for a slot with no ring', () => {
    const p = pouch();
    for (let n = 0; n < 2; n++) p.spend('M67', 2);       // M67 1/3
    expect(p.pour(2, 3, 1)).toBe(1);
    expect(p.magazine(2)?.rounds).toBe(3);
    expect(p.pour(2, 3, 1)).toBe(3);                       // full: everything left
    expect(p.pour(1, 3, 1)).toBeNull();
    const two = new EquipmentSlots([{ slot: 2, record: { name: 'Two', capacity: 3, mags: 2 } }]);
    const s = two.state(); s[0]!.rounds[0] = 0; s[0]!.rounds[1] = 1; s[0]!.current = 0;
    expect(two.restore(s)).toBe(true);
    expect(two.pour(2, 5, 2, true)).toBe(3);               // the one in the hand (0) skipped: slot 1 takes 2
    expect(two.state()[0]!.rounds.slice(0, 3)).toEqual([0, 3, 0]);
    expect(two.pour(2, 5, 2)).toBe(2);                     // without the skip slot 0 takes 3
    expect(two.state()[0]!.rounds.slice(0, 3)).toEqual([3, 3, 0]);
    expect(two.pour(2, 0, 1)).toBe(0);                     // a cap of one: slot 1 zeroed
    expect(two.state()[0]!.rounds.slice(0, 3)).toEqual([3, 0, 0]);
  });

  it("R142: install gives a slot 2-4 a new record with an empty ring, hand index 0 (FUN_005bc410 D:L473823-473842), the rings kept in kit order; refused outside 2-4", () => {
    const p = new EquipmentSlots([{ slot: 4, record: { name: 'M67', capacity: 3, mags: 1 } }]);
    expect(p.install(3, { name: 'HE', capacity: 3, mags: 1 })).toBe(true);
    expect(p.state().map((s) => [s.slot, s.kind, s.rounds[0], s.current])).toEqual([[3, 'HE', 0, 0], [4, 'M67', 3, 0]]);
    expect(p.pour(3, 3, 1)).toBe(0);
    expect(p.totals()).toEqual({ HE: 3, M67: 3 });
    expect(p.install(4, { name: 'HE', capacity: 3, mags: 1 })).toBe(true);   // what the slot held is gone
    expect(p.state().map((s) => [s.slot, s.kind, s.rounds[0]])).toEqual([[3, 'HE', 3], [4, 'HE', 0]]);
    expect(p.install(1, { name: 'HE', capacity: 3, mags: 1 })).toBe(false);
    expect(p.install(5, { name: 'HE', capacity: 3, mags: 1 })).toBe(false);
    expect(p.state()).toHaveLength(2);
  });

  const data = fixture('RUN/ZWEAPON.ZAR');
  it.skipIf(!data)('reads each hand throwable/charge capacity and magazine count through the disc reader', () => {
    const table = readKitTable(data!);
    for (const [name, capacity] of [['M67', 3], ['HE', 3], ['AN-M8', 3], ['Mark141', 6], ['C4', 4], ['Claymore', 4], ['PMN Mine', 4]] as const) {
      const record = [...table.throwables!.values()].find(t => t.record.name === name)?.record;
      expect(record, name).toMatchObject({ capacity, mags: 1 });
    }
  });
});
