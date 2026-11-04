import { GateSet, type GateSpec } from './gates';
import type { GroundData } from './mover';
import type { DoorWire } from './net/protocol';

/**
 * The lever gates on the page (`./gates`, MAP-07). The action button is the switch's (`./actionPage`); this only
 * follows the room. The snapshot's `doors` array is the doors and then the gates, so `doorCount` is where the gates
 * start. A page does not run the program: `set_accessN` lives on the room's world, and a replay would open a destroyed
 * gate. The lever handle is not drawn. P8: a player's own pull is predicted as a pose (`press`,
 * `GATE_PREDICT_ADAPTATION`) and settled by the room's word.
 */

/** What the page lends the gates. */
export interface GatePageDeps {
  /** The drawn leaf moved (`WorldView.moveNode`). */
  move(path: string, delta: Float32Array): void;
  /**
   * The match, when one is open: the snapshot's door array, doors then gates; and (P8) the last command the room had run
   * as of it (`NetClient.acked`, null with no own body), and that snapshot's room tick (`NetClient.heardTick`), which
   * settle a predicted pull -- absent, not known.
   */
  net(): { doors(): DoorWire[] | undefined; acked?(): number | null; heardTick?(): number | null } | null;
}

export class GatePage {
  private set: GateSet | null = null;
  private doorCount = 0;

  constructor(private readonly deps: GatePageDeps) {}

  /** A new map: its gates on the walk's hull, shut. `doorCount` is `LoadedMap.doors`'s length. */
  setMap(gates: readonly GateSpec[] | undefined, ground: GroundData | undefined, doorCount: number): void {
    this.doorCount = doorCount;
    this.set = gates?.length ? new GateSet(gates, ground ?? null, {
      moved: (gate, delta) => this.deps.move(gate.path, delta),
    }) : null;
  }

  /**
   * For the hook (`__viewer.gates()`, a test instrument with no original): each gate's node and path and the
   * parent-space offset the page draws now. Empty on a map without gates.
   */
  stats(): { node: string; path: string; offset: [number, number, number] }[] {
    const set = this.set;
    return set ? set.specs.map((g, i) => ({ node: g.node, path: g.path, offset: set.offset(i) })) : [];
  }

  /**
   * P8 (`GATE_PREDICT_ADAPTATION`): a player's press of switch `action`, sent to the room naming command `seq` (from
   * `ActionPage.action`): true when it is one of the gates' levers -- its slide predicted here when the leaf rests at an
   * end (`GateSet.predict`), else followed off the wire -- false when it is no lever.
   */
  press(action: number, seq: number): boolean {
    const set = this.set;
    if (!set?.has(action)) return false;
    set.predict(action, seq);
    return true;
  }

  /** One frame: the server's gates followed (a predicted pull settled by its word), then the slide carried on. */
  frame(dt: number): void {
    const set = this.set;
    if (!set) return;
    const net = this.deps.net();
    if (net) set.applyWire(net.doors(), this.doorCount, net.acked ? net.acked() : undefined, net.heardTick?.() ?? undefined);
    set.step(dt);
  }
}
