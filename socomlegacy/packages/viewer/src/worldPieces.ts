import { flattenScene, toColumnMajor, type PlacedModel, type SceneNode } from '@s2u/scene';

/**
 * Level-piece ids for the test-room model pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`).
 *
 * A piece is one direct child of the `worldmodel` root — the same top-level node `flattenScene` draws as an atom —
 * in the order that child is stored on the disc. The whole subtree is one piece, so repeating names under it
 * (`wall` under every `building_wc2`) are not separate keys. The GLB replaces that piece's draw. Collision, the
 * grid, doors and every other piece are not this module's.
 *
 * The key, compared without case:
 *
 * - `world:<name>` — that direct child, only when the name occurs once. A repeated name matches nothing, so one id
 *   cannot replace every sibling that shares it.
 * - `world:<name>#<n>` — the nth direct child with that name, `n` from 0, in the disc's child order. Desert Glory's
 *   eight `building_wc2` nodes are `world:building_wc2#0` through `#7`. The ordinal is that sibling order, so it
 *   stays put for a given disc map.
 *
 * When the name occurs once, `world:<name>` and `world:<name>#0` are the same piece. The canonical id always
 * carries the ordinal (`world:<name>#<n>`), spelled with the node's own name.
 */

const WORLD_ROOT = 'worldmodel';
/** How many piece ids one load will honour. The pack itself names at most this many models. */
const PIECE_REQUEST_CAP = 128;

export interface WorldPieceInfo {
  /** Canonical id, `world:<name>#<ordinal>`. This is what `models.json` copies. */
  key: string;
  name: string;
  /** 0-based index among the worldmodel's direct children, disc order. */
  index: number;
  /** 0-based index among direct children that share `name`. */
  ordinal: number;
  /** World-space origin of the direct child (the anchor's translation). */
  pivot: [number, number, number];
}

/** A piece the load is leaving out of the merged world draw, plus where its GLB sits. */
export interface WorldPieceSwap {
  /** The `models.json` id that selected it, in the pack's spelling, so the clone looks the id up. */
  id: string;
  key: string;
  name: string;
  index: number;
  ordinal: number;
  /** Column-major world matrix of the direct child. The same layout as a prop's instance root. */
  anchor: Float32Array;
  pivot: [number, number, number];
  /** Earliest walk order among the piece's draws, so the GLB sits where the building did. */
  order: number;
  /** The grid cells those draws were filed in. */
  cells: number[];
}

export interface WorldPiecePlan {
  /** Parallel to the world placements: true when that placement's triangles stay out of the merge. */
  drop: boolean[];
  /** Parallel to the world placements: the catalog index, or null for the root's own visuals. */
  pieceIndex: (number | null)[];
  swaps: Omit<WorldPieceSwap, 'order' | 'cells'>[];
  list: WorldPieceInfo[];
  notes: string[];
  /**
   * #432, taken over (OT.R69; the merge controller's call): the requested ids left on the disc's draw because the piece
   * moves or breaks -- an alternate state or a switch path -- so its GLB would stand still and whole while the door opens
   * or the wall breaks. The pack's status line names them.
   */
  keptMoving: string[];
  /**
   * The takeover's review F1: the requested ids left alone because the piece has no world draw of its own -- it draws
   * only props or billboards, or nothing (a door, a breakable
   * crate, the lights) -- no world draw to leave out, so a GLB would stand on top of a prop that still draws, swings or
   * breaks. Map the prop's model name instead. The pack's status line names them.
   */
  keptPropsOnly: string[];
}

/** What a map-load request may add. World ids are sent only while a pack is active; the list is separate. */
export interface WorldPieceLoadRequest {
  worldPieces?: readonly string[];
  listWorldPieces?: true;
}

interface CatalogPiece extends WorldPieceInfo {
  anchor: Float32Array;
  /** Visual-bearing world placements under this child, facades excluded. */
  visuals: number;
}

interface TaggedPlacement {
  path: string;
  index: number | null;
  tx: number;
  ty: number;
  tz: number;
}

/** True when `id` is a level-piece key (`world:`), whatever follows it. */
export function isWorldPieceId(id: string): boolean {
  return id.trim().toLowerCase().startsWith('world:');
}

/**
 * A pack id that is only the node's name (`g47`) is used as a prop or weapon name, so a world piece of that name
 * is not swapped. One line per such id, naming the key to copy. A prop name that is not a world node is quiet, and
 * so is an id that already starts with `world:`.
 */
export function bareWorldPieceWarnings(
  packIds: readonly string[],
  pieces: readonly Pick<WorldPieceInfo, 'name' | 'key'>[],
): string[] {
  const lines: string[] = [];
  for (const id of packIds) {
    if (isWorldPieceId(id)) continue;
    const name = id.trim().toLowerCase();
    if (name.length === 0) continue;
    const hits = pieces.filter((piece) => piece.name.toLowerCase() === name);
    if (hits.length === 0) continue;
    const use = hits.map((piece) => `"${piece.key}"`).join(' or ');
    lines.push(`Model pack: "${id}" matches a world piece by name only, so the original stays. Use ${use}.`);
  }
  return lines;
}

/**
 * `world:<name>` or `world:<name>#<n>`. `ordinal` null is the bare name (unique children only). Null when the
 * text is not that shape.
 */
export function parseWorldPieceKey(id: string): { name: string; ordinal: number | null } | null {
  const raw = id.trim();
  if (raw.length < 6 || raw.slice(0, 6).toLowerCase() !== 'world:') return null;
  const body = raw.slice(6);
  if (body.length === 0) return null;
  const hash = body.lastIndexOf('#');
  if (hash < 0) return { name: body, ordinal: null };
  const name = body.slice(0, hash);
  const digits = body.slice(hash + 1);
  if (name.length === 0 || !/^\d+$/.test(digits)) return null;
  const ordinal = Number(digits);
  if (!Number.isSafeInteger(ordinal)) return null;
  return { name, ordinal };
}

/** One id per line, canonical, so a pack author can copy it into `models.json`. */
export function formatWorldPieceList(list: readonly Pick<WorldPieceInfo, 'key'>[]): string {
  return list.map((piece) => piece.key).join('\n');
}

/**
 * #432 (OT.R69): the pack's line for the requested pieces kept on the disc's draw -- those that move or break
 * (`keptMoving`) and those with no world draw of their own (`keptPropsOnly`, the review's F1); '' when none.
 */
export function worldPiecesKeptLine(moving: readonly string[] | undefined, propsOnly: readonly string[] = []): string {
  const part = (ids: readonly string[], one: string, many: string): string =>
    ids.length === 0 ? '' : `${ids.length} piece${ids.length === 1 ? '' : 's'} kept: ${ids.length === 1 ? one : many} (${ids.join(', ')}).`;
  return [
    part(moving ?? [], 'it moves or breaks', 'they move or break'),
    part(propsOnly, 'it has no world draw of its own (props or billboards only)', 'they have no world draw of their own (props or billboards only)'),
  ].filter(Boolean).join(' ');
}

/**
 * The fields added to a `load` request. Mapped world ids go out only when `packActive` is true. `list` asks for
 * the catalog and does not, by itself, omit any draw.
 */
export function worldPieceLoadRequest(packActive: boolean, mappedIds: readonly string[], list: boolean): WorldPieceLoadRequest {
  const worldPieces = packActive ? mappedIds.filter(isWorldPieceId) : [];
  const out: WorldPieceLoadRequest = {};
  if (worldPieces.length > 0) out.worldPieces = worldPieces;
  if (list) out.listWorldPieces = true;
  return out;
}

/** `worldmodel/<name>` and not a realised prototype (`name=model`). */
function directChild(path: string): boolean {
  if (!path.startsWith(`${WORLD_ROOT}/`)) return false;
  const rest = path.slice(WORLD_ROOT.length + 1);
  return rest.length > 0 && !rest.includes('/') && !rest.includes('=');
}

function inspect(models: readonly SceneNode[]): { catalog: CatalogPiece[]; tagged: TaggedPlacement[] } {
  const flat = flattenScene(models as SceneNode[], WORLD_ROOT);
  const catalog: CatalogPiece[] = [];
  const counts = new Map<string, number>();
  const tagged: TaggedPlacement[] = [];
  let piece = -1;
  for (const inst of flat) {
    if (directChild(inst.path)) {
      const name = inst.node.name;
      const ordinal = counts.get(name.toLowerCase()) ?? 0;
      counts.set(name.toLowerCase(), ordinal + 1);
      const anchor = toColumnMajor(inst.world);
      catalog.push({
        index: catalog.length,
        name,
        ordinal,
        key: `world:${name}#${ordinal}`,
        anchor,
        pivot: [anchor[12]!, anchor[13]!, anchor[14]!],
        visuals: 0,
      });
      piece = catalog.length - 1;
    }
    if (inst.modelName !== WORLD_ROOT || inst.node.visuals <= 0 || inst.facade !== 0) continue;
    if (piece >= 0) catalog[piece]!.visuals += 1;
    tagged.push({
      path: inst.path,
      index: piece < 0 ? null : piece,
      tx: inst.world[12]!,
      ty: inst.world[13]!,
      tz: inst.world[14]!,
    });
  }
  return { catalog, tagged };
}

function samePlace(tag: TaggedPlacement, placed: PlacedModel): boolean {
  return tag.path === placed.path && tag.tx === placed.rowMajor[12] && tag.ty === placed.rowMajor[13] && tag.tz === placed.rowMajor[14];
}

/**
 * Which catalog piece each world placement belongs to. The fast path is the walk's own order (nothing removed
 * between it and `world`). A placement the walk does not have — a turret part joined afterwards — stays null,
 * so it is drawn.
 */
function assignPieceIndex(tagged: readonly TaggedPlacement[], world: readonly PlacedModel[]): (number | null)[] {
  if (tagged.length === world.length && tagged.every((tag, i) => tag.path === world[i]!.path)) {
    return tagged.map((tag) => tag.index);
  }
  let cursor = 0;
  return world.map((placed) => {
    for (let i = cursor; i < tagged.length; i++) {
      if (!samePlace(tagged[i]!, placed)) continue;
      cursor = i + 1;
      return tagged[i]!.index;
    }
    return null;
  });
}

function resolve(catalog: readonly CatalogPiece[], id: string): CatalogPiece | 'ambiguous' | null {
  const parsed = parseWorldPieceKey(id);
  if (!parsed) return null;
  const name = parsed.name.toLowerCase();
  const hits = catalog.filter((piece) => piece.name.toLowerCase() === name);
  if (parsed.ordinal === null) {
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return 'ambiguous';
    return null;
  }
  return hits.find((piece) => piece.ordinal === parsed.ordinal) ?? null;
}

/**
 * Which world placements a pack's piece ids leave out of the merge, and the anchor of each piece. An empty
 * `requested` drops nothing. The models are not modified: the collision walk reads them on its own.
 */
export function planWorldPieces(
  models: readonly SceneNode[], world: readonly PlacedModel[], requested: readonly string[], moves?: (p: PlacedModel) => boolean,
): WorldPiecePlan {
  const { catalog, tagged } = inspect(models);
  const pieceIndex = assignPieceIndex(tagged, world);
  const notes: string[] = [];
  const taken = new Map<number, string>();
  const swaps: WorldPiecePlan['swaps'] = [];
  for (const id of requested) {
    const hit = resolve(catalog, id);
    if (hit === 'ambiguous') {
      const parsed = parseWorldPieceKey(id)!;
      const n = catalog.filter((piece) => piece.name.toLowerCase() === parsed.name.toLowerCase()).length;
      notes.push(`world piece "${id}": ${n} top-level nodes share that name; use world:${parsed.name}#0 through #${n - 1}`);
      continue;
    }
    if (hit === null) {
      notes.push(`world piece "${id}": no top-level world node matches`);
      continue;
    }
    const first = taken.get(hit.index);
    if (first !== undefined) {
      notes.push(`world piece "${id}": the same piece as "${first}", so the first one is used`);
      continue;
    }
    taken.set(hit.index, id);
    swaps.push({
      id, key: hit.key, name: hit.name, index: hit.index, ordinal: hit.ordinal,
      anchor: hit.anchor, pivot: [hit.pivot[0], hit.pivot[1], hit.pivot[2]],
    });
  }
  const matched = new Set(pieceIndex.filter((index): index is number => index !== null));
  // A piece any of whose placements moves or breaks keeps the disc's draw (`keptMoving`).
  const moving = new Set<number>();
  if (moves) world.forEach((p, wi) => { const index = pieceIndex[wi]; if (typeof index === 'number' && moves(p)) moving.add(index); });
  const keptMoving: string[] = [];
  const keptPropsOnly: string[] = [];
  const kept = swaps.filter((swap) => {
    if (moving.has(swap.index)) {
      notes.push(`world piece "${swap.id}": it moves or breaks (an alternate state or a switch path), so the original stays`);
      keptMoving.push(swap.id);
      return false;
    }
    const visuals = catalog[swap.index]?.visuals ?? 0;
    if (visuals === 0) {
      notes.push(`world piece "${swap.id}": it has no world draw of its own (props or billboards only), so nothing is swapped; a prop is mapped by its model name`);
      keptPropsOnly.push(swap.id);
      return false;
    }
    if (matched.has(swap.index)) return true;
    notes.push(`world piece "${swap.id}": its draw was not matched, so the original stays`);
    return false;
  });
  const dropIds = new Set(kept.map((swap) => swap.index));
  return {
    drop: pieceIndex.map((index) => index !== null && dropIds.has(index)),
    pieceIndex,
    swaps: kept,
    list: catalog.map(({ key, name, index, ordinal, pivot }) => ({ key, name, index, ordinal, pivot: [pivot[0], pivot[1], pivot[2]] })),
    notes,
    keptMoving,
    keptPropsOnly,
  };
}

/**
 * The plan for this load, or null when the page did not ask — null is the path the draw has always taken.
 * No scene graph, no plan: the modal fallback draws as before and nothing is swapped.
 */
export function worldPiecePlanFor(
  models: readonly SceneNode[] | undefined,
  world: readonly PlacedModel[],
  options: { worldPieces?: readonly string[]; listWorldPieces?: boolean } | undefined,
  moves?: (p: PlacedModel) => boolean,
): WorldPiecePlan | null {
  const requested = (options?.worldPieces ?? []).filter((id): id is string => typeof id === 'string').slice(0, PIECE_REQUEST_CAP);
  if (requested.length === 0 && options?.listWorldPieces !== true) return null;
  if (!models) return null;
  try {
    return planWorldPieces(models, world, requested, moves);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      drop: world.map(() => false),
      pieceIndex: world.map(() => null),
      swaps: [],
      list: [],
      notes: [`world pieces: ${message}`],
      keptMoving: [],
      keptPropsOnly: [],
    };
  }
}
