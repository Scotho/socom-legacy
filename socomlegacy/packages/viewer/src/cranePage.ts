import { CraneSet, type CraneSpec } from './cranes';
import type { CraneHookState } from './craneHook';
import type { GroundData } from './mover';
import type { CraneWire } from './net/protocol';

/**
 * Chain Reaction's hooks on the page (`./cranes`, research 176 §9). The room runs them. In a match this copies the
 * snapshot (`CraneWire`) and then steps the fraction of a frame since that snapshot, the same way `DoorPage` follows
 * a swing. The drawn hook moves (`WorldView.moveNode`), and so do `epan_N` and `hcont_N` (`CRANE_PANEL_WITH_HOOK_READING`);
 * `swingplate` then turns about its local X (`WorldView.spinLocalX`); the control meshes show or hide
 * (`WorldView.setNodeActive`). The page's own hull moves with the hook, and the panels' polygons do too.
 *
 * The offline room forks that hull when it is created (`simMapOfLoaded`). `show` poses the page before the armory
 * closes and the room exists, so a page that steps in the meantime hands the room a moved pose as its rest. The page's
 * own rest stays the disc's, and the snapshot then puts the two on different bases. Until a snapshot names the hooks,
 * a match leaves the hull at the disc rest.
 *
 * There is no separate lever animation. The mesh swap is the lever, and a presentation run of `crane_onoff` changes
 * no node (PF.R26), so the meshes follow the snapshot. That run also writes no valve, and it tests `crane_vN`: the
 * page copies the snapshot's valve onto the world each frame, which is the valve from before this press.
 *
 * P8 (`CRANE_PREDICT_ADAPTATION`, `./cranes`): a player's own press swaps the meshes and pauses or resumes the hook here
 * at once (`press`), and the room's word settles it.
 */

/** What the page lends the hooks. */
export interface CranePageDeps {
  /** The drawn hook, and each panel root, moved (`WorldView.moveNode`). */
  move(path: string, delta: Float32Array): void;
  /** `swingplate` turned about its local X, after `move` (`WorldView.spinLocalX`). */
  spin(path: string, angle: number): void;
  /** A control mesh drawn or hidden (`WorldView.setNodeActive`). */
  active(path: string, on: boolean): void;
  /**
   * The match, when one is open: the hooks as the newest snapshot has them; and (P8) the last command the room had run as
   * of it (`NetClient.acked`, null with no own body), which settles a predicted press -- absent, not known.
   */
  net(): { cranes(): CraneWire[] | undefined; acked?(): number | null } | null;
  /**
   * `crane_vN` on the page's world (`WorldState.setValve`). The presentation run tests this and does not write it
   * (PF.R26), so the page keeps it equal to the snapshot.
   */
  valve?(name: string, value: number): void;
  /**
   * A match will own the hooks (the offline room, or a server) even while `net` is still null. The hull stays at the
   * disc rest until that match's snapshot names them (`frame`).
   */
  followsMatch?(): boolean;
}

export class CranePage {
  private set: CraneSet | null = null;

  constructor(private readonly deps: CranePageDeps) {}

  /** A new map: its hooks on the hull the walk stands on (`LoadedMap.ground`), at rest and moving. */
  setMap(cranes: readonly CraneSpec[] | undefined, ground: GroundData | undefined): void {
    this.set = cranes?.length ? new CraneSet(cranes, ground ?? null, {
      moved: (spec, delta) => {
        this.deps.move(spec.path, delta);
        for (const panel of spec.panels) this.deps.move(panel, delta);
      },
      swung: (spec, angle) => this.deps.spin(spec.swing, angle),
      shown: (spec, mesh) => {
        this.deps.active(spec.onMesh, mesh !== 'off');
        this.deps.active(spec.offMesh, mesh !== 'on');
      },
    }) : null;
    this.syncValves();
  }

  /**
   * One frame. A snapshot names the phase: copy it, write its valve, then step the fraction of a frame since it.
   * A match that has not published that phase yet leaves the hull at the disc rest (`followsMatch`, or `net` with no
   * hooks on the snapshot). With no match, this page is the hooks and it steps.
   */
  frame(dt: number): void {
    const set = this.set;
    if (!set) return;
    const net = this.deps.net();
    const wire = net?.cranes();
    if (wire && wire.length > 0) {
      set.applyWire(wire, net?.acked ? net.acked() : undefined);
      this.syncValves();
      set.step(dt);
      return;
    }
    if (net || this.deps.followsMatch?.()) return;
    this.syncValves();
    set.step(dt);
  }

  /**
   * The lever when this page has no match. A player match stays with the room: this returns false and changes nothing,
   * so a press is not applied twice.
   */
  toggleLocal(valve: string): boolean {
    if (!this.set || this.deps.net()) return false;
    return this.set.toggleByValve(valve);
  }

  /**
   * P8 (`CRANE_PREDICT_ADAPTATION`): a player's press of the control whose valve is `valve`, sent to the room naming
   * command `seq` (from `ActionPage.action`): true when it is one of the hooks' -- its swap predicted here
   * (`CraneSet.predict`) while the page follows a match's hooks -- false when it is none.
   */
  /** Whether `valve` is one of the hooks' controls (`./actionPage`'s `isCrane`: a crane is never marked used). */
  owns(valve: string): boolean {
    return (this.set?.indexByValve(valve) ?? -1) >= 0;
  }

  press(valve: string, seq: number): boolean {
    const set = this.set;
    const i = set ? set.indexByValve(valve) : -1;
    if (!set || i < 0) return false;
    if (this.deps.net()?.cranes()?.length) set.predict(i, seq);
    return true;
  }

  /** The disc check's read (`window.__crane`). It changes nothing. */
  hookState(): CraneHookState[] {
    const set = this.set;
    if (!set) return [];
    return set.specs.map((spec, index) => {
      const s = set.state(index);
      return {
        index, paused: s.paused, valve: s.valve, mesh: s.mesh, offset: s.offset,
        hook: spec.path, panels: spec.panels, onMesh: spec.onMesh, offMesh: spec.offMesh, swingPath: spec.swing,
      };
    });
  }

  /** Each hook's `crane_vN` from the set the snapshot just wrote, so the next press tests that valve. */
  private syncValves(): void {
    const set = this.set;
    const write = this.deps.valve;
    if (!set || !write) return;
    for (let i = 0; i < set.count; i++) {
      const spec = set.specs[i];
      if (spec) write(spec.control.valve, set.state(i).valve);
    }
  }
}
