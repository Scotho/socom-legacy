import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { materialTable } from '@s2u/scene';
import { coverageWords } from './materialCoverage';
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

/** A polygon as the view takes it: its points flat (x, y, z each), its surface words (the Colour by modes' too). */
export interface HullViewPoly {
  points: ArrayLike<number>; ditype: number; cameratype: number; appflags?: number;
  material?: number; inside?: number; reverbZone?: number; region?: number;
}

/**
 * What the view colours by (the owner, 2026-11-20: the Collision layer's Surface properties shown, as the Surface panel
 * sets them; a browser adaptation): the type to the walk (the default), indoors or not, the reverb zone (indoors or
 * outdoors and its entry), the material. Indoors and the reverb zone are read only from a floor the camera's probe stands
 * on (`readByCamera` in `./geometry/hullGeometry`): every other polygon is drawn grey and faint, as one whose value is
 * never read; a pass-through is never read by the shots either, so it is grey in Material too.
 */
export type HullColourBy = 'type' | 'indoors' | 'reverb' | 'material' | 'camera';
/**
 * The properties, in the Collision section's Property list and the legend's (the owner, 2026-11-20: "paint every property
 * type when we switch the mode"): choosing one colours the view by it and makes it what Paint, Sample and Apply set.
 */
export const HULL_COLOUR_BY: readonly { by: HullColourBy; label: string; note: string }[] = [
  { by: 'type', label: 'Collision', note: 'Floor, wall, pass-through or climbable: how players move on it' },
  { by: 'indoors', label: 'Area', note: 'Indoor or outdoor: the reverb list and ambience heard with the camera over a floor' },
  { by: 'reverb', label: 'Reverb zone', note: 'Zone 0 or 1: which entry of the indoor or outdoor reverb list a floor plays' },
  { by: 'material', label: 'Material', note: 'What it is made of: footsteps, bullet marks and how far shots go through' },
  { by: 'camera', label: 'Camera', note: 'Whether the third-person camera stops at it or passes through' },
];

/** The grey of a polygon whose shown value nothing reads (drawn faint). */
export const HULL_UNREAD_COLOUR = 0x8a8f98;
/**
 * Each two-way property's values, as the Collision section's tabs paint them and the view colours them: the value
 * (`../geometry/hullGeometry` `SurfaceFields`), its legend key, its word and its colour -- clear of the selection's orange
 * and the hover's sky blue.
 */
export const HULL_PROPERTY_VALUES = {
  indoors: [
    { value: false, key: 'out', label: 'Outdoor', colour: 0xe8c43a, note: 'the camera over it: the outdoor reverb and ambience' },
    { value: true, key: 'in', label: 'Indoor', colour: 0x9b5cff, note: 'the camera over it: the indoor reverb and ambience' },
  ],
  reverb: [
    { value: 0, key: 'z0', label: 'Zone 0', colour: 0x2fb5a8, note: '' },
    { value: 1, key: 'z1', label: 'Zone 1', colour: 0xe85cc8, note: '' },
  ],
  camera: [
    { value: false, key: 'cam-block', label: 'Blocks camera', colour: 0x9b5cff, note: 'the camera stops at it and pulls in in front of it' },
    { value: true, key: 'cam-through', label: 'Camera passes', colour: 0x35d07f, note: 'the camera passes through it (foliage, nets, thin rails)' },
  ],
} as const;

/** One colour the view draws a polygon in, under a Colour by: its legend key, and whether it is drawn faint. */
export interface HullKey { key: string; colour: number; faint: boolean }

/** A material's colour: hues a golden angle apart by its index, so neighbouring indices never look alike. */
export function materialColour(index: number): number {
  const h = ((index * 137.508) % 360) / 60, s = 0.7, l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const byte = (v: number): number => Math.round((v + m) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** The key a polygon is drawn under for `by` (`hullKindOf` for Type). */
export function hullKeyOf(p: Omit<HullViewPoly, 'points'>, by: HullColourBy = 'type'): HullKey {
  if (by === 'type') { const kind = hullKindOf(p); return { key: kind, colour: HULL_COLOURS[kind], faint: kind === 'skip' }; }
  const skipped = (p.cameratype & 1) === 1;
  if (by === 'material') {
    if (skipped) return { key: 'unread', colour: HULL_UNREAD_COLOUR, faint: true };
    const i = (p.material ?? 0) & 0xff;
    return { key: `m${i}`, colour: materialColour(i), faint: false };
  }
  if (by === 'camera') {
    // The camera's probes meet a side surface (`ditype` bit 1) without `m_cameratype` bit 1 (`@s2u/scene` segment's
    // `isCameraSurface`): a floor-only polygon is never met, whatever its bit.
    if ((p.ditype & 2) === 0) return { key: 'unread', colour: HULL_UNREAD_COLOUR, faint: true };
    const v = HULL_PROPERTY_VALUES.camera[(p.cameratype & 2) !== 0 ? 1 : 0];
    return { key: v.key, colour: v.colour, faint: false };
  }
  if (skipped || (p.ditype & 1) !== 1) return { key: 'unread', colour: HULL_UNREAD_COLOUR, faint: true };
  const v = by === 'indoors' ? HULL_PROPERTY_VALUES.indoors[(p.inside ?? 0) & 1]! : HULL_PROPERTY_VALUES.reverb[(p.reverbZone ?? 0) & 1]!;
  return { key: v.key, colour: v.colour, faint: false };
}

/** What a polygon is to the walk, by its words alone (the game's types; its slope is the walk's, not a type). */
export function hullKindOf(p: Omit<HullViewPoly, 'points'>): HullKind {
  if (((p.appflags ?? 0) & 7) !== 0) return 'climb';
  if ((p.cameratype & 1) === 1) return 'skip';
  if ((p.ditype & 1) === 1) return 'floor';
  return 'wall';
}

const rgb = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** The view's buffers: each polygon's face as a fan of triangles, its edges as segments, both its kind's colour; the counts. */
export function hullViewBuffers(polys: Iterable<HullViewPoly>, by: HullColourBy = 'type'): {
  faces: { positions: Float32Array; colors: Float32Array };
  /** The pass-throughs' faces, drawn fainter (`HULL_FAINT_OPACITY`). */
  faint: { positions: Float32Array; colors: Float32Array };
  edges: { positions: Float32Array; colors: Float32Array };
  /** Polygons a legend key (`hullKeyOf`). */
  counts: Map<string, number>;
} {
  const fp: number[] = [], fc: number[] = [], ep: number[] = [], ec: number[] = [], qp: number[] = [], qc: number[] = [];
  const counts = new Map<string, number>();
  for (const p of polys) {
    const n = Math.floor(p.points.length / 3);
    if (n < 2) continue;
    const k = hullKeyOf(p, by);
    counts.set(k.key, (counts.get(k.key) ?? 0) + 1);
    const c = rgb(k.colour);
    const at = (i: number): [number, number, number] => [p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!];
    const [tp, tc] = k.faint ? [qp, qc] : [fp, fc];
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
export function buildHullView(polys: Iterable<HullViewPoly>, faceMaterial: MeshBasicMaterial, lineMaterial: LineBasicMaterial, faintMaterial: MeshBasicMaterial = faceMaterial, by: HullColourBy = 'type'): {
  group: Group; counts: Map<string, number>; dispose: () => void;
} {
  const b = hullViewBuffers(polys, by);
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

/** The legend's options: the Colour by and its switch, the names a material and a reverb zone's row show. */
export interface HullLegendOptions {
  by?: HullColourBy;
  /** The Colour by switch in the legend's head; absent, none. */
  onBy?: (by: HullColourBy) => void;
  /** The map's default surface's name (material 0). */
  defaultMaterial?: string | null;
  /** The reverb zones' depth and seconds (`IndoorReverb` / `OutdoorReverb`), for their rows' notes. */
  reverb?: HullReverb | null;
}
/** The reverb's zones as the World settings hold them: each list's entries, depth then seconds. */
export interface HullReverb { indoor: readonly (readonly number[])[]; outdoor: readonly (readonly number[])[] }

const MATERIAL_NAMES = materialTable().map((m) => m.name);
/** The material table's length (`materialTable`: the two built-ins, then the SOILS). */
export const MATERIAL_COUNT = MATERIAL_NAMES.length;
/** A material index's name: 0 the map's default surface (named), past the table's end the engine's UNKNOWN. */
export function materialName(index: number, defaultMaterial?: string | null): string {
  if (index === 0) return `Map default${defaultMaterial ? ` (${defaultMaterial})` : ''}`;
  return MATERIAL_NAMES[index] ?? `UNKNOWN (${index})`;
}
/**
 * A material's name with what it lacks on the disc (`./materialCoverage`; the owner, 2026-11-20): the Material lists'
 * words -- "BROKEN GLASS · broken: ...", "GLASS · no footsteps". Material 0 by the map's default surface's name.
 */
export function materialLabel(index: number, defaultMaterial?: string | null): string {
  const name = materialName(index, defaultMaterial);
  const of = index === 0 ? defaultMaterial ?? null : MATERIAL_NAMES[index] ?? null;
  const words = of ? coverageWords(of) : '';
  return words ? `${name} · ${words}` : name;
}
/** A reverb zone's note: its depth and seconds, or none when the map's list has no such entry (the reverb fades out). */
export function reverbZoneNote(reverb: HullReverb | null | undefined, inside: boolean, zone: 0 | 1): string {
  const z = (inside ? reverb?.indoor : reverb?.outdoor)?.[zone];
  return z ? `depth ${Math.round(z[0]! * 100) / 100}, eases in over ${Math.round(z[1]! * 100) / 100} s` : 'no entry on this map: no reverb';
}

/** The most materials the legend lists (the commonest); the rest are counted in its foot. */
const LEGEND_MATERIALS_SHOWN = 10;

/** The rows a Colour by shows: Type's fixed kinds; Indoors' and the reverb's fixed sides; Material's as the hull has them. */
function legendRows(counts: ReadonlyMap<string, number>, o: HullLegendOptions): { key: string; colour: number; label: string; note: string }[] {
  const by = o.by ?? 'type';
  const unread = {
    key: 'unread', colour: HULL_UNREAD_COLOUR, label: 'Not read',
    note: by === 'material' ? 'pass-through: the walk and the shots skip it'
      : by === 'camera' ? 'a floor only: the camera never meets it' : 'not a floor the camera stands over: its value is never read',
  };
  if (by === 'type') return HULL_LEGEND.map((k) => ({ key: k.kind, colour: HULL_COLOURS[k.kind], label: k.label, note: k.note }));
  if (by === 'indoors' || by === 'camera') return [...HULL_PROPERTY_VALUES[by].map((v) => ({ key: v.key, colour: v.colour, label: v.label, note: v.note })), unread];
  if (by === 'reverb') return [
    ...HULL_PROPERTY_VALUES.reverb.map((v) => ({
      key: v.key, colour: v.colour, label: v.label,
      note: `indoors ${reverbZoneNote(o.reverb, true, v.value)}; outdoors ${reverbZoneNote(o.reverb, false, v.value)}`,
    })),
    unread,
  ];
  // Material: the hull's own, commonest first.
  const mats = [...counts.keys()].filter((k) => k.startsWith('m'))
    .sort((a, b) => counts.get(b)! - counts.get(a)! || Number(a.slice(1)) - Number(b.slice(1)));
  return [
    ...mats.slice(0, LEGEND_MATERIALS_SHOWN).map((k) => { const i = Number(k.slice(1)); return { key: k, colour: materialColour(i), label: materialName(i, o.defaultMaterial), note: '' }; }),
    ...(counts.get('unread') ? [unread] : []),
  ];
}

/** The legend: a swatch, word, count and note for each row of the Colour by (`legendRows`), as the AI map's legend. */
export function drawHullLegend(host: HTMLElement, counts: ReadonlyMap<string, number>, title = 'Collision', o: HullLegendOptions = {}): void {
  const doc = host.ownerDocument;
  const head = doc.createElement('div');
  head.className = 'fx-ai-legend__head';
  head.append(doc.createTextNode(title));
  if (o.onBy) {
    // The Colour by switch (the owner, 2026-11-20), in the head beside the title.
    const sel = doc.createElement('select');
    sel.className = 'fx-select fx-hull-colour-by';
    sel.setAttribute('aria-label', 'Colour the collision by');
    sel.title = 'Colour the collision by a property (the same as the Property in the Surface section): type, area, reverb zone, material or camera';
    for (const c of HULL_COLOUR_BY) { const opt = doc.createElement('option'); opt.value = c.by; opt.textContent = c.label; sel.append(opt); }
    sel.value = o.by ?? 'type';
    sel.addEventListener('change', () => { o.onBy!(sel.value as HullColourBy); sel.blur(); });
    head.append(sel);
  }
  // Every kind a row (the owner, 2026-11-15: the Ladder row missing on a map with none), a kind the map lacks dimmed.
  const rows = legendRows(counts, o).flatMap((k) => {
    const empty = (counts.get(k.key) ?? 0) === 0;
    const row = doc.createElement('div');
    row.className = `fx-ai-legend__row${empty ? ' is-empty' : ''}`;
    row.dataset['key'] = k.key;
    const swatch = doc.createElement('span');
    swatch.className = 'fx-ai-legend__swatch';
    swatch.style.background = `#${k.colour.toString(16).padStart(6, '0')}`;
    const label = doc.createElement('span');
    label.textContent = k.label;
    const count = doc.createElement('span');
    count.className = 'fx-ai-legend__count';
    count.textContent = (counts.get(k.key) ?? 0).toLocaleString();
    row.append(swatch, label, count);
    if (!k.note) return [row];
    const hint = doc.createElement('div');
    hint.className = `fx-ai-legend__hint${empty ? ' is-empty' : ''}`;
    hint.textContent = k.note;
    return [row, hint];
  });
  const foot = doc.createElement('div');
  foot.className = 'fx-ai-legend__foot';
  const more = (o.by ?? 'type') === 'material' ? [...counts.keys()].filter((k) => k.startsWith('m')).length - LEGEND_MATERIALS_SHOWN : 0;
  foot.textContent = more > 0 ? `Counts are polygons; ${more} more material${more === 1 ? '' : 's'} not listed` : 'Counts are polygons';
  host.replaceChildren(head, ...rows, foot);
}
