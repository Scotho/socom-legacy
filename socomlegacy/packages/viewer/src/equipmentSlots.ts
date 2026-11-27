import { MagazineRing, RING_SLOTS, magazinesCarried } from './magazines';

/** The additive reconnect state; absolute kit slots, not an equipment item's name (research 361 §3). */
export interface EquipmentSlotState {
  slot: number;
  kind: string;
  rounds: number[];
  current: number;
}

export interface EquipmentSlotRecord { name: string; capacity: number; mags: number }
export interface EquipmentSlotEntry { slot: number; record: EquipmentSlotRecord }

/**
 * Each throwable/charge kit slot owns its magazine ring: FUN_005bdec0 D:L474690-474711; the selected slot alone is
 * spent by FUN_005c1970 D:L477023-477042 and FUN_005bc730 D:L474109-474126 (research 361 §1, reading pending review).
 * Pouch totals remain a derived compatibility view. This module is shared by the page and authoritative room.
 */
export class EquipmentSlots {
  private readonly entries = new Map<number, { record: EquipmentSlotRecord; ring: MagazineRing }>();

  constructor(entries: readonly EquipmentSlotEntry[]) {
    for (const { slot, record } of entries) {
      if (!Number.isInteger(slot) || slot < 2 || slot > 4 || this.entries.has(slot)) continue;
      this.entries.set(slot, { record, ring: new MagazineRing(record.capacity, Math.max(1, magazinesCarried(record.mags))) });
    }
  }

  /** The selected slot's current magazine, capacity and spare-magazine count (FUN_002193d0, research 361 §2). */
  magazine(slot: number): { rounds: number; capacity: number; mags: number } | null {
    const e = this.entries.get(slot);
    return e ? { rounds: e.ring.rounds(), capacity: e.ring.capacity, mags: e.ring.shownMags() } : null;
  }

  kind(slot: number): string | null { return this.entries.get(slot)?.record.name ?? null; }

  /** Name-based action selection: the first matching slot with ammunition (FUN_005c8a20 D:L481350-481374). */
  first(kind: string, withAmmo = true): number | null {
    for (const [slot, e] of this.entries) if (e.record.name === kind && (!withAmmo || e.ring.total() > 0)) return slot;
    return null;
  }

  /** FUN_005c8a20 keeps the last matching empty slot when no matching ring has ammunition. */
  byName(kind: string): number | null {
    let empty: number | null = null;
    for (const [slot, e] of this.entries) {
      if (e.record.name !== kind) continue;
      if (e.ring.total() > 0) return slot;
      empty = slot;
    }
    return empty;
  }

  /** Validate a supplied slot against its trusted kind; absent metadata uses the first eligible legacy slot. */
  eligible(kind: string, slot?: number): number | null {
    const at = slot === undefined
      ? [...this.entries].find(([, e]) => e.record.name === kind && e.ring.rounds() > 0)?.[0] ?? null : slot;
    const e = at === null ? undefined : this.entries.get(at);
    return e?.record.name === kind && e.ring.rounds() > 0 ? at : null;
  }

  spend(kind: string, slot?: number): number | null {
    const at = this.eligible(kind, slot);
    if (at === null || !this.entries.get(at)!.ring.fire()) return null;
    return at;
  }

  /** Refund the exact predicted slot; name-only legacy refusals use the first matching magazine with room. */
  refund(kind: string, slot?: number): boolean {
    if (slot !== undefined) {
      const e = this.entries.get(slot);
      return e?.record.name === kind ? e.ring.refund() : false;
    }
    for (const e of this.entries.values()) if (e.record.name === kind && e.ring.refund()) return true;
    return false;
  }

  totals(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const { record, ring } of this.entries.values()) out[record.name] = (out[record.name] ?? 0) + ring.total();
    return out;
  }

  fill(): void { for (const e of this.entries.values()) e.ring.fill(); }

  /**
   * R142 (the body's bundle, `FUN_005ba040` D:L472600-472626; reading, pending review): the slot's ten entries summed and
   * zeroed -- what a death passes to the bundle -- the magazine in the hand's index kept. 0 for a slot holding no ring.
   */
  take(slot: number): number {
    const e = this.entries.get(slot);
    if (!e) return 0;
    const n = e.ring.total();
    e.ring.restore({ slots: [], current: e.ring.state().current });
    return n;
  }

  /**
   * R142 (`FUN_005ba5b0` D:L472779-472837, the ask's room test; reading, pending review): whether any of the slot's first
   * `cap` entries (at most ten) is below the record's `Ammo_Capacity`. The caller gives the cap -- the item's own
   * `NumMags`; the doubling there is for the firearm classes only, never an equipment slot's. False for no ring.
   * R4P-219 (reading; its r0004 cites re-read and CONFIRMED by atlas-parity, a non-author, 2026-11-24): r0004's ask `FUN_005c0e40` D4:L514401-514403 passes over the slot's magazine in
   * the hand (`+0x684`) when the record's own `NumMags` is 2 or more -- the same test as its pour (`skipLoaded` below,
   * `FUN_005c0c20` D4:L514322-514323); r0001's D:L472779-472837 counts it. `skipLoaded`, for the caller to decide, as
   * `pour`'s.
   */
  room(slot: number, cap: number, skipLoaded = false): boolean {
    const e = this.entries.get(slot);
    if (!e) return false;
    const { slots, current } = e.ring.state();
    for (let i = 0; i < Math.min(RING_SLOTS, cap); i++) {
      if (skipLoaded && i === current) continue;
      if (e.ring.capacity - slots[i]! > 0) return true;
    }
    return false;
  }

  /**
   * R142: `FUN_005ba3d0(kit, slot, rounds)` (D:L472718-472773; reading, pending review) on the slot's ring -- entries
   * 0 to 9 in order, each below `cap` (the item's own `NumMags`, at most ten) topped up toward the record's
   * `Ammo_Capacity` from `rounds`, each at or past it zeroed; the magazine in the hand skipped when `skipLoaded` (r0004's
   * test, for the caller to decide). Returns what did not fit; null for a slot holding no ring (nothing poured).
   */
  pour(slot: number, rounds: number, cap: number, skipLoaded = false): number | null {
    const e = this.entries.get(slot);
    if (!e) return null;
    const state = e.ring.state();
    const top = Math.min(RING_SLOTS, Math.max(0, Math.floor(cap)));
    let left = Math.max(0, Math.floor(rounds));
    for (let i = 0; i < RING_SLOTS; i++) {
      if (i < top) {
        if (skipLoaded && i === state.current) continue;
        const add = Math.min(Math.max(0, e.ring.capacity - state.slots[i]!), left);
        state.slots[i]! += add;
        left -= add;
      } else state.slots[i] = 0;
    }
    e.ring.restore(state);
    return left;
  }

  /**
   * R142: `FUN_005bc410(kit, slot, record)` (D:L473823-473842; reading, pending review) for a throwable or a charge --
   * the slot now holds `record`, its hand index 0. Of the slot, the original writes its record (`+0xe4`), `+0x6fc` and
   * `+0x684` (zeroed, D:L473830-473839) and `+0x774` (D:L473842), and raises the kit's count `+0x82c` to slot + 1 for a
   * slot at or past it (D:L473825-473826; the function runs on past D:L473842, unread) -- not the ring's entries;
   * "with an empty ring" is the
   * port's simplification, equal for every slot the five-slot kit can reach (a spent ring is all zeros, an EQUIP_NONE
   * slot has no ring here) -- it would differ only for a slot past the count holding stale ring data (the build's fresh
   * review, finding 2). What the slot held before is gone. The rings stay in kit order. False, nothing changed, for a
   * slot outside 2-4.
   */
  install(slot: number, record: EquipmentSlotRecord): boolean {
    if (!Number.isInteger(slot) || slot < 2 || slot > 4) return false;
    const ring = new MagazineRing(record.capacity, Math.max(1, magazinesCarried(record.mags)));
    ring.restore({ slots: [], current: 0 });
    this.entries.set(slot, { record, ring });
    const sorted = [...this.entries].sort((a, b) => a[0] - b[0]);
    this.entries.clear();
    for (const [s, e] of sorted) this.entries.set(s, e);
    return true;
  }

  state(): EquipmentSlotState[] {
    return [...this.entries].map(([slot, { record, ring }]) => {
      const state = ring.state();
      return { slot, kind: record.name, rounds: state.slots, current: state.current };
    });
  }

  /**
   * Browser reconnect adaptation: reject malformed snapshots atomically, including duplicate/foreign slots, kinds,
   * indices and rounds beyond the trusted record. A partial snapshot must not leave an unreported slot full.
   */
  restore(state: readonly EquipmentSlotState[], pouch?: Readonly<Record<string, number>>): boolean {
    if (!Array.isArray(state) || state.length !== this.entries.size) return false;
    const seen = new Set<number>();
    for (const s of state) {
      if (!s || typeof s !== 'object' || !Number.isInteger(s.slot) || seen.has(s.slot)) return false;
      const e = this.entries.get(s.slot);
      if (!e || s.kind !== e.record.name || !Number.isInteger(s.current) || s.current < 0 || s.current >= e.ring.carried ||
          !Array.isArray(s.rounds) || s.rounds.length !== RING_SLOTS) return false;
      if (Array.from<unknown>(s.rounds).some((n, i) => typeof n !== 'number' || !Number.isInteger(n) || n < 0 ||
          n > e.ring.capacity || (i >= e.ring.carried && n !== 0))) return false;
      seen.add(s.slot);
    }
    if (pouch !== undefined) {
      const totals = new Map<string, number>();
      for (const s of state) totals.set(s.kind, (totals.get(s.kind) ?? 0) + s.rounds.reduce((n: number, r: number) => n + r, 0));
      for (const [kind, total] of totals) if (!Object.hasOwn(pouch, kind) || pouch[kind] !== total) return false;
    }
    for (const s of state) this.entries.get(s.slot)!.ring.restore({ slots: s.rounds, current: s.current });
    return true;
  }

  /**
   * LATER 1129 (R142 head B; reading, pending review): one slot set to the room's state whole -- a slot a walk-over's take
   * installed (`FUN_005bc410` D:L473823-473829; the room's `kit` `equipment`, no `added`). False, nothing changed, for a
   * slot this kit does not hold, another kind, or a state beyond the record (as `restore` refuses one).
   */
  setSlot(s: EquipmentSlotState): boolean {
    const e = this.entries.get(s.slot);
    if (!e || s.kind !== e.record.name || !Number.isInteger(s.current) || s.current < 0 || s.current >= e.ring.carried ||
        !Array.isArray(s.rounds) || s.rounds.length !== RING_SLOTS) return false;
    if (s.rounds.some((n, i) => !Number.isInteger(n) || n < 0 || n > e.ring.capacity || (i >= e.ring.carried && n !== 0))) return false;
    e.ring.restore({ slots: [...s.rounds], current: s.current });
    return true;
  }

  /**
   * LATER 1129: a take's pour on the page (`FUN_005ba3d0` D:L472718-472773 in the room; the `kit`'s `added`): each
   * magazine's amount added to the page's own, never past the record's capacity, the magazine in the hand kept -- exact
   * with a throw the page spent ahead of the room, as the firearm transfer's `added` (`Fire.setRing`). False, nothing
   * changed, for a slot this kit does not hold, another kind, or a malformed list.
   */
  add(slot: number, kind: string, added: readonly number[]): boolean {
    const e = this.entries.get(slot);
    if (!e || e.record.name !== kind || !Array.isArray(added) || added.length !== RING_SLOTS || added.some((n) => !Number.isInteger(n))) return false;
    const state = e.ring.state();
    const slots = state.slots.map((n, i) => (i < e.ring.carried ? Math.max(0, Math.min(e.ring.capacity, n + added[i]!)) : 0));
    e.ring.restore({ slots, current: state.current });
    return true;
  }

  /**
   * A legacy aggregate cannot identify spent duplicates. Reconstruct in kit/magazine order, bounded by each record;
   * missing/invalid totals give no ammunition. Its sum never exceeds the supplied aggregate (research 361 §3).
   */
  restoreLegacy(pouch: Readonly<Record<string, number>>): void {
    const remaining = new Map<string, number>();
    for (const { record } of this.entries.values()) {
      const n = Object.hasOwn(pouch, record.name) ? pouch[record.name] : 0;
      remaining.set(record.name, Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0);
    }
    for (const { record, ring } of this.entries.values()) {
      let n = remaining.get(record.name) ?? 0;
      const slots = new Array<number>(RING_SLOTS).fill(0);
      for (let i = 0; i < ring.carried; i++) { slots[i] = Math.min(ring.capacity, n); n -= slots[i]!; }
      ring.restore({ slots, current: 0 });
      remaining.set(record.name, n);
    }
  }
}
