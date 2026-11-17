import { add, scale, type EditMesh, type Vec3 } from './editMesh';
import { meshOf, type PrimitiveOptions } from './primitives';

/**
 * The block tool's shapes (a browser adaptation, after Source 2 Hammer's block tool: drag a rectangle out on the
 * workplane, then pull its height; the owner, 2026-11-17: "implement a Drag-out block tool on the grid. and remove the
 * fixed cube/plane/sphere/cylinder ... There is dropdown for various shapes"). Each is built in the plane's own frame --
 * across its `u` and `v`, up its `n` -- filling the dragged rectangle and the pulled height, then carried into the world
 * and made a mesh (`./primitives` `meshOf`: shared points, flat faces, world-aligned texturing). Each reads its own
 * settings (`SHAPE_SETTINGS`; the owner, 2026-11-17: "would be nice for each shape to have some settings we can
 * predefine ... I leave it up to you to define all the nice settings that make it easy for a user to start creating").
 */
export type BlockShape = 'block' | 'quad' | 'ramp' | 'cylinder' | 'pipe' | 'spike' | 'pyramid' | 'sphere' | 'torus'
  | 'stairs' | 'ladder' | 'railing' | 'column' | 'arch' | 'doorway' | 'window' | 'room' | 'roof' | 'polygon';

/** Create's shape groups, in the menu's order (the owner, 2026-11-17: "it is categorized better? right now it is one giant list"). */
export type BlockShapeGroup = 'Basic' | 'Round' | 'Architecture';
export const BLOCK_SHAPE_GROUPS: readonly BlockShapeGroup[] = ['Basic', 'Round', 'Architecture'];

/**
 * The shapes in Create's menu, by group: Box (not Block: the owner, 2026-11-17, "it should be called box instead of
 * block"), Quad, Ramp (a wedge: "call wedge, ramp") and Pyramid; the round ones; and the architectural ones -- Stairs
 * ("a stair geometry ... a smooth collision box for it"), Ladder ("it should also set bit flag for the ladder"), Arch,
 * Doorway (a wall with a doorway) and Room (a hollow box: "add wedge, hollow box, and wall with doorway ... pyramid,
 * and, torus, and pipe"); Railing, Column, Window and Roof ("what other nice architecture shapes can we add?").
 */
export const BLOCK_SHAPES: readonly { shape: BlockShape; label: string; group: BlockShapeGroup }[] = [
  { shape: 'block', label: 'Box', group: 'Basic' },
  { shape: 'quad', label: 'Quad', group: 'Basic' },
  { shape: 'ramp', label: 'Ramp', group: 'Basic' },
  { shape: 'pyramid', label: 'Pyramid', group: 'Basic' },
  // Polygon (the owner, 2026-11-17: "move the polygon inside the create menu as well under basic"): its outline clicked point by point (`polygonMesh`), not dragged.
  { shape: 'polygon', label: 'Polygon', group: 'Basic' },
  { shape: 'cylinder', label: 'Cylinder', group: 'Round' },
  { shape: 'pipe', label: 'Pipe', group: 'Round' },
  { shape: 'spike', label: 'Spike', group: 'Round' },
  { shape: 'sphere', label: 'Sphere', group: 'Round' },
  { shape: 'torus', label: 'Torus', group: 'Round' },
  { shape: 'stairs', label: 'Stairs', group: 'Architecture' },
  { shape: 'ladder', label: 'Ladder', group: 'Architecture' },
  { shape: 'railing', label: 'Railing', group: 'Architecture' },
  { shape: 'column', label: 'Column', group: 'Architecture' },
  { shape: 'arch', label: 'Arch', group: 'Architecture' },
  { shape: 'doorway', label: 'Doorway', group: 'Architecture' },
  { shape: 'window', label: 'Window', group: 'Architecture' },
  { shape: 'room', label: 'Room', group: 'Architecture' },
  { shape: 'roof', label: 'Roof', group: 'Architecture' },
];

/** A shape's object kind (`./world` `GeoObject.kind`): the old primitives' own, every other a mesh. */
export const blockKind = (s: BlockShape): 'box' | 'plane' | 'cylinder' | 'sphere' | 'mesh' =>
  s === 'block' ? 'box' : s === 'quad' ? 'plane' : s === 'cylinder' || s === 'sphere' ? s : 'mesh';

/** The sides round a cylinder or a spike, and a sphere's segments and rings (the old fixed primitives' counts). */
export const BLOCK_SIDES = 16;
export const BLOCK_SPHERE_RINGS = 10;
/**
 * Game units a metre: every map's world root says `MetersPerUnit` 0.1 (all 34 maps; research 188's U9, PROVEN), so 10
 * units are a metre. The sizes below are a building's ordinary ones in metres, at that scale.
 */
export const UNITS_PER_METRE = 10;
/**
 * Stairs' step rise when their count is left to the height ("Steps" 0), game units: a step each this much of the pulled
 * height (at least one) -- some 17 cm, an ordinary stair's. A browser adaptation with no original (Create's own shape;
 * the disc's stairs are modelled, their collision a ramp: `./hullGeometry` `COLLISION_TYPES`' floor note).
 */
export const STAIR_STEP_RISE_ADAPTATION = 1.7;
/**
 * The settings' sizes where they start, game units (a browser adaptation with no original: Create's own shapes), a
 * building's ordinary ones at 10 units a metre (`UNITS_PER_METRE`): a door 0.9 x 2.1 m, a window 1 x 1.2 m on a 0.9 m
 * sill, a wall 20 cm thick. Every one is the user's to change.
 */
export const DOOR_WIDTH_ADAPTATION = 9;
export const DOOR_HEIGHT_ADAPTATION = 21;
export const WINDOW_WIDTH_ADAPTATION = 10;
export const WINDOW_HEIGHT_ADAPTATION = 12;
export const WINDOW_SILL_ADAPTATION = 9;
export const WALL_THICKNESS_ADAPTATION = 2;

/** A shape's settings as they stand: each setting's key its value. */
export type ShapeSettings = Record<string, number | string | boolean>;
/** One setting of a shape: a number (in a range, a unit), a choice, or a switch; its note the tooltip. */
export type ShapeSetting =
  | { key: string; label: string; kind: 'number'; value: number; min: number; max: number; step: number; unit?: string; note: string }
  | { key: string; label: string; kind: 'choice'; value: string; options: readonly { value: string; label: string }[]; note: string }
  | { key: string; label: string; kind: 'toggle'; value: boolean; note: string };


const num = (key: string, label: string, value: number, min: number, max: number, step: number, note: string, unit?: string): ShapeSetting =>
  ({ key, label, kind: 'number', value, min, max, step, note, ...(unit ? { unit } : {}) });
const sidesSetting = (value = BLOCK_SIDES): ShapeSetting => num('sides', 'Sides', value, 3, 64, 1, 'Segments round it: more is rounder, and more faces');

/**
 * Each shape's settings and where they start (Create's own shapes; a browser adaptation, FG.R2). Stairs: their count
 * (0: one each `STAIR_STEP_RISE_ADAPTATION` of height) and solid or floating; Doorway and Window their openings' size,
 * count and sill; Room its walls, floor and ceiling, and doors and windows on its walls; the round ones their segments.
 */
export const SHAPE_SETTINGS: Record<BlockShape, readonly ShapeSetting[]> = {
  block: [],
  quad: [],
  ramp: [],
  pyramid: [],
  polygon: [],
  cylinder: [sidesSetting()],
  pipe: [sidesSetting(), num('wall', 'Wall', 20, 5, 90, 5, "The pipe's wall, a part of its radius", '%')],
  spike: [sidesSetting()],
  sphere: [sidesSetting(), num('rings', 'Rings', BLOCK_SPHERE_RINGS, 2, 48, 1, 'Rings from pole to pole')],
  torus: [sidesSetting(), num('tubeSides', 'Tube sides', 8, 3, 32, 1, 'Segments round the tube')],
  stairs: [
    num('steps', 'Steps', 0, 0, 64, 1, `How many steps; 0 picks one each ${STAIR_STEP_RISE_ADAPTATION} units of height`),
    { key: 'style', label: 'Style', kind: 'choice', value: 'solid', note: 'Solid to the ground, or each step a floating slab',
      options: [{ value: 'solid', label: 'Solid' }, { value: 'floating', label: 'Floating' }] },
  ],
  ladder: [
    num('rungSpacing', 'Rung spacing', 3, 1, 32, 0.5, 'The height between rungs', 'u'),
    num('railWidth', 'Rail width', 1, 0.25, 8, 0.25, 'Each side rail\'s width', 'u'),
    num('rungThickness', 'Rung thickness', 0.5, 0.1, 4, 0.1, 'Each rung\'s height', 'u'),
  ],
  railing: [
    num('postSpacing', 'Post spacing', 10, 2, 100, 1, 'The run between posts (both ends always have one)', 'u'),
    num('postSize', 'Post size', 1, 0.25, 8, 0.25, 'Each post\'s width', 'u'),
    num('rails', 'Rails', 2, 1, 8, 1, 'How many rails, the top one at the full height'),
    num('railSize', 'Rail size', 0.5, 0.1, 4, 0.1, 'Each rail\'s height', 'u'),
  ],
  column: [
    { key: 'style', label: 'Shaft', kind: 'choice', value: 'round', note: 'A round shaft or a square one',
      options: [{ value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }] },
    sidesSetting(12),
    { key: 'base', label: 'Base', kind: 'toggle', value: true, note: 'A square slab at its foot' },
    { key: 'cap', label: 'Capital', kind: 'toggle', value: true, note: 'A square slab at its top' },
  ],
  arch: [
    num('legs', 'Legs', 20, 5, 45, 1, 'Each leg, a part of the span', '%'),
    num('band', 'Top band', 20, 0, 80, 1, 'The solid band over the opening, a part of the height', '%'),
    num('segments', 'Segments', 12, 3, 48, 1, 'Segments round the opening\'s top'),
  ],
  doorway: [
    num('doors', 'Doors', 1, 1, 8, 1, 'How many doorways, spread evenly along the wall'),
    num('doorWidth', 'Door width', DOOR_WIDTH_ADAPTATION, 1, 400, 1, 'Each doorway\'s width (kept inside the wall)', 'u'),
    num('doorHeight', 'Door height', DOOR_HEIGHT_ADAPTATION, 1, 400, 1, 'Each doorway\'s height (to the top: no lintel)', 'u'),
  ],
  window: [
    num('windows', 'Windows', 1, 1, 12, 1, 'How many windows, spread evenly along the wall'),
    num('windowWidth', 'Width', WINDOW_WIDTH_ADAPTATION, 1, 400, 1, 'Each window\'s width', 'u'),
    num('windowHeight', 'Height', WINDOW_HEIGHT_ADAPTATION, 1, 400, 1, 'Each window\'s height', 'u'),
    num('sill', 'Sill', WINDOW_SILL_ADAPTATION, 0, 400, 1, 'From the floor to the window', 'u'),
  ],
  room: [
    num('wall', 'Wall', WALL_THICKNESS_ADAPTATION, 0.25, 40, 0.25, 'Walls, floor and ceiling, this thick', 'u'),
    { key: 'floor', label: 'Floor', kind: 'toggle', value: true, note: 'A floor slab' },
    { key: 'ceiling', label: 'Ceiling', kind: 'toggle', value: true, note: 'A ceiling slab' },
    num('doors', 'Doors', 1, 0, 4, 1, 'Doorways: one each on the front, back, left and right walls in turn'),
    num('doorWidth', 'Door width', DOOR_WIDTH_ADAPTATION, 1, 400, 1, 'Each doorway\'s width', 'u'),
    num('doorHeight', 'Door height', DOOR_HEIGHT_ADAPTATION, 1, 400, 1, 'Each doorway\'s height', 'u'),
    num('windows', 'Windows', 0, 0, 6, 1, 'Windows on every wall'),
    num('windowWidth', 'Window width', WINDOW_WIDTH_ADAPTATION, 1, 400, 1, 'Each window\'s width', 'u'),
    num('windowHeight', 'Window height', WINDOW_HEIGHT_ADAPTATION, 1, 400, 1, 'Each window\'s height', 'u'),
    num('sill', 'Sill', WINDOW_SILL_ADAPTATION, 0, 400, 1, 'From the floor to each window', 'u'),
  ],
  roof: [
    { key: 'style', label: 'Style', kind: 'choice', value: 'gable', note: 'Gable: two slopes to a ridge along the longer side; shed: one slope',
      options: [{ value: 'gable', label: 'Gable' }, { value: 'shed', label: 'Shed' }] },
  ],
};

/** A shape's settings: its defaults, `given` over them (unknown keys dropped, numbers kept in range). */
export function shapeSettings(shape: BlockShape, given: ShapeSettings = {}): ShapeSettings {
  const out: ShapeSettings = {};
  for (const s of SHAPE_SETTINGS[shape]) {
    const v = given[s.key];
    if (s.kind === 'number') out[s.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.value;
    else if (s.kind === 'choice') out[s.key] = typeof v === 'string' && s.options.some((o) => o.value === v) ? v : s.value;
    else out[s.key] = typeof v === 'boolean' ? v : s.value;
  }
  return out;
}
const n_ = (s: ShapeSettings, k: string, d: number): number => (typeof s[k] === 'number' ? s[k] as number : d);
const b_ = (s: ShapeSettings, k: string, d: boolean): boolean => (typeof s[k] === 'boolean' ? s[k] as boolean : d);
const c_ = (s: ShapeSettings, k: string, d: string): string => (typeof s[k] === 'string' ? s[k] as string : d);

/**
 * A long shape's run: along the frame's z (its v) when the rectangle is at least as long that way, else its x; from the
 * drag's first corner `a` toward `b` (`rev`: down the axis) -- stairs climb that way.
 */
export function stairsRun(a: readonly [number, number], b: readonly [number, number]): { alongZ: boolean; rev: boolean } {
  const alongZ = Math.abs(b[1] - a[1]) >= Math.abs(b[0] - a[0]);
  return { alongZ, rev: alongZ ? b[1] < a[1] : b[0] < a[0] };
}
type Run = { alongZ: boolean; rev: boolean };

/** A ring's normal (Newell's), in the frame's coordinates. */
function ringNormal(points: readonly Vec3[], ring: readonly number[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const p = points[ring[i]!]!, q = points[ring[(i + 1) % ring.length]!]!;
    n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return n;
}

/** A ring wound so its normal points along `out` (points in the frame's coordinates). */
function facing(points: readonly Vec3[], ring: number[], out: Vec3): number[] {
  const n = ringNormal(points, ring);
  return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...ring].reverse() : ring;
}

/** An opening through a wall: along it from `from` to `to`, from `bottom` up to `top`. */
interface Opening { from: number; to: number; bottom: number; top: number }

/**
 * A shape built across a run `r` (0..L, along `run`'s axis, from its first corner), the height `y` and the width `s`
 * (0..W): its points shared, each face wound to face out (`out`, the outward way in r, y, s), a face's repeated points
 * dropped.
 */
function runBuilder(x0: number, x1: number, z0: number, z1: number, run: Run) {
  const L = run.alongZ ? z1 - z0 : x1 - x0, W = run.alongZ ? x1 - x0 : z1 - z0;
  const points: Vec3[] = [];
  const index = new Map<string, number>();
  const at = (r: number, y: number, sw: number): number => {
    const rr = run.rev ? L - r : r;
    const p: Vec3 = run.alongZ ? [x0 + sw, y, z0 + rr] : [x0 + rr, y, z0 + sw];
    const k = p.join(',');
    let i = index.get(k);
    if (i === undefined) { i = points.length; points.push(p); index.set(k, i); }
    return i;
  };
  const dir = (dr: number, dy: number, ds: number): Vec3 => { const r = run.rev ? -dr : dr; return run.alongZ ? [ds, dy, r] : [r, dy, ds]; };
  const rings: number[][] = [];
  const face = (ring: number[], out: Vec3): void => {
    const kept = ring.filter((v, i) => v !== ring[(i + ring.length - 1) % ring.length]);
    if (kept.length < 3) return;
    rings.push(facing(points, kept, out));
  };
  /** A box from (r0, y0, s0) to (r1, y1, s1): its six faces (none when it has no size). */
  const cuboid = (r0: number, r1: number, y0: number, y1: number, s0: number, s1: number): void => {
    if (r1 - r0 < 1e-6 || y1 - y0 < 1e-6 || s1 - s0 < 1e-6) return;
    face([at(r0, y0, s0), at(r1, y0, s0), at(r1, y0, s1), at(r0, y0, s1)], dir(0, -1, 0));
    face([at(r0, y1, s0), at(r1, y1, s0), at(r1, y1, s1), at(r0, y1, s1)], dir(0, 1, 0));
    face([at(r0, y0, s0), at(r0, y1, s0), at(r0, y1, s1), at(r0, y0, s1)], dir(-1, 0, 0));
    face([at(r1, y0, s0), at(r1, y1, s0), at(r1, y1, s1), at(r1, y0, s1)], dir(1, 0, 0));
    face([at(r0, y0, s0), at(r1, y0, s0), at(r1, y1, s0), at(r0, y1, s0)], dir(0, 0, -1));
    face([at(r0, y0, s1), at(r1, y0, s1), at(r1, y1, s1), at(r0, y1, s1)], dir(0, 0, 1));
  };
  /**
   * A wall from `a` to `b` along r (`along` 'r', its thickness `t0`..`t1` across s) or along s (its thickness across r),
   * from `y0` up to `y1`, with `openings` through it: closed slabs round each opening -- full height between them, below
   * and above where one is.
   */
  const wall = (along: 'r' | 's', a: number, b: number, t0: number, t1: number, y0: number, y1: number, openings: readonly Opening[]): void => {
    const slab = (u0: number, u1: number, ya: number, yb: number): void => {
      if (along === 'r') cuboid(u0, u1, ya, yb, t0, t1); else cuboid(t0, t1, ya, yb, u0, u1);
    };
    const cuts = [...new Set([a, b, ...openings.flatMap((o) => [o.from, o.to])].map((v) => Math.min(b, Math.max(a, v))))].sort((p, q) => p - q);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const p = cuts[i]!, q = cuts[i + 1]!;
      const o = openings.find((x) => x.from <= p + 1e-9 && x.to >= q - 1e-9);
      if (!o) { slab(p, q, y0, y1); continue; }
      if (o.bottom > y0 + 1e-6) slab(p, q, y0, Math.min(o.bottom, y1));
      if (o.top < y1 - 1e-6) slab(p, q, Math.max(o.top, y0), y1);
    }
  };
  return { L, W, points, rings, at, dir, face, cuboid, wall };
}

/**
 * `count` openings `width` wide spread evenly along a wall `length` long (`from` its start), from `bottom` to `top`: each
 * kept inside the wall with a little of it either side (`OPENING_JAMB_MIN`), none past its height.
 */
const OPENING_JAMB_MIN = 0.25;
function spread(from: number, length: number, count: number, width: number, bottom: number, top: number, height: number): Opening[] {
  if (count <= 0 || length <= 0) return [];
  const w = Math.max(0, Math.min(width, length / count - 2 * OPENING_JAMB_MIN));
  const b = Math.max(0, Math.min(bottom, height)), t = Math.min(height, Math.max(b, top));
  if (w <= 0 || t - b <= 0) return [];
  return Array.from({ length: count }, (_, i) => { const c = from + (length * (i + 1)) / (count + 1); return { from: c - w / 2, to: c + w / 2, bottom: b, top: t }; });
}

/** Ladder: two rails at the ends of its longer side (`run`), the full depth, rungs between them in the middle half -- each part a closed box. */
function ladderParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const rail = Math.min(n_(s, 'railWidth', 1), b.L / 4);
  b.cuboid(0, rail, 0, h, 0, b.W);
  b.cuboid(b.L - rail, b.L, 0, h, 0, b.W);
  const rh = Math.min(n_(s, 'rungThickness', 0.5), h / 4), gap = Math.max(0.5, n_(s, 'rungSpacing', 4));
  for (let y = gap; y + rh <= h - 1e-6; y += gap) b.cuboid(rail, b.L - rail, y, y + rh, b.W / 4, (3 * b.W) / 4);
  return { points: b.points, rings: b.rings };
}

/** Railing: posts along its longer side (both ends and every post spacing), its rails across them, the top one at the full height. */
function railingParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const ps = Math.min(n_(s, 'postSize', 1), b.L / 2), pw = Math.min(ps, b.W);
  const sMid = b.W / 2;
  const posts = Math.max(1, Math.round(b.L / Math.max(1, n_(s, 'postSpacing', 10))));
  for (let i = 0; i <= posts; i++) {
    const c = (b.L * i) / posts;
    b.cuboid(Math.max(0, c - ps / 2), Math.min(b.L, c + ps / 2), 0, h, sMid - pw / 2, sMid + pw / 2);
  }
  const rails = Math.max(1, Math.round(n_(s, 'rails', 2))), rs = Math.min(n_(s, 'railSize', 0.5), h / (rails + 1));
  const rw = pw * 0.8;
  for (let j = 0; j < rails; j++) {
    const top = (h * (j + 1)) / rails;
    b.cuboid(0, b.L, top - rs, top, sMid - rw / 2, sMid + rw / 2);
  }
  return { points: b.points, rings: b.rings };
}

/** Parts joined: one points list, every ring's indices carried. */
function merge(...parts: Parts[]): Parts {
  const points: Vec3[] = [], rings: number[][] = [];
  for (const p of parts) { const o = points.length; points.push(...p.points); rings.push(...p.rings.map((r) => r.map((i) => i + o))); }
  return { points, rings };
}
/** A box between (x0, y0, z0) and (x1, y1, z1) (`./primitives` `box`'s ring order). */
function boxParts(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Parts {
  return {
    points: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    rings: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [2, 6, 7, 3], [1, 5, 6, 2], [0, 3, 7, 4]],
  };
}
/** An upright elliptic cylinder round (cx, cz), radii rx and rz, from y0 to y1, `n` sides. */
function cylinderParts(cx: number, cz: number, rx: number, rz: number, y0: number, y1: number, n: number): Parts {
  const points: Vec3[] = [];
  for (const y of [y0, y1]) for (let i = 0; i < n; i++) { const th = (2 * Math.PI * i) / n; points.push([cx + rx * Math.cos(th), y, cz + rz * Math.sin(th)]); }
  const r: number[][] = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + (n - 1 - i))];
  for (let i = 0; i < n; i++) r.push([i, n + i, n + ((i + 1) % n), (i + 1) % n]);
  return { points, rings: r };
}

/** Column: a shaft (round, `sides` round; or square), a square base slab and a capital slab when on. */
function columnParts(x0: number, x1: number, z0: number, z1: number, h: number, s: ShapeSettings): Parts {
  const base = b_(s, 'base', true), cap = b_(s, 'cap', true);
  const slab = Math.min(h * 0.08, h / 4);
  const y0 = base ? slab : 0, y1 = cap ? h - slab : h;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, inset = base || cap ? 0.7 : 1;
  const rx = ((x1 - x0) / 2) * inset, rz = ((z1 - z0) / 2) * inset;
  const parts: Parts[] = [];
  if (base) parts.push(boxParts(x0, x1, 0, slab, z0, z1));
  if (cap) parts.push(boxParts(x0, x1, h - slab, h, z0, z1));
  parts.push(c_(s, 'style', 'round') === 'square' ? boxParts(cx - rx, cx + rx, y0, y1, cz - rz, cz + rz)
    : cylinderParts(cx, cz, rx, rz, y0, y1, Math.max(3, Math.round(n_(s, 'sides', 12)))));
  return merge(...parts);
}

/**
 * Arch: a wall along the longer side (`run`), its legs a part of the span each, an opening between them whose top is half
 * an ellipse under a band a part of the height -- one closed solid.
 */
function archParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const { L, W } = b;
  const leg = L * (n_(s, 'legs', 20) / 100), top = h * (n_(s, 'band', 20) / 100);
  const rx = L / 2 - leg, ry = Math.min(rx, h - top), spring = h - top - ry;
  const n = Math.max(3, Math.round(n_(s, 'segments', 12)));
  // The opening's top, from its right foot (r = L - leg) over to its left (r = leg).
  const curve = Array.from({ length: n + 1 }, (_, i) => { const th = (Math.PI * i) / n; return [L / 2 + rx * Math.cos(th), spring + ry * Math.sin(th)] as const; });
  for (const [sw, ds] of [[0, -1], [W, 1]] as const) {
    b.face([b.at(0, 0, sw), b.at(leg, 0, sw), b.at(leg, spring, sw), b.at(leg, h, sw), b.at(0, h, sw)], b.dir(0, 0, ds));
    b.face([b.at(L - leg, 0, sw), b.at(L, 0, sw), b.at(L, h, sw), b.at(L - leg, h, sw), b.at(L - leg, spring, sw)], b.dir(0, 0, ds));
    for (let i = 0; i < n; i++) {
      const [ra, ya] = curve[i]!, [rb, yb] = curve[i + 1]!;
      b.face([b.at(ra, ya, sw), b.at(ra, h, sw), b.at(rb, h, sw), b.at(rb, yb, sw)], b.dir(0, 0, ds));
    }
  }
  const topRun = [0, ...curve.map(([r]) => r).reverse(), L];
  b.face([...topRun.map((r) => b.at(r, h, 0)), ...[...topRun].reverse().map((r) => b.at(r, h, W))], b.dir(0, 1, 0));
  b.face([b.at(0, 0, 0), b.at(0, h, 0), b.at(0, h, W), b.at(0, 0, W)], b.dir(-1, 0, 0));
  b.face([b.at(L, 0, 0), b.at(L, h, 0), b.at(L, h, W), b.at(L, 0, W)], b.dir(1, 0, 0));
  b.face([b.at(0, 0, 0), b.at(leg, 0, 0), b.at(leg, 0, W), b.at(0, 0, W)], b.dir(0, -1, 0));
  b.face([b.at(L - leg, 0, 0), b.at(L, 0, 0), b.at(L, 0, W), b.at(L - leg, 0, W)], b.dir(0, -1, 0));
  if (spring > 1e-6) {
    b.face([b.at(leg, 0, 0), b.at(leg, spring, 0), b.at(leg, spring, W), b.at(leg, 0, W)], b.dir(1, 0, 0));
    b.face([b.at(L - leg, 0, 0), b.at(L - leg, spring, 0), b.at(L - leg, spring, W), b.at(L - leg, 0, W)], b.dir(-1, 0, 0));
  }
  for (let i = 0; i < n; i++) {
    const [ra, ya] = curve[i]!, [rb, yb] = curve[i + 1]!;
    b.face([b.at(ra, ya, 0), b.at(rb, yb, 0), b.at(rb, yb, W), b.at(ra, ya, W)], b.dir(L / 2 - (ra + rb) / 2, spring - (ya + yb) / 2, 0));
  }
  return { points: b.points, rings: b.rings };
}

/** Doorway: a wall along the longer side (`run`) with its doorways through it, floor up. */
function doorwayParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  b.wall('r', 0, b.L, 0, b.W, 0, h, spread(0, b.L, Math.round(n_(s, 'doors', 1)), n_(s, 'doorWidth', DOOR_WIDTH_ADAPTATION), 0, n_(s, 'doorHeight', DOOR_HEIGHT_ADAPTATION), h));
  return { points: b.points, rings: b.rings };
}

/** Window: a wall along the longer side (`run`) with its windows through it, over their sill. */
function windowParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const sill = n_(s, 'sill', WINDOW_SILL_ADAPTATION);
  b.wall('r', 0, b.L, 0, b.W, 0, h, spread(0, b.L, Math.round(n_(s, 'windows', 1)), n_(s, 'windowWidth', WINDOW_WIDTH_ADAPTATION), sill, sill + n_(s, 'windowHeight', WINDOW_HEIGHT_ADAPTATION), h));
  return { points: b.points, rings: b.rings };
}

/**
 * Room: its walls round the dragged volume, `wall` thick, a floor and a ceiling slab when on; its doors one each on the
 * front, back, left and right walls in turn, in the wall's middle; its windows on every wall, spread round the door.
 */
function roomParts(x0: number, x1: number, z0: number, z1: number, h: number, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, { alongZ: false, rev: false });
  const t = Math.min(n_(s, 'wall', WALL_THICKNESS_ADAPTATION), b.L / 4, b.W / 4, h / 4);
  const hasFloor = b_(s, 'floor', true), hasCeiling = b_(s, 'ceiling', true);
  if (hasFloor) b.cuboid(0, b.L, 0, t, 0, b.W);
  if (hasCeiling) b.cuboid(0, b.L, h - t, h, 0, b.W);
  const yb = hasFloor ? t : 0, yt = hasCeiling ? h - t : h, wh = yt - yb;
  const doors = Math.round(n_(s, 'doors', 1)), windows = Math.round(n_(s, 'windows', 0));
  const dw = n_(s, 'doorWidth', DOOR_WIDTH_ADAPTATION), dh = n_(s, 'doorHeight', DOOR_HEIGHT_ADAPTATION);
  const ww = n_(s, 'windowWidth', WINDOW_WIDTH_ADAPTATION), whh = n_(s, 'windowHeight', WINDOW_HEIGHT_ADAPTATION), sill = n_(s, 'sill', WINDOW_SILL_ADAPTATION);
  // A wall's openings: its door (if it has one) in the middle slot, its windows in the rest, all spread evenly.
  const openingsOf = (start: number, length: number, door: boolean): Opening[] => {
    const count = windows + (door ? 1 : 0);
    if (!count) return [];
    const slots = spread(start, length, count, Math.max(dw, ww), 0, 1, 1);
    const mid = Math.floor(count / 2);
    return slots.map((o, i) => {
      const c = (o.from + o.to) / 2;
      const isDoor = door && i === mid;
      const half = Math.min(isDoor ? dw : ww, o.to - o.from) / 2;
      return isDoor ? { from: c - half, to: c + half, bottom: yb, top: Math.min(yt, yb + dh) }
        : { from: c - half, to: c + half, bottom: Math.min(yt, yb + sill), top: Math.min(yt - OPENING_JAMB_MIN, yb + sill + whh) };
    }).filter((o) => o.top > o.bottom);
  };
  // Front and back the full length (along r, across s at either side); left and right between them (along s).
  b.wall('r', 0, b.L, 0, t, yb, yt, openingsOf(0, b.L, doors >= 1));
  b.wall('r', 0, b.L, b.W - t, b.W, yb, yt, openingsOf(0, b.L, doors >= 2));
  b.wall('s', t, b.W - t, 0, t, yb, yt, openingsOf(t, b.W - 2 * t, doors >= 3));
  b.wall('s', t, b.W - t, b.L - t, b.L, yb, yt, openingsOf(t, b.W - 2 * t, doors >= 4));
  void wh;
  return { points: b.points, rings: b.rings };
}

/** Roof: a gable (two slopes up to a ridge along the longer side, `run`) or a shed (one slope across it), solid. */
function roofParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const { L, W } = b;
  b.face([b.at(0, 0, 0), b.at(L, 0, 0), b.at(L, 0, W), b.at(0, 0, W)], b.dir(0, -1, 0));
  if (c_(s, 'style', 'gable') === 'shed') {
    b.face([b.at(0, 0, 0), b.at(L, 0, 0), b.at(L, h, W), b.at(0, h, W)], b.dir(0, W, -h));
    b.face([b.at(0, 0, W), b.at(L, 0, W), b.at(L, h, W), b.at(0, h, W)], b.dir(0, 0, 1));
    b.face([b.at(0, 0, 0), b.at(0, 0, W), b.at(0, h, W)], b.dir(-1, 0, 0));
    b.face([b.at(L, 0, 0), b.at(L, 0, W), b.at(L, h, W)], b.dir(1, 0, 0));
    return { points: b.points, rings: b.rings };
  }
  b.face([b.at(0, 0, 0), b.at(L, 0, 0), b.at(L, h, W / 2), b.at(0, h, W / 2)], b.dir(0, W / 2, -h));
  b.face([b.at(0, 0, W), b.at(L, 0, W), b.at(L, h, W / 2), b.at(0, h, W / 2)], b.dir(0, W / 2, h));
  b.face([b.at(0, 0, 0), b.at(0, 0, W), b.at(0, h, W / 2)], b.dir(-1, 0, 0));
  b.face([b.at(L, 0, 0), b.at(L, 0, W), b.at(L, h, W / 2)], b.dir(1, 0, 0));
  return { points: b.points, rings: b.rings };
}

/** Pyramid: its base the rectangle, its apex `h` over the middle. */
function pyramidParts(x0: number, x1: number, z0: number, z1: number, h: number): Parts {
  const points: Vec3[] = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [(x0 + x1) / 2, h, (z0 + z1) / 2]];
  const mid: Vec3 = [(x0 + x1) / 2, h / 4, (z0 + z1) / 2];
  const rings: number[][] = [facing(points, [0, 1, 2, 3], [0, -1, 0])];
  for (let i = 0; i < 4; i++) {
    const r = [i, (i + 1) % 4, 4];
    const c = [0, 1, 2].map((k) => r.reduce((t, v) => t + points[v]![k]!, 0) / 3);
    rings.push(facing(points, r, [c[0]! - mid[0], c[1]! - mid[1], c[2]! - mid[2]]));
  }
  return { points, rings };
}

/** Pipe: a tube `sides` round, its wall a part of its radius thick, open through. */
function pipeParts(x0: number, x1: number, z0: number, z1: number, h: number, s: ShapeSettings): Parts {
  const n = Math.max(3, Math.round(n_(s, 'sides', BLOCK_SIDES)));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2, k = 1 - n_(s, 'wall', 20) / 100;
  const points: Vec3[] = [];
  const at = (i: number, inner: boolean, y: number): number => {
    const th = (2 * Math.PI * (i % n)) / n, f = inner ? k : 1;
    points.push([cx + rx * f * Math.cos(th), y, cz + rz * f * Math.sin(th)]);
    return points.length - 1;
  };
  const idx: number[][][] = [0, 1].map((inner) => [0, 1].map((top) => Array.from({ length: n }, (_, i) => at(i, inner === 1, top ? h : 0))));
  const P = (inner: number, top: number, i: number): number => idx[inner]![top]![i % n]!;
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * (i + 0.5)) / n, radial: Vec3 = [Math.cos(th) / (rx || 1), 0, Math.sin(th) / (rz || 1)];
    rings.push(facing(points, [P(0, 0, i), P(0, 0, i + 1), P(0, 1, i + 1), P(0, 1, i)], radial));
    rings.push(facing(points, [P(1, 0, i), P(1, 0, i + 1), P(1, 1, i + 1), P(1, 1, i)], [-radial[0], 0, -radial[2]]));
    rings.push(facing(points, [P(0, 1, i), P(0, 1, i + 1), P(1, 1, i + 1), P(1, 1, i)], [0, 1, 0]));
    rings.push(facing(points, [P(0, 0, i), P(0, 0, i + 1), P(1, 0, i + 1), P(1, 0, i)], [0, -1, 0]));
  }
  return { points, rings };
}

/** Torus: a ring `sides` round, its tube `tubeSides` round, the tube as thick as the height (at most half the narrower radius). */
function torusParts(x0: number, x1: number, z0: number, z1: number, h: number, s: ShapeSettings): Parts {
  const n = Math.max(3, Math.round(n_(s, 'sides', BLOCK_SIDES))), m = Math.max(3, Math.round(n_(s, 'tubeSides', 8)));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
  const rt = Math.min(h / 2, Math.min(rx, rz) / 2), Rx = rx - rt, Rz = rz - rt, cy = h / 2;
  const points: Vec3[] = [];
  const centre = (i: number): Vec3 => { const th = (2 * Math.PI * i) / n; return [cx + Rx * Math.cos(th), cy, cz + Rz * Math.sin(th)]; };
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    for (let j = 0; j < m; j++) {
      const ph = (2 * Math.PI * j) / m, out = rt * Math.cos(ph);
      points.push([cx + (Rx + out) * Math.cos(th), cy + rt * Math.sin(ph), cz + (Rz + out) * Math.sin(th)]);
    }
  }
  const P = (i: number, j: number): number => (i % n) * m + (j % m);
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const r = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    const c = [0, 1, 2].map((k) => r.reduce((t, v) => t + points[v]![k]!, 0) / 4);
    const a = centre(i), b = centre(i + 1), mid = [0, 1, 2].map((k) => (a[k]! + b[k]!) / 2);
    rings.push(facing(points, r, [c[0]! - mid[0]!, c[1]! - mid[1]!, c[2]! - mid[2]!]));
  }
  return { points, rings };
}

/**
 * Stairs (their steps: `steps`, 0 one each `STAIR_STEP_RISE_ADAPTATION` of height; solid to the ground, or each a
 * floating slab one rise thick) or their ramp (`ramp`: the one slope their collision is, the disc's stairs colliding as
 * ramps; a Ramp shape too), over [x0, x1] x [z0, z1] up to `h`, climbing along `run`.
 */
function stairParts(x0: number, x1: number, z0: number, z1: number, h: number, run: Run, ramp: boolean, s: ShapeSettings = {}): Parts {
  const b = runBuilder(x0, x1, z0, z1, run);
  const { L, W, at, dir, face } = b;
  if (ramp) {
    face([at(0, 0, 0), at(L, 0, 0), at(L, 0, W), at(0, 0, W)], dir(0, -1, 0));             // bottom
    face([at(L, 0, 0), at(L, h, 0), at(L, h, W), at(L, 0, W)], dir(1, 0, 0));              // back
    face([at(0, 0, 0), at(0, 0, W), at(L, h, W), at(L, h, 0)], dir(-h, L, 0));              // the slope
    face([at(0, 0, 0), at(L, h, 0), at(L, 0, 0)], dir(0, 0, -1));                          // the sides
    face([at(0, 0, W), at(L, 0, W), at(L, h, W)], dir(0, 0, 1));
    return { points: b.points, rings: b.rings };
  }
  const asked = Math.round(n_(s, 'steps', 0));
  const n = asked > 0 ? asked : Math.max(1, Math.round(h / STAIR_STEP_RISE_ADAPTATION));
  const xr = (k: number): number => (L * k) / n, yr = (k: number): number => (h * k) / n;
  if (c_(s, 'style', 'solid') === 'floating') {
    for (let k = 0; k < n; k++) b.cuboid(xr(k), xr(k + 1), yr(k), yr(k + 1), 0, W);
    return { points: b.points, rings: b.rings };
  }
  for (let k = 0; k < n; k++) {
    face([at(xr(k), yr(k), 0), at(xr(k), yr(k), W), at(xr(k), yr(k + 1), W), at(xr(k), yr(k + 1), 0)], dir(-1, 0, 0));   // riser
    face([at(xr(k), yr(k + 1), 0), at(xr(k), yr(k + 1), W), at(xr(k + 1), yr(k + 1), W), at(xr(k + 1), yr(k + 1), 0)], dir(0, 1, 0));   // tread
    // Each side a column a step (convex), its left edge through the step below's corner so the columns meet edge to edge.
    for (const [sw, ds] of [[0, -1], [W, 1]] as const) {
      const col = [at(xr(k), 0, sw), at(xr(k + 1), 0, sw), at(xr(k + 1), yr(k + 1), sw), at(xr(k), yr(k + 1), sw)];
      if (k > 0) col.push(at(xr(k), yr(k), sw));
      face(col, dir(0, 0, ds));
    }
  }
  // The bottom through every column's foot, so it meets the sides edge to edge; the back.
  const foot = (sw: number): number[] => Array.from({ length: n + 1 }, (_, k) => at(xr(k), 0, sw));
  face([...foot(0), ...foot(W).reverse()], dir(0, -1, 0));
  face([at(L, 0, 0), at(L, h, 0), at(L, h, W), at(L, 0, W)], dir(1, 0, 0));
  return { points: b.points, rings: b.rings };
}

/**
 * A plane's frame: its `origin`, `u` and `v` across it and `n` up out of it -- unit and right-handed (u x n = v), so a
 * shape built counter-clockwise from outside in the frame stays so in the world.
 */
export interface BlockFrame { origin: Vec3; u: Vec3; n: Vec3; v: Vec3 }

/** The point at frame coordinates `x` (along u), `y` (along n), `z` (along v). */
export const frameToWorld = (f: BlockFrame, x: number, y: number, z: number): Vec3 =>
  add(add(add(f.origin, scale(f.u, x)), scale(f.n, y)), scale(f.v, z));

/** A world point's frame coordinates [along u, along n, along v]. */
export function worldToFrame(f: BlockFrame, p: Vec3): Vec3 {
  const d = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  const dot = (a: Vec3): number => a[0] * d[0]! + a[1] * d[1]! + a[2] * d[2]!;
  return [dot(f.u), dot(f.n), dot(f.v)];
}

/** A shape's points (in the frame: x along u, y along n, z along v) and its faces (point rings, CCW from outside). */
interface Parts { points: Vec3[]; rings: number[][]; smooth?: { centre: Vec3; radii: Vec3 } }

/**
 * The shape over the rectangle [x0, x1] x [z0, z1] and up to `h` along the normal (`h` > 0; a pull the other way is
 * the same shape mirrored, `blockParts`), by its settings `s`.
 */
function partsUp(shape: BlockShape, x0: number, x1: number, z0: number, z1: number, h: number, run: Run, s: ShapeSettings): Parts {
  switch (shape) {
    case 'stairs': return stairParts(x0, x1, z0, z1, h, run, false, s);
    case 'ramp': return stairParts(x0, x1, z0, z1, h, run, true);
    case 'ladder': return ladderParts(x0, x1, z0, z1, h, run, s);
    case 'railing': return railingParts(x0, x1, z0, z1, h, run, s);
    case 'column': return columnParts(x0, x1, z0, z1, h, s);
    case 'arch': return archParts(x0, x1, z0, z1, h, run, s);
    case 'doorway': return doorwayParts(x0, x1, z0, z1, h, run, s);
    case 'window': return windowParts(x0, x1, z0, z1, h, run, s);
    case 'room': return roomParts(x0, x1, z0, z1, h, s);
    case 'roof': return roofParts(x0, x1, z0, z1, h, run, s);
    case 'pyramid': return pyramidParts(x0, x1, z0, z1, h);
    case 'polygon': return boxParts(x0, x1, 0, h, z0, z1);
    case 'pipe': return pipeParts(x0, x1, z0, z1, h, s);
    case 'torus': return torusParts(x0, x1, z0, z1, h, s);
    default: break;
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
  if (shape === 'quad') {
    // Facing up: (x0, z0), (x0, z1), (x1, z1), (x1, z0) -- `./primitives` `plane`'s order.
    return { points: [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], rings: [[0, 1, 2, 3]] };
  }
  if (shape === 'block') return boxParts(x0, x1, 0, h, z0, z1);
  const n = Math.max(3, Math.round(n_(s, 'sides', BLOCK_SIDES)));
  if (shape === 'cylinder') return cylinderParts(cx, cz, rx, rz, 0, h, n);
  if (shape === 'spike') {
    const points: Vec3[] = [];
    for (let i = 0; i < n; i++) { const th = (2 * Math.PI * i) / n; points.push([cx + rx * Math.cos(th), 0, cz + rz * Math.sin(th)]); }
    points.push([cx, h, cz]);
    const r: number[][] = [Array.from({ length: n }, (_, i) => i)];
    for (let i = 0; i < n; i++) r.push([i, n, (i + 1) % n]);
    return { points, rings: r };
  }
  // A sphere filling the box: an ellipsoid, `n` round and `rings` pole to pole (`./primitives` `sphere`'s layout).
  const rng = Math.max(2, Math.round(n_(s, 'rings', BLOCK_SPHERE_RINGS)));
  const ry = h / 2;
  const points: Vec3[] = [[cx, h, cz]];
  for (let r = 1; r < rng; r++) {
    const phi = (Math.PI * r) / rng;
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      points.push([cx + rx * Math.sin(phi) * Math.cos(th), ry + ry * Math.cos(phi), cz + rz * Math.sin(phi) * Math.sin(th)]);
    }
  }
  const bottom = points.length;
  points.push([cx, 0, cz]);
  const at = (r: number, i: number): number => 1 + (r - 1) * n + (i % n);
  const faces: number[][] = [];
  for (let i = 0; i < n; i++) faces.push([0, at(1, i + 1), at(1, i)]);
  for (let r = 1; r < rng - 1; r++) for (let i = 0; i < n; i++) faces.push([at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r + 1, i)]);
  for (let i = 0; i < n; i++) faces.push([bottom, at(rng - 1, i), at(rng - 1, i + 1)]);
  return { points, rings: faces, smooth: { centre: [cx, ry, cz], radii: [rx, ry, rz] } };
}

/**
 * The shape's points in the world and its faces: over the frame rectangle between corners `a` and `b` ([along u, along
 * v]) and `h` along the normal -- a negative `h` the shape mirrored under the plane (its faces turned so they still face
 * out) -- by its settings (`shapeSettings`). A quad ignores `h`; `ramp` makes stairs' ramp in their place.
 */
export function blockParts(shape: BlockShape, f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number,
  settings: ShapeSettings = {}, run: Run = stairsRun(a, b), ramp = false): { points: Vec3[]; rings: number[][]; smooth?: { centre: Vec3; radii: Vec3; flip: boolean } } {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const down = shape !== 'quad' && h < 0;
  const s = shapeSettings(shape, settings);
  const p = ramp ? stairParts(x0, x1, z0, z1, Math.abs(h), run, true) : partsUp(shape, x0, x1, z0, z1, Math.abs(h), run, s);
  const points = p.points.map(([x, y, z]) => frameToWorld(f, x, down ? -y : y, z));
  // Mirrored through the plane: each ring reversed, so its faces still wind counter-clockwise from outside.
  const out = down ? p.rings.map((r) => [...r].reverse()) : p.rings;
  return { points, rings: out, ...(p.smooth ? { smooth: { ...p.smooth, flip: down } } : {}) };
}

/** The extent below which a drag or a pull makes nothing (game units): a click, not a shape. */
export const BLOCK_MIN_EXTENT = 1e-3;
/** Create's menu's hover preview: this many game units a side (a browser adaptation, no original). */
export const BLOCK_PREVIEW_SIZE_ADAPTATION = 20;

/** Whether the rectangle and the height make a shape (a quad needs no height). */
export function blockMakes(shape: BlockShape, a: readonly [number, number], b: readonly [number, number], h: number): boolean {
  const flat = Math.abs(a[0] - b[0]) > BLOCK_MIN_EXTENT && Math.abs(a[1] - b[1]) > BLOCK_MIN_EXTENT;
  return flat && (shape === 'quad' || Math.abs(h) > BLOCK_MIN_EXTENT);
}

/** The shape as a mesh in the world, by its settings, textured as `opts` says; a sphere shaded smooth (each corner its ellipsoid normal). */
export function blockMesh(shape: BlockShape, f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number, opts: PrimitiveOptions,
  run: Run = stairsRun(a, b), settings: ShapeSettings = {}): EditMesh {
  const parts = blockParts(shape, f, a, b, h, settings, run);
  const m = meshOf(parts.points, parts.rings, opts);
  const sm = parts.smooth;
  if (sm) {
    for (let c = 0; c < m.cVert.length; c++) {
      const v = m.cVert[c]!;
      const local = worldToFrame(f, [m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!]);
      const y = sm.flip ? -local[1] : local[1];
      // The ellipsoid's gradient at the point, in the frame, then into the world.
      const g: Vec3 = [(local[0] - sm.centre[0]) / (sm.radii[0] ** 2 || 1), (y - sm.centre[1]) / (sm.radii[1] ** 2 || 1), (local[2] - sm.centre[2]) / (sm.radii[2] ** 2 || 1)];
      const w = add(add(scale(f.u, g[0]), scale(f.n, sm.flip ? -g[1] : g[1])), scale(f.v, g[2]));
      const len = Math.hypot(w[0], w[1], w[2]) || 1;
      m.cNormal.splice(c * 3, 3, w[0] / len, w[1] / len, w[2] / len);
    }
  }
  return m;
}

/**
 * Stairs' collision: the ramp from the foot of the first step to the top of the last, as wide and as deep -- one slope,
 * not the steps (the owner, 2026-11-17: "a smooth collision box for it (not jagged)"; the disc's stairs collide as ramps,
 * `./hullGeometry` `COLLISION_TYPES`' floor note). Its faces' collision words by their slope, as any made collision's.
 */
export function stairsRampMesh(f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number, opts: PrimitiveOptions,
  run: Run = stairsRun(a, b)): EditMesh {
  const parts = blockParts('stairs', f, a, b, h, {}, run, true);
  return meshOf(parts.points, parts.rings, opts);
}

/**
 * The Polygon tool's outline cleaned (the owner, 2026-11-17: "add the polygon tool similar to how hammer does it in
 * geometry mode ... create custom shapes by drawing them line by line"; a browser adaptation, after Source 2 Hammer's
 * Polygon tool): its points in the plane's frame ([along u, along v]), a point the same as the one before dropped (and
 * the last where it closes on the first), a point on the straight line between its neighbours dropped.
 */
export function cleanOutline(pts: readonly (readonly [number, number])[]): [number, number][] {
  const same = (a: readonly [number, number], b: readonly [number, number]): boolean => Math.abs(a[0] - b[0]) < BLOCK_MIN_EXTENT && Math.abs(a[1] - b[1]) < BLOCK_MIN_EXTENT;
  let out: [number, number][] = [];
  for (const p of pts) if (!out.length || !same(out[out.length - 1]!, p)) out.push([p[0], p[1]]);
  while (out.length > 1 && same(out[0]!, out[out.length - 1]!)) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]!, b = out[i]!, c = out[(i + 1) % out.length]!;
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < BLOCK_MIN_EXTENT * BLOCK_MIN_EXTENT) { out = out.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return out;
}

/** Whether the closed outline crosses itself (two of its sides that are not neighbours meet): no polygon then. */
export function outlineCrosses(pts: readonly (readonly [number, number])[]): boolean {
  const n = pts.length;
  const cross2 = (o: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;          // neighbours share a corner
    const a = pts[i]!, b = pts[(i + 1) % n]!, c = pts[j]!, d = pts[(j + 1) % n]!;
    const d1 = cross2(c, d, a), d2 = cross2(c, d, b), d3 = cross2(a, b, c), d4 = cross2(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}

/**
 * The Polygon tool's shape: the outline `pts` (in frame `f`, [along u, along v], closed, not crossing itself) pulled `h`
 * along the plane's normal -- a prism, its top and bottom the outline (concave or not), a side a quad each edge, every
 * face facing out; `h` 0 leaves the outline a single flat face facing up the normal. A negative `h` is the same under
 * the plane. Textured as `opts` says.
 */
export function polygonMesh(f: BlockFrame, pts: readonly (readonly [number, number])[], h: number, opts: PrimitiveOptions): EditMesh {
  const n = pts.length;
  const down = h < 0, H = Math.abs(h);
  const flat = H <= BLOCK_MIN_EXTENT;
  const local: Vec3[] = [...pts.map(([x, z]) => [x, 0, z] as Vec3), ...(flat ? [] : pts.map(([x, z]) => [x, H, z] as Vec3))];
  // Inside the outline (even-odd): which way a side faces out.
  const inside = (x: number, z: number): boolean => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, zi] = pts[i]!, [xj, zj] = pts[j]!;
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const rings: number[][] = [];
  if (flat) rings.push(facing(local, Array.from({ length: n }, (_, i) => i), [0, 1, 0]));
  else {
    rings.push(facing(local, Array.from({ length: n }, (_, i) => i), [0, -1, 0]));
    rings.push(facing(local, Array.from({ length: n }, (_, i) => n + i), [0, 1, 0]));
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const [ax, az] = pts[i]!, [bx, bz] = pts[k]!;
      const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez) || 1;
      const px = -ez / len, pz = ex / len;                           // across the side
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, eps = Math.max(1e-3, len * 1e-3);
      const out: Vec3 = inside(mx + px * eps, mz + pz * eps) ? [-px, 0, -pz] : [px, 0, pz];
      rings.push(facing(local, [i, k, n + k, n + i], out));
    }
  }
  const points = local.map(([x, y, z]) => frameToWorld(f, x, down ? -y : y, z));
  return meshOf(points, down ? rings.map((r) => [...r].reverse()) : rings, opts);
}
