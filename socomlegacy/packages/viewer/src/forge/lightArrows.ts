import { ArrowHelper, Color, Group, Vector3, type Object3D } from 'three';
import type { GlobalLighting } from '@s2u/scene';

/**
 * The map's light rig drawn in the viewport (a browser adaptation, FG.R2: an editor's instrument, never in a match): one
 * arrow a directional light of `GlobalLighting`, in the light's own colour, coming in from the side the light shines
 * from and pointing the way it travels, across the map's middle. A light the map leaves at zero (eleven maps run on two)
 * has none. Drawn over the geometry so the rig reads from anywhere; under Billboards › Light directions.
 */

/** Where an arrow starts, out from the map's middle toward its light, and how long it is: a share of the map's size. */
const ARROW_SHARE = 0.3;
const ARROW_MIN = 150;
/** Above everything the scene draws (as the billboards on top). An editor's value. */
const ARROWS_ORDER = 10_001;

/** Each light's arrow: from `centre + direction * length` along `-direction`, `length` long; the zero lights left out. */
export function lightArrowSpecs(rig: GlobalLighting, centre: readonly [number, number, number], size: number):
  { from: [number, number, number]; along: [number, number, number]; length: number; colour: [number, number, number] }[] {
  const length = Math.max(ARROW_MIN, size * ARROW_SHARE);
  return rig.directions.flatMap((d, k) => {
    if (Math.hypot(d[0], d[1], d[2]) === 0) return [];
    const c = rig.colours[k] ?? [1, 1, 1];
    return [{
      from: [centre[0] + d[0] * length, centre[1] + d[1] * length, centre[2] + d[2] * length] as [number, number, number],
      along: [-d[0], -d[1], -d[2]] as [number, number, number],
      length,
      colour: [Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2])] as [number, number, number],
    }];
  });
}

export class LightArrows {
  private readonly group = new Group();

  constructor(parent: Object3D) {
    this.group.name = 'forge light rig arrows';
    this.group.userData['forgeLightingInstrument'] = true;
    this.group.visible = false;
    parent.add(this.group);
  }

  /** The rig's arrows across the map's middle, or none (no rig). */
  set(rig: GlobalLighting | null, centre: readonly [number, number, number], size: number): void {
    this.clear();
    if (!rig) return;
    for (const a of lightArrowSpecs(rig, centre, size)) {
      const arrow = new ArrowHelper(new Vector3(...a.along), new Vector3(...a.from), a.length, new Color(...a.colour), a.length * 0.15, a.length * 0.07);
      arrow.traverse((o) => {
        o.renderOrder = ARROWS_ORDER;
        const m = (o as { material?: { depthTest: boolean; depthWrite: boolean } }).material;
        if (m) { m.depthTest = false; m.depthWrite = false; }
        o.raycast = () => undefined;                           // an instrument, never a pick
      });
      this.group.add(arrow);
    }
  }

  setVisible(on: boolean): void { this.group.visible = on; }

  dispose(): void { this.clear(); this.group.removeFromParent(); }

  private clear(): void {
    for (const child of [...this.group.children]) {
      (child as ArrowHelper).dispose?.();
      this.group.remove(child);
    }
  }
}
