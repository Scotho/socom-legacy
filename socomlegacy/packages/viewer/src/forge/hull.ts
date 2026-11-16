import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { groundPolygons, type GroundData } from '../mover';

/**
 * FORGE (a browser adaptation, no original): the collision drawn -- the one view of it (the owner, 2026-11-15: "there
 * should not be two different ways to see collision"): the Draw menu's Collision hull, and collision editing's, which
 * turns that switch on. Each polygon's face see-through and its edges, coloured by what it is to the walk, and a legend
 * of the colours in the viewport's lower left.
 */

/**
 * The colours, by what a polygon is to the walk -- the game's own types only (the owner, 2026-11-15: a steep floor, the
 * slope's and no type of the game's, not shown): a floor (ditype bit 0, the ground probe's, at any slope), a
 * side-only surface, a climbable one (a climb flag 1-5, the ladder's 2 among them), one the probe skips (cameratype bit
 * 0). Green, red and violet (the owner, 2026-11-15, as recommended): about 120 degrees apart in the hues the selection's
 * orange and the hover's sky blue leave free, so no two types overlapping blend to a third type's colour (red over green
 * a brown, not a yellow); the red short of pure, which goes muddy over the map's warm textures at the faces' opacity.
 * A pass-through white, its fill fainter (`HULL_FAINT_OPACITY`): the walk does not see it, and it does not wash out what
 * it overlaps.
 */
export const HULL_COLOURS = { floor: 0x35d07f, wall: 0xe8343a, climb: 0x9b5cff, skip: 0xffffff } as const;
export type HullKind = keyof typeof HULL_COLOURS;

/** The legend's rows (the owner, 2026-11-15: "a legend at the bottom left, similar to the ai map legend"), in order. */
export const HULL_LEGEND: readonly { kind: HullKind; label: string; note: string }[] = [
  { kind: 'floor', label: 'Floor', note: 'stood on (ditype bit 0); blocks as a wall too where steep' },
  { kind: 'wall', label: 'Wall', note: 'side only (ditype bit 1): blocks, never stood on' },
  { kind: 'climb', label: 'Climbable', note: 'climbed, by its climb flag 1-5 (2 a ladder): the height decides the move' },
  // Surface word bit 18 (`m_cameratype` bit 0, `SURFACE_SKIP`): the ground probe and the wall test skip it (research 23
  // s1.1, 24 s2); on Frostfire a doorway's volume among them (research 24 s4.1), 120 on MP6, none on MP51 or MP72.
  { kind: 'skip', label: 'Pass-through', note: 'the walk ignores it: never stood on, never a wall (e.g. a doorway volume)' },
];

/** A polygon as the view takes it: its points flat (x, y, z each), its surface words. */
export interface HullViewPoly { points: ArrayLike<number>; ditype: number; cameratype: number; appflags?: number }

/** What a polygon is to the walk, by its words alone (the game's types; its slope is the walk's, not a type). */
export function hullKindOf(p: Omit<HullViewPoly, 'points'>): HullKind {
  if (((p.appflags ?? 0) & 7) !== 0) return 'climb';
  if ((p.cameratype & 1) === 1) return 'skip';
  if ((p.ditype & 1) === 1) return 'floor';
  return 'wall';
}

const rgb = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** The view's buffers: each polygon's face as a fan of triangles, its edges as segments, both its kind's colour; the counts. */
export function hullViewBuffers(polys: Iterable<HullViewPoly>): {
  faces: { positions: Float32Array; colors: Float32Array };
  /** The pass-throughs' faces, drawn fainter (`HULL_FAINT_OPACITY`). */
  faint: { positions: Float32Array; colors: Float32Array };
  edges: { positions: Float32Array; colors: Float32Array };
  counts: Map<HullKind, number>;
} {
  const fp: number[] = [], fc: number[] = [], ep: number[] = [], ec: number[] = [], qp: number[] = [], qc: number[] = [];
  const counts = new Map<HullKind, number>();
  for (const p of polys) {
    const n = Math.floor(p.points.length / 3);
    if (n < 2) continue;
    const kind = hullKindOf(p);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const c = rgb(HULL_COLOURS[kind]);
    const at = (i: number): [number, number, number] => [p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!];
    const [tp, tc] = kind === 'skip' ? [qp, qc] : [fp, fc];
    for (let i = 1; i + 1 < n; i++) { tp.push(...at(0), ...at(i), ...at(i + 1)); tc.push(...c, ...c, ...c); }
    for (let i = 0; i < n; i++) { ep.push(...at(i), ...at((i + 1) % n)); ec.push(...c, ...c); }
  }
  return {
    faces: { positions: Float32Array.from(fp), colors: Float32Array.from(fc) },
    faint: { positions: Float32Array.from(qp), colors: Float32Array.from(qc) },
    edges: { positions: Float32Array.from(ep), colors: Float32Array.from(ec) },
    counts,
  };
}

/**
 * The hull's lines' material (the owner, 2026-11-09): drawn in the world's depth -- a wall in front hides the hull behind
 * it, as it hides the world (was: over everything) -- never fogged, its colours the segments' own, translucent.
 */
export function hullLineMaterial(): LineBasicMaterial {
  // Solid (the owner, 2026-11-15): where fills pile up, each face's own edge still names its type.
  return new LineBasicMaterial({ vertexColors: true, fog: false, depthTest: true, depthWrite: false, transparent: true, opacity: 1 });
}

/** The hull's faces' material: as its lines', half see-through, both sides, pulled a little toward the eye over the world's own faces. */
/** The faces' fill: light enough that faces stacked behind each other still read through (2026-11-15). */
export const HULL_FILL_OPACITY = 0.4;
/** A pass-through's fill: half the others'. */
export const HULL_FAINT_OPACITY = 0.2;

export function hullFaceMaterial(opacity: number = HULL_FILL_OPACITY): MeshBasicMaterial {
  return new MeshBasicMaterial({
    vertexColors: true, fog: false, depthTest: true, depthWrite: false, transparent: true, opacity, side: 2,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}

/** The hull's edges as line segments, each its polygon's kind's colour (the Draw menu's hull, `hullViewBuffers`). */
export function hullSegments(ground: GroundData): { positions: Float32Array; colors: Float32Array } {
  return hullViewBuffers(groundPolygons(ground)).edges;
}

/** The view's objects: its faces and its edges, in a group the caller adds to the scene; `dispose` frees their geometry. */
export function buildHullView(polys: Iterable<HullViewPoly>, faceMaterial: MeshBasicMaterial, lineMaterial: LineBasicMaterial, faintMaterial: MeshBasicMaterial = faceMaterial): {
  group: Group; counts: Map<HullKind, number>; dispose: () => void;
} {
  const b = hullViewBuffers(polys);
  const group = new Group();
  const geoms: BufferGeometry[] = [];
  const geometry = (x: { positions: Float32Array; colors: Float32Array }): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(x.positions, 3));
    g.setAttribute('color', new BufferAttribute(x.colors, 3));
    geoms.push(g);
    return g;
  };
  if (b.faces.positions.length) {
    const faces = new Mesh(geometry(b.faces), faceMaterial);
    faces.frustumCulled = false;
    faces.renderOrder = 9;
    group.add(faces);
  }
  if (b.faint.positions.length) {
    const faint = new Mesh(geometry(b.faint), faintMaterial);
    faint.frustumCulled = false;
    faint.renderOrder = 9;
    group.add(faint);
  }
  if (b.edges.positions.length) {
    const lines = new LineSegments(geometry(b.edges), lineMaterial);
    lines.frustumCulled = false;
    lines.renderOrder = 10;                         // after the world: its translucent lines blend over what is drawn
    group.add(lines);
  }
  return { group, counts: b.counts, dispose: () => { for (const g of geoms) g.dispose(); } };
}

/** The legend (`HULL_LEGEND`): a swatch, word, count and note for each kind the drawn hull has, as the AI map's legend. */
export function drawHullLegend(host: HTMLElement, counts: ReadonlyMap<HullKind, number>, title = 'Collision'): void {
  const doc = host.ownerDocument;
  const head = doc.createElement('div');
  head.className = 'fx-ai-legend__head';
  head.textContent = title;
  // Every kind a row (the owner, 2026-11-15: the Ladder row missing on a map with none), a kind the map lacks dimmed.
  const rows = HULL_LEGEND.flatMap((k) => {
    const row = doc.createElement('div');
    row.className = `fx-ai-legend__row${(counts.get(k.kind) ?? 0) === 0 ? ' is-empty' : ''}`;
    const swatch = doc.createElement('span');
    swatch.className = 'fx-ai-legend__swatch';
    swatch.style.background = `#${HULL_COLOURS[k.kind].toString(16).padStart(6, '0')}`;
    const label = doc.createElement('span');
    label.textContent = k.label;
    const count = doc.createElement('span');
    count.className = 'fx-ai-legend__count';
    count.textContent = (counts.get(k.kind) ?? 0).toLocaleString();
    const hint = doc.createElement('div');
    hint.className = `fx-ai-legend__hint${(counts.get(k.kind) ?? 0) === 0 ? ' is-empty' : ''}`;
    hint.textContent = k.note;
    row.append(swatch, label, count);
    return [row, hint];
  });
  const foot = doc.createElement('div');
  foot.className = 'fx-ai-legend__foot';
  foot.textContent = 'Counts are polygons';
  host.replaceChildren(head, ...rows, foot);
}
