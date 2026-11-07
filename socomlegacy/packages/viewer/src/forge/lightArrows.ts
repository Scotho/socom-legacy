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

/**
 * The drop shadows' way (`LoadedMap.shadowVector`, the world root's; a new empty map's own `settings.shadowVector`): one
 * more arrow, dark grey so it is no light, through the map's middle the way the characters' shadows fall -- in from the
 * opposite side, as a light's comes in from its own. An editor's colour (FG.R2).
 */
export const SHADOW_ARROW_COLOUR: [number, number, number] = [0.22, 0.22, 0.24];

/** The shadow's arrow: as a light's, from `centre - way * length` along `way` (its unit direction); none for a zero vector. */
export function shadowArrowSpec(vector: readonly number[], centre: readonly [number, number, number], size: number):
  { from: [number, number, number]; along: [number, number, number]; length: number; colour: [number, number, number] } | null {
  const len = Math.hypot(vector[0]!, vector[1]!, vector[2]!);
  if (!(len > 0)) return null;
  const way: [number, number, number] = [vector[0]! / len, vector[1]! / len, vector[2]! / len];
  const length = Math.max(ARROW_MIN, size * ARROW_SHARE);
  return { from: [centre[0] - way[0] * length, centre[1] - way[1] * length, centre[2] - way[2] * length], along: way, length, colour: SHADOW_ARROW_COLOUR };
}

export class LightArrows {
  private readonly group = new Group();

  constructor(parent: Object3D) {
    this.group.name = 'forge light rig arrows';
    this.group.userData['forgeLightingInstrument'] = true;
    this.group.visible = false;
    parent.add(this.group);
  }

  /** The rig's arrows across the map's middle, or none (no rig); and the drop shadows' way (`shadow`), where it has one. */
  set(rig: GlobalLighting | null, centre: readonly [number, number, number], size: number, shadow: readonly number[] | null = null): void {
    this.clear();
    const shadowArrow = shadow ? shadowArrowSpec(shadow, centre, size) : null;
    for (const a of [...(rig ? lightArrowSpecs(rig, centre, size) : []), ...(shadowArrow ? [shadowArrow] : [])]) {
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
