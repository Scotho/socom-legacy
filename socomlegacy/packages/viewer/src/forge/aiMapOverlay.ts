import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Line, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, Vector3,
} from 'three';
import { aiCellCentre, aiCellIndex, aiCellY, type AiLoc, type AiMaps } from '@s2u/scene';
import { HostagePathPlanner, locateAiCell } from '../../../match/src/hostagePath';

/**
 * The AI map overlay (the owner, 2026-11-12: "Is there any way we can visualize [the nav grid]?"; a browser adaptation,
 * FG.R2 -- the game draws no such thing): every stored cell of the map's `AIMAPS.MPS` (research 75 §4, read by
 * `@s2u/scene` `parseAiMaps`) drawn as a flat tile at its own height (`aiCellY`), coloured by its soil (bits 0-4 of the
 * cell word, named by research 200 §2). It shows the original's data only; nothing here changes what the AI does.
 */

/** A cell's soil: bits 0-4 of its first word (research 200 §2, the SOCOM 1 DWARF's `m_soil`). */
export const aiCellSoil = (word: number): number => word & 0x1f;

/** The soils the planner never enters (research 200 §2: `traversable` false for nogo, clutter, trans, noalt). */
export const AI_BLOCKED_SOILS: ReadonlySet<number> = new Set([0, 8, 9, 10]);

/** The soils' names (research 200 §2, `FUN_005187e0` D:L386089); a soil not named here is the planner's default. */
export const AI_SOIL_NAMES: Readonly<Record<number, string>> = {
  0: 'nogo', 1: 'default', 2: 'water', 3: 'road', 4: 'brush', 5: 'forest', 6: 'climb', 7: 'stairs', 8: 'clutter', 9: 'trans',
  10: 'noalt', 11: 'steep', 12: 'grass', 13: 'collision',
};

/**
 * The overlay's kinds, in the legend's order, with their colours (a browser adaptation's own, no original): walkable
 * ground green, the special soils by kind (stairs blue, climb amber, steep orange, water cyan), the blocked ones red,
 * collision dark red. `note` is what the planner does on it (research 200 §1.2-§1.3).
 */
export type AiSoilKind = 'walkable' | 'stairs' | 'climb' | 'steep' | 'water' | 'blocked' | 'collision';
export const AI_SOIL_KINDS: readonly { kind: AiSoilKind; colour: number; label: string; note: string }[] = [
  { kind: 'walkable', colour: 0x46c46a, label: 'Walkable', note: 'default, road, brush, forest, grass' },
  { kind: 'stairs', colour: 0x4f7fe8, label: 'Stairs', note: 'walked' },
  { kind: 'climb', colour: 0xe0b43c, label: 'Climb', note: 'walked at a higher cost' },
  { kind: 'steep', colour: 0xe07a2c, label: 'Steep', note: 'walked when the height step allows' },
  { kind: 'water', colour: 0x3cc8e0, label: 'Water', note: 'walked at a higher cost' },
  { kind: 'blocked', colour: 0xe0463c, label: 'Blocked', note: 'never entered: nogo, clutter, trans, noalt' },
  { kind: 'collision', colour: 0x8a1f1f, label: 'Collision', note: 'a heavy penalty' },
];

/** A soil's overlay kind. */
export function aiSoilKind(soil: number): AiSoilKind {
  if (AI_BLOCKED_SOILS.has(soil)) return 'blocked';
  switch (soil) {
    case 2: return 'water';
    case 6: return 'climb';
    case 7: return 'stairs';
    case 11: return 'steep';
    case 13: return 'collision';
    default: return 'walkable';      // default, road, brush, forest, grass, the unnamed ones
  }
}

const KIND_COLOUR = new Map(AI_SOIL_KINDS.map((k) => [k.kind, k.colour] as const));
/** A soil's overlay colour. */
export const aiSoilColour = (soil: number): number => KIND_COLOUR.get(aiSoilKind(soil))!;

/** A legend row beyond the soils: the cells placed pieces block, the links (`line`: drawn as a line, not a tile). */
export interface AiLegendExtra {
  colour: number; label: string; note: string; count: number; line: boolean;
  /** A short line of context shown under the row (the legend takes no pointer, so its tooltips never show). */
  hint?: string;
}

/** The colour of a cell a placed piece blocks (`./aiPieceBlock`), and of a link's line: the adaptation's own. */
export const AI_PIECE_BLOCK_COLOUR = 0xc04fe8;
export const AI_LINK_COLOUR = 0xffffff;

/**
 * The cells the layout's pieces block (`./aiPieceBlock` `aiMapsWithPieces`), drawn as tiles of their own colour a little
 * over the soil's, so what the pieces took is told from what the disc blocks.
 */
export function buildAiPieceMarks(cells: readonly { at: readonly [number, number, number] }[], cellSize = 10): { group: Group; dispose(): void } {
  const group = new Group();
  group.name = 'forge ai piece cells';
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ color: AI_PIECE_BLOCK_COLOUR, transparent: true, opacity: 0.7, depthWrite: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  if (cells.length) {
    const mesh = new InstancedMesh(geometry, material, cells.length);
    const m = new Matrix4(), at = new Vector3(), size = new Vector3(cellSize * TILE_FILL, 1, cellSize * TILE_FILL), turn = new Quaternion();
    cells.forEach((c, i) => mesh.setMatrixAt(i, m.compose(at.set(c.at[0], c.at[1] + TILE_LIFT + 0.2, c.at[2]), turn, size)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return { group, dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); for (const c of group.children) (c as InstancedMesh).dispose(); } };
}

/**
 * The links between sub-maps (research 75 §5.3: `{from, to, word}`, each stored at both ends): a line a link, from its
 * cell's floor on one sub-map to its other end's on the next -- where a route may pass from one grid to another.
 */
export function buildAiLinks(ai: AiMaps): { group: Group; count: number; dispose(): void } {
  const group = new Group();
  group.name = 'forge ai links';
  const xyz: number[] = [];
  const seen = new Set<string>();
  const floor = (loc: AiLoc): [number, number, number] | null => {
    const sub = ai.maps[loc.map];
    const i = sub ? aiCellIndex(sub, loc.x, loc.z) : -1;
    if (!sub || i < 0) return null;
    const [x, z] = aiCellCentre(sub, loc.x, loc.z);
    return [x, aiCellY(sub, sub.cells[i]!) + TILE_LIFT + 1, z];
  };
  for (const sub of ai.maps) {
    for (const l of sub.links) {
      const a = `${l.from.map}:${l.from.x}:${l.from.z}`, b = `${l.to.map}:${l.to.x}:${l.to.z}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = floor(l.from), q = floor(l.to);
      if (p && q) xyz.push(...p, ...q);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(xyz, 3));
  const material = new LineBasicMaterial({ color: AI_LINK_COLOUR, depthTest: false, transparent: true, opacity: 0.9 });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  group.add(lines);
  // A ring at each end, so a link whose two ends share a place (a stair's top and the floor above) still shows.
  const ring = new RingGeometry(1.5, 2.5, 16).rotateX(-Math.PI / 2);
  const ringMaterial = new MeshBasicMaterial({ color: AI_LINK_COLOUR, depthTest: false, transparent: true, side: DoubleSide });
  const ends = xyz.length / 3;
  if (ends) {
    const mesh = new InstancedMesh(ring, ringMaterial, ends);
    const m = new Matrix4();
    for (let i = 0; i < ends; i++) mesh.setMatrixAt(i, m.makeTranslation(xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  return {
    group, count: seen.size,
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); ring.dispose(); ringMaterial.dispose(); for (const c of group.children) if (c instanceof InstancedMesh) c.dispose(); },
  };
}

/**
 * The overlay's legend in the viewport (the owner, 2026-11-12: "a little legend in the viewport indicating what each
 * colour means"): a swatch and a word for each kind the map has, its cell count, and what the planner does on it.
 */
export function drawAiMapLegend(host: HTMLElement, counts: ReadonlyMap<AiSoilKind, number>, extras: readonly AiLegendExtra[] = []): void {
  const doc = host.ownerDocument;
  const head = doc.createElement('div');
  head.className = 'fx-ai-legend__head';
  head.textContent = 'AI Navigation';
  const kinds = AI_SOIL_KINDS.filter((k) => (counts.get(k.kind) ?? 0) > 0)
    .map((k): AiLegendExtra => ({ colour: k.colour, label: k.label, note: k.note, count: counts.get(k.kind) ?? 0, line: false }));
  const rows = [...kinds, ...extras.filter((e) => e.count > 0)].flatMap((k) => {
    const row = doc.createElement('div');
    row.className = 'fx-ai-legend__row';
    row.title = `${k.label}: ${k.note}`;
    const swatch = doc.createElement('span');
    swatch.className = `fx-ai-legend__swatch${k.line ? ' is-line' : ''}`;
    swatch.style.background = `#${k.colour.toString(16).padStart(6, '0')}`;
    const label = doc.createElement('span');
    label.textContent = k.label;
    const count = doc.createElement('span');
    count.className = 'fx-ai-legend__count';
    count.textContent = k.count.toLocaleString();
    row.append(swatch, label, count);
    if (!k.hint) return [row];
    const hint = doc.createElement('div');
    hint.className = 'fx-ai-legend__hint';
    hint.textContent = k.hint;
    return [row, hint];
  });
  const foot = doc.createElement('div');
  foot.className = 'fx-ai-legend__foot';
  foot.textContent = 'No tile: outside the grid';
  host.replaceChildren(head, ...rows, foot);
}

/**
 * The cell under a world point (`locateAiCell`, the planner's own lookup: the stored cell under the feet, on the layer
 * nearest below), described for the legend's hover line: its sub-map and place, soil, height and flags. The flags are
 * the cell word's bits 5-8 as research 200 §2 names them (the SOCOM 1 DWARF): occupied, named point, action, link.
 */
export function describeAiCellAt(ai: AiMaps, at: readonly [number, number, number]): string | null {
  const loc = locateAiCell(ai, at);
  if (!loc) return null;
  const sub = ai.maps[loc.map];
  const i = sub ? aiCellIndex(sub, loc.x, loc.z) : -1;
  const word = sub && i >= 0 ? sub.cells[i] : undefined;
  if (!sub || word === undefined) return null;
  const soil = aiCellSoil(word);
  const flags = [[5, 'occupied'], [6, 'named'], [7, 'action'], [8, 'link']].flatMap(([bit, name]) => (word >>> (bit as number)) & 1 ? [name as string] : []);
  return `${sub.name} (${loc.x}, ${loc.z}) · ${AI_SOIL_NAMES[soil] ?? `soil ${soil}`} · y ${aiCellY(sub, word).toFixed(1)}${flags.length ? ` · ${flags.join(', ')}` : ''}`;
}

/** A hostage's start for the route preview: its name and its feet. */
export interface AiRouteStart { name: string; at: readonly [number, number, number] }
/** An extraction zone for the route preview: its name and the cell its route aims for (its middle). */
export interface AiRouteGoal { name: string; loc: AiLoc }
/** One start's route: the cheapest to any goal, or why there is none. */
export interface AiRoute { start: string; goal: string | null; cost: number; points: number; why: string | null }

/** Each extraction zone (kind 1, research 237 §0) of the map's own, aimed at its middle cell (`zoneCentre`'s cell). */
export function aiMapZoneGoals(ai: AiMaps): AiRouteGoal[] {
  return ai.maps.flatMap((sub) => sub.zones.filter((z) => z.kind === 1).map((z) => ({
    name: z.name, loc: { map: sub.index, x: z.corner.x + (z.width >> 1), z: z.corner.z + (z.height >> 1) },
  })));
}

/** A placed extraction zone's goal: the cell under its middle (`locateAiCell`), or null off the grid. */
export function aiGoalAt(ai: AiMaps, name: string, at: readonly [number, number, number]): AiRouteGoal | null {
  const loc = locateAiCell(ai, [at[0], at[1] + 1, at[2]]);
  return loc ? { name, loc } : null;
}

const ROUTE_LIFT = 2;
const ROUTE_OK = 0xf4d35e;
const ROUTE_NONE = 0xff3b30;

/**
 * The route preview (the owner, 2026-11-12): each start's route to the cheapest goal by the hostage planner
 * (`HostagePathPlanner.plan`, research 200/333: the A*, its BASIC costs and its smoothing, no budget), drawn as a line
 * through its waypoints over the tiles; a start with no route gets a red ring. The planner's own runtime obstacles
 * (moving bodies) are not modelled here: the map's cells alone.
 */
export function buildAiRoutes(ai: AiMaps, starts: readonly AiRouteStart[], goals: readonly AiRouteGoal[]): { group: Group; routes: AiRoute[]; dispose(): void } {
  const group = new Group();
  group.name = 'forge ai routes';
  const planner = new HostagePathPlanner(ai);
  const okLine = new LineBasicMaterial({ color: ROUTE_OK, depthTest: false, transparent: true });
  const ring = new RingGeometry(3, 5, 24).rotateX(-Math.PI / 2);
  const ringOk = new MeshBasicMaterial({ color: ROUTE_OK, depthTest: false, transparent: true, side: DoubleSide });
  const ringNone = new MeshBasicMaterial({ color: ROUTE_NONE, depthTest: false, transparent: true, side: DoubleSide });
  const geometries: BufferGeometry[] = [];
  const routes: AiRoute[] = [];
  const mark = (at: readonly [number, number, number], ok: boolean): void => {
    const m = new Mesh(ring, ok ? ringOk : ringNone);
    m.position.set(at[0], at[1] + ROUTE_LIFT, at[2]);
    m.renderOrder = 3;
    group.add(m);
  };
  for (const s of starts) {
    const from = locateAiCell(ai, s.at);
    if (!from) { routes.push({ start: s.name, goal: null, cost: 0, points: 0, why: 'not on the grid' }); mark(s.at, false); continue; }
    let best: { goal: string; path: NonNullable<ReturnType<HostagePathPlanner['plan']>> } | null = null;
    for (const g of goals) {
      const path = planner.plan(from, g.loc);
      if (path && (!best || path.cost < best.path.cost)) best = { goal: g.name, path };
    }
    if (!best) { routes.push({ start: s.name, goal: null, cost: 0, points: 0, why: goals.length ? 'no route' : 'no extraction zone' }); mark(s.at, false); continue; }
    const xyz = best.path.points.flatMap((p) => { const [x, y, z] = planner.point(p); return [x, y + ROUTE_LIFT, z]; });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(xyz, 3));
    geometries.push(geometry);
    const line = new Line(geometry, okLine);
    line.renderOrder = 3;
    line.frustumCulled = false;
    group.add(line);
    mark(s.at, true);
    routes.push({ start: s.name, goal: best.goal, cost: best.path.cost, points: best.path.points.length, why: null });
  }
  return {
    group, routes,
    dispose() { group.removeFromParent(); for (const g of geometries) g.dispose(); ring.dispose(); okLine.dispose(); ringOk.dispose(); ringNone.dispose(); },
  };
}

/** The legend's route lines: each start, where its route goes and its cost, or why it has none. */
export function drawAiRouteLegend(host: HTMLElement, routes: readonly AiRoute[]): void {
  const doc = host.ownerDocument;
  host.replaceChildren(...routes.map((r) => {
    const row = doc.createElement('div');
    row.className = `fx-ai-legend__route${r.why ? ' is-none' : ''}`;
    row.textContent = r.why ? `${r.start}: ${r.why}` : `${r.start} → ${r.goal} · cost ${r.cost} · ${r.points} pts`;
    return row;
  }));
  host.hidden = routes.length === 0;
}

/** How much of a cell its tile covers (the rest a gap, so the grid's lines show), and its lift off the floor (units). */
const TILE_FILL = 0.86;
const TILE_LIFT = 0.6;
const TILE_OPACITY = 0.42;

/** The overlay for `ai`: a group of one instanced mesh a sub-map. `dispose` lets its geometry and materials go. */
export function buildAiMapOverlay(ai: AiMaps): { group: Group; cells: number; counts: ReadonlyMap<AiSoilKind, number>; dispose(): void } {
  const counts = new Map<AiSoilKind, number>();
  const group = new Group();
  group.name = 'forge ai map';
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: TILE_OPACITY, depthWrite: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new Matrix4(), at = new Vector3(), size = new Vector3(), turn = new Quaternion(), colour = new Color();
  let cells = 0;
  for (const sub of ai.maps) {
    if (sub.cells.length === 0) continue;
    const mesh = new InstancedMesh(geometry, material, sub.cells.length);
    mesh.name = `ai map ${sub.name}`;
    size.set(sub.cellSize[0] * TILE_FILL, 1, sub.cellSize[1] * TILE_FILL);
    sub.rows.forEach((row, z) => {
      for (let x = row.x0; x < row.x1; x++) {
        const i = row.first + x - row.x0;
        const word = sub.cells[i];
        if (word === undefined) continue;
        const [cx, cz] = aiCellCentre(sub, x, z);
        at.set(cx, aiCellY(sub, word) + TILE_LIFT, cz);
        mesh.setMatrixAt(i, m.compose(at, turn, size));
        const kind = aiSoilKind(aiCellSoil(word));
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
        mesh.setColorAt(i, colour.setHex(KIND_COLOUR.get(kind)!));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    cells += sub.cells.length;
  }
  return {
    group, cells, counts,
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); for (const c of group.children) (c as InstancedMesh).dispose(); },
  };
}
