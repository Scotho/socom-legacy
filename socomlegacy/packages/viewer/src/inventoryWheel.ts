import type { InventoryKit } from './inventoryMenu';

/**
 * The mouse wheel on the kit (the Forge's owner (crispy, OT.R112), 2026-11-16: "use the scroll wheel to cycle between the inventory when it is both
 * closed and open"; a browser adaptation -- the original reads a pad, whose R2 menu steps on the d-pad): with the R2
 * inventory open, a notch steps its highlight (down the list for a wheel turned toward the player, as the d-pad's Down);
 * closed, a notch takes up the next slot the kit can take (`InventoryKit.takeable`), round the kit, as a PC shooter's
 * wheel does. Read only where the page reads the mouse (the test room's and the Forge's Play's, OT.R114).
 */

/** The wheel's travel, in pixels, that makes one notch (a mouse's notch is about 100; a trackpad's flick many smaller). */
export const INVENTORY_WHEEL_NOTCH_ADAPTATION = 50;
/** Idle this long, in ms, and a part-notch of travel is forgotten. */
const WHEEL_IDLE_MS = 250;

/** The next slot `dir` (1 down the kit, -1 up) from the one in the hand that the kit can take, round the kit; null, none other. */
export function nextWheelSlot(kit: InventoryKit, dir: 1 | -1): number | null {
  for (let i = 1; i < kit.count; i++) {
    const slot = (((kit.current + dir * i) % kit.count) + kit.count) % kit.count;
    if (kit.takeable(slot)) return slot;
  }
  return null;
}

/** What the wheel drives: the R2 inventory (open or not, its d-pad keys) and the kit (its slots, the one in the hand). */
export interface WheelInventory {
  isOpen(): boolean;
  key(code: string): boolean;
}
export interface WheelKit {
  inventoryKit(): InventoryKit;
  takeSlot(slot: number): boolean;
}

/** The wheel's notches out of its events: travel added up, a notch each `INVENTORY_WHEEL_NOTCH_ADAPTATION`. */
export class WheelNotches {
  private travel = 0;
  private last = -Infinity;

  /** The notches this event completes: positive toward the player (down), negative away; 0 for none yet. */
  take(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, now: number): number {
    if (now - this.last > WHEEL_IDLE_MS) this.travel = 0;
    this.last = now;
    // Lines (Firefox) and pages count as a notch each; pixels add up.
    if (e.deltaMode !== 0) { this.travel = 0; return Math.sign(e.deltaY); }
    this.travel += e.deltaY;
    const n = Math.trunc(this.travel / INVENTORY_WHEEL_NOTCH_ADAPTATION);
    this.travel -= n * INVENTORY_WHEEL_NOTCH_ADAPTATION;
    return n;
  }
}

/** One notch `dir` on the kit: the open menu's highlight stepped, else the next takeable slot taken up. Whether it did. */
export function wheelInventory(menu: WheelInventory, kit: WheelKit, dir: 1 | -1): boolean {
  if (menu.isOpen()) return menu.key(dir > 0 ? 'ArrowDown' : 'ArrowUp');
  const slot = nextWheelSlot(kit.inventoryKit(), dir);
  return slot !== null && kit.takeSlot(slot);
}
