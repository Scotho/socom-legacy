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
