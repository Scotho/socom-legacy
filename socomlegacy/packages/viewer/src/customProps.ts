import type { Object3D } from 'three';

/**
 * FP-6 item 5, PR #756's third-pass P2s (product track, a test instrument -- a browser adaptation, no original): a custom
 * map's pack props, drawn on the main thread after `show` (`./testroomContent` `contentPropsObject`), tracked as part of
 * the world they stand in. Their hull is already in the map's ground at `show`, so:
 * - `begin(load)` marks this load's props pending; `ready(load)` is false until they are attached (`attach`) or the
 *   preparation settles without them (`settle`: a read that failed) -- the page's hold reads no scene view meanwhile
 *   (`./main`, the frame's `pageLanes`), so the screen never lets the player walk into walls not yet drawn, and always
 *   releases;
 * - `clear()` frees what is held (its `userData.dispose`), called beside every `show`, a disc map's included: the world's
 *   own dispose (`./world` `WorldView.dispose`) does not reach this child.
 * Small and static on purpose: the frame reads it before the content chunk (`./testroomContent`) has loaded.
 */
export class CustomProps {
  private pending = -1;
  private held: Object3D | null = null;

  begin(load: number): void { this.pending = load; }
  /** Whether load `load` waits on no props (none asked, or drawn, or given up). */
  ready(load: number): boolean { return this.pending !== load; }
  /** A preparation over without props (failed, or nothing to draw): its load waits no more. */
  settle(load: number): void { if (this.pending === load) this.pending = -1; }
  /** The props of `load` drawn into `parent`, or disposed when another load is pending or shown since. */
  attach(load: number, group: Object3D, parent: Object3D): void {
    if (this.pending !== load) { CustomProps.free(group); return; }
    this.clear();
    this.held = group;
    parent.add(group);
    this.pending = -1;
  }
  /** What is held freed and taken out of its world (a world replaced). */
  clear(): void {
    const g = this.held;
    this.held = null;
    if (!g) return;
    g.removeFromParent();
    CustomProps.free(g);
  }
  private static free(g: Object3D): void { (g.userData['dispose'] as (() => void) | undefined)?.(); }
}
