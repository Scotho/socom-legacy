import {
  BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Object3D, Sprite, SpriteMaterial,
  type Material,
} from 'three';
import type { LayoutMarker, LayoutSpawner, LayoutZone } from '@s2u/creator-contracts';

/**
 * FCW-32 step 4 (FUI.R23 D4; product track, a browser adaptation with no original -- the Forge's own authoring
 * instrument): a layout's rules entities drawn in the editor's scene. A zone is the wireframe of its volume (an upright
 * cylinder about `at`, its radius and height; a box centred on `at`, its size, turned by its yaw: the room's own test,
 * `match/src/creator/rules/host.ts`), a marker a post and its id as a label, a spawner an arrow along its facing (-z
 * turned by its yaw, as the Forge's spawn markers, `./pieces` `spawnMarker`) in its side's colour, ringed by its spread.
 * Editor-only: the page hides the group under Walk, Play and a camera shot (`./page`), and the group is never handed
 * to a match. Nothing here is picked by the editor's ray (the page's `pick` reads its own placements only) and nothing
 * here changes what the game does.
 */
export const RULES_GIZMOS_ADAPTATION =
  "the Forge's rules entities drawn as wireframes in the editor's scene only: never in Play, never in a camera shot" as const;

/** The drawing's own sizes in game units (the Forge's, no original): a zone's ring segments, a post, a cross, an arrow. */
export const RULES_GIZMO_SIZE_ADAPTATION = Object.freeze({ ring: 24, verticals: 8, post: 40, cross: 6, arrow: 30, barb: 8, label: 14 });
/**
 * Its colours (the Forge's, no original): a zone green, a marker sand, an item spawner violet; a player spawner its team's
 * (A gold, B cyan: `./pieces` `TEAM_COLOUR`), an NPC spawner its side's (`./pieces` `SIDE_COLOUR`); the picked one white.
 */
export const RULES_GIZMO_COLOUR_ADAPTATION = Object.freeze({
  zone: 0x3ddc97, marker: 0xf0e6c8, item: 0xc8a0f0, picked: 0xffffff, A: 0xd8a640, B: 0x40c8d8, seal: 0x5a9cff, terrorist: 0xe0503c,
});

/** The entities a layout carries (`Layout`'s `zones`, `markers`, `spawners`). */
export interface RulesEntitiesOf {
  zones?: readonly LayoutZone[];
  markers?: readonly LayoutMarker[];
  spawners?: readonly LayoutSpawner[];
}

export interface RulesGizmoOptions {
  /** A marker's label (its id): an object drawn above its post, or null where none can be drawn. Absent: no label. */
  label?: (text: string, colour: number) => Object3D | null;
}

export interface RulesGizmos {
  /** Added to the editor's scene once; the page shows or hides it. */
  readonly group: Group;
  /** The entities drawn again (each by `<kind>:<id>`, the planner's reference), `picked` in the picked colour. */
  draw(entities: RulesEntitiesOf, picked?: string | null): void;
  /** The references drawn, in order: zones, markers, spawners. */
  ids(): string[];
  dispose(): void;
}

const TAU = Math.PI * 2;

function lines(points: number[], colour: number, name: string): LineSegments {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  const l = new LineSegments(g, new LineBasicMaterial({ color: colour, fog: false, depthTest: false, transparent: true, opacity: 0.9 }));
  l.name = name;
  l.renderOrder = 10;
  return l;
}

/** A ring of `radius` at height `y` about the origin, as line segments. */
function ring(out: number[], radius: number, y: number): void {
  const n = RULES_GIZMO_SIZE_ADAPTATION.ring;
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n, b = (TAU * (i + 1)) / n;
    out.push(radius * Math.cos(a), y, radius * Math.sin(a), radius * Math.cos(b), y, radius * Math.sin(b));
  }
}

function cylinderPoints(radius: number, height: number): number[] {
  const out: number[] = [];
  ring(out, radius, -height / 2);
  ring(out, radius, height / 2);
  const n = RULES_GIZMO_SIZE_ADAPTATION.verticals;
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    out.push(radius * Math.cos(a), -height / 2, radius * Math.sin(a), radius * Math.cos(a), height / 2, radius * Math.sin(a));
  }
  return out;
}

function boxPoints(size: readonly number[]): number[] {
  const [x, y, z] = [size[0]! / 2, size[1]! / 2, size[2]! / 2];
  const c = (i: number): [number, number, number] => [i & 1 ? x : -x, i & 2 ? y : -y, i & 4 ? z : -z];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  return edges.flatMap(([a, b]) => [...c(a), ...c(b)]);
}

const spawnerColour = (s: LayoutSpawner): number => {
  const k = RULES_GIZMO_COLOUR_ADAPTATION;
  if (s.source === 'player') return s.team === 'B' ? k.B : k.A;
  if (s.source === 'npc') return s.side === 'terrorist' ? k.terrorist : k.seal;
  return k.item;
};

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const holder = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    holder.geometry?.dispose();
    const mats = holder.material ? (Array.isArray(holder.material) ? holder.material : [holder.material]) : [];
    for (const m of mats) { (m as Material & { map?: { dispose(): void } | null }).map?.dispose(); m.dispose(); }
  });
}

export function createRulesGizmos(options: RulesGizmoOptions = {}): RulesGizmos {
  const group = new Group();
  group.name = 'rules-gizmos';
  group.userData['forgeRulesGizmos'] = true;
  let drawn: string[] = [];
  const clear = (): void => {
    for (const c of [...group.children]) { group.remove(c); disposeTree(c); }
    drawn = [];
  };
  const S = RULES_GIZMO_SIZE_ADAPTATION;
  const entity = (ref: string, at: readonly number[], yaw: number): Object3D => {
    const o = new Object3D();
    o.name = ref;
    o.userData['forgeRulesEntity'] = ref;
    o.position.set(at[0]!, at[1]!, at[2]!);
    o.rotation.y = yaw;
    drawn.push(ref);
    group.add(o);
    return o;
  };
  return {
    group,
    draw(entities, picked = null) {
      clear();
      const colourOf = (ref: string, own: number): number => (ref === picked ? RULES_GIZMO_COLOUR_ADAPTATION.picked : own);
      for (const z of entities.zones ?? []) {
        const ref = `zone:${z.id}`;
        const o = entity(ref, z.at, z.shape === 'box' ? z.yaw : 0);
        o.add(lines(z.shape === 'box' ? boxPoints(z.size) : cylinderPoints(z.radius, z.height), colourOf(ref, RULES_GIZMO_COLOUR_ADAPTATION.zone), 'volume'));
      }
      for (const m of entities.markers ?? []) {
        const ref = `marker:${m.id}`;
        const colour = colourOf(ref, RULES_GIZMO_COLOUR_ADAPTATION.marker);
        const o = entity(ref, m.at, m.yaw);
        o.add(lines([0, 0, 0, 0, S.post, 0, -S.cross, S.post, 0, S.cross, S.post, 0, 0, S.post, -S.cross, 0, S.post, S.cross], colour, 'post'));
        const label = options.label?.(m.id, colour) ?? null;
        if (label) { label.name = 'label'; label.position.set(0, S.post + S.label, 0); o.add(label); }
      }
      for (const s of entities.spawners ?? []) {
        const ref = `spawner:${s.id}`;
        const colour = colourOf(ref, spawnerColour(s));
        const o = entity(ref, s.at, s.yaw);
        const y = 2;
        o.add(lines([0, 0, 0, 0, S.post / 2, 0], colour, 'post'));
        o.add(lines([0, y, 0, 0, y, -S.arrow, 0, y, -S.arrow, -S.barb, y, -S.arrow + S.barb, 0, y, -S.arrow, S.barb, y, -S.arrow + S.barb], colour, 'arrow'));
        if (s.radius > 0) { const spread: number[] = []; ring(spread, s.radius, y); o.add(lines(spread, colour, 'spread')); }
      }
    },
    ids: () => [...drawn],
    dispose() { clear(); group.removeFromParent(); },
  };
}

/**
 * A marker's label drawn on an `OffscreenCanvas` (a canvas is the only font three.js has, `../overlays` `letter`); null
 * where the browser has none (a test's document), so no label is drawn there.
 */
export function canvasLabel(text: string, colour: number): Object3D | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(256, 64);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000000';                             // an outline, so the label reads over any map
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`;
  ctx.fillText(text, 128, 32);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas as unknown as HTMLCanvasElement), depthTest: false, transparent: true }));
  sprite.scale.set(48, 12, 1);
  return sprite;
}
