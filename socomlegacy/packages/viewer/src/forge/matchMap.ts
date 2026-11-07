import { DEFAULT_GRID_PARAMS, type Grid, type SpawnSlot } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import { groundGrid, type GroundData } from '../mover';
import type { Layout, LayoutSettings, NpcMarker } from './layout';
import { parseAssetId } from './layout';
import { floorGround, standingSpot } from './ground';
import type { AssetDefinition } from '../packs/content/assets';
import { contentPieceHull, type ContentMiss, type ContentResolver } from '../packs/content/collision';
import { doorsAfter } from './hide';
import { nearFor } from './settings';

/**
 * FORGE (the owner, 2026-10-13: "play starts an actual match with our testroom style local match in the forge. The whole
 * game engine and all it's sounds"): the layout as one map the match plays on. A browser adaptation with no original.
 * The match is the front end's own (`../matchMount` `mountMatch`, its world, HUD, firearm, sound, doors and round) on the
 * test room's in-page room (`../net/loopback`), and both read a `LoadedMap`: so the forge composes one --
 *
 * - the base's map as it is, its props and the layout's pieces after them: each prototype one prop entry, its
 *   placements' matrices one after another, drawn by the match's own world builder as the disc's props are;
 * - a piece of another archive brings its parts' textures under `<archive>/<name>` (two archives may name two different
 *   textures alike); its detail and reflection passes stay the base's (a piece's are not carried, said here);
 * - the hull composed by `./ground` (the base's and every piece's own polygons);
 * - FG-31: the base's doors over that hull (`./hide` `doorsAfter`): a hidden placement's owners are gone from it, so each
 *   door's owners are moved to their new places and a hidden one is dropped, as the server's room does (`forgeSimMap.ts`);
 * - the spawn slots the markers make (team A side 0, team B side 1, the facing in the disc's eighth turns), or the
 *   base's own when none is placed;
 * - FG-21: each NPC's marker a slot of its side, at the place the room's classic round start reads for its seat
 *   (`seatSlots`).
 */

export interface PieceSource {
  /** The archive a piece's prototype comes from, decoded. */
  map: LoadedMap;
}

/** The disc's facing step (eighth turns, `SpawnSlot.step`) for a marker's yaw: step k faces (sin 45k, -cos 45k). */
export function stepOfYaw(yaw: number): number {
  return ((Math.round(-yaw / (Math.PI / 4)) % 8) + 8) % 8;
}

/** The unit facing of a step (`facingVector`, research 75 §11). */
const facingOf = (step: number): [number, number] => {
  const a = (step * Math.PI) / 4;
  return [Math.sin(a) + 0, -Math.cos(a) + 0];
};

/**
 * A marker stands on a floor when the highest floor under it (`./ground` `standingSpot`) is within this of its y.
 * The blank floor's drawn plane sits half a unit off the hull, so a marker dropped on it still counts. An adaptation.
 */
export const SPAWN_FLOOR_SLACK = 2;

/** Whether `at` stands on `ground`: the floor under it, within `SPAWN_FLOOR_SLACK` of its y. No floor there is false. */
export function spawnOnFloor(grid: Grid, ground: GroundData, at: readonly [number, number, number]): boolean {
  const spot = standingSpot(grid, ground, [[at[0], at[2]]], at[1] + SPAWN_FLOOR_SLACK);
  if (!spot) return false;
  return Math.abs(spot[0] - at[0]) <= 1e-4 && Math.abs(spot[2] - at[2]) <= 1e-4 && Math.abs(spot[1] - at[1]) <= SPAWN_FLOOR_SLACK;
}

/**
 * The markers as the disc's spawn slots: the side's own index counted from 0. Given the hull, `onFloor` is
 * `spawnOnFloor`; without one it is false -- a marker is not claimed to stand on a floor that was not probed.
 */
export function slotsOfSpawns(spawns: Layout['spawns'], grid?: Grid, ground?: GroundData): SpawnSlot[] {
  const counted = { A: 0, B: 0 };
  return spawns.map((s) => {
    const step = stepOfYaw(s.yaw);
    const onFloor = grid !== undefined && ground !== undefined && spawnOnFloor(grid, ground, s.p);
    return {
      side: s.team === 'A' ? 0 : 1, index: counted[s.team]++, position: [s.p[0], s.p[1], s.p[2]], onFloor,
      step, facing: facingOf(step), loc: { map: 0, x: 0, z: 0 },
    };
  });
}

const sideOfTeam = (t: 'seal' | 'terrorist'): 0 | 1 => (t === 'seal' ? 0 : 1);

/**
 * FG-21: the slots with the NPCs' markers in them. The room's classic round start stands a seat on its side's slots
 * ordered by `index`, at its client index modulo their count (`room.ts` `pick`, `FUN_0052b5c0`: the room's own rule,
 * unchanged); the forge's room seats the player first (client index 0) and NPC i after it (client index i + 1). So a
 * side with NPCs gets one slot per client index up to its last NPC's: each NPC's own marker at its index, the player's
 * start at 0 when the player is on that side, and every other index the side's own starts again (or its first NPC's
 * marker with none). A side with no NPC keeps its slots as they are.
 */
export function seatSlots(slots: readonly SpawnSlot[], npcs: readonly NpcMarker[], player: 'seal' | 'terrorist'): SpawnSlot[] {
  if (npcs.length === 0) return [...slots];
  const out: SpawnSlot[] = [];
  for (const side of [0, 1] as const) {
    const own = slots.filter((s) => s.side === side);
    const mine = npcs.map((n, i) => ({ n, index: i + 1 })).filter((x) => sideOfTeam(x.n.side) === side);
    if (mine.length === 0) { out.push(...own); continue; }
    const marker = (n: NpcMarker, index: number): SpawnSlot => {
      const step = stepOfYaw(n.yaw);
      return { side, index, position: [n.p[0], n.p[1], n.p[2]], onFloor: true, step, facing: facingOf(step), loc: { map: 0, x: 0, z: 0 } };
    };
    const count = mine[mine.length - 1]!.index + 1;
    let spare = 0;
    for (let index = 0; index < count; index++) {
      const npc = mine.find((x) => x.index === index);
      if (npc) { out.push(marker(npc.n, index)); continue; }
      const start = own.length ? own[(index === 0 && sideOfTeam(player) === side ? 0 : spare++) % own.length]! : null;
      out.push(start ? { ...start, index } : marker(mine[0]!.n, index));
    }
  }
  return out;
}

/**
 * FCW-09 (product track; a browser adaptation): a creator pack's piece the resolver answered, for the page to draw with
 * its own loader (the visual is the pack's GLB member, `AssetDefinition.visual`) -- never a disc prop entry. `index` is
 * the piece's place in the layout; its solidity is the hull's (`./ground` `layoutGround`, the same resolver).
 */
export interface ContentPlacement { index: number; def: AssetDefinition; m: number[] }

/**
 * The match's map: `base` with the layout's pieces as props, `ground` as its hull, and the markers' slots (each side
 * given the other's when it has none, the base's when no marker is placed). `libraries` holds every archive a piece
 * names, decoded (the base's among them). A piece whose archive or prototype is missing is left out and counted.
 *
 * FCW-09: a creator pack's piece (`Piece.content`) is never looked up as a disc archive. With `resolveContent` (the
 * resolver `./ground` `layoutGround` was given for `ground`) one it answers is handed back in `content`; one it does not,
 * or every one with no resolver, is left out and counted in `missing` -- as before, when its `pack:` key found no archive.
 * S3b: the drawn pieces take the hull's own rule (`../packs/content/collision` `contentPieceHull`, `pieceYaw`): a piece
 * placed other than by a turn about +Y at unit scale is neither drawn nor solid, counted in `missing` and named in
 * `misses` (`reason` `placement`; an unresolved one `unresolved`), the same `ContentMiss` list `layoutGround` gives.
 */
export function composeMatchMap(base: LoadedMap, layout: Layout, libraries: ReadonlyMap<string, LoadedMap>, ground: GroundData,
  player: 'seal' | 'terrorist' = 'seal', resolveContent: ContentResolver | null = null):
  { map: LoadedMap; missing: number; content: ContentPlacement[]; misses: ContentMiss[] } {
  const props = [...base.props];
  const textures = { ...base.textures };
  const textureFlags = { ...base.textureFlags };
  const textureMips = base.textureMips ? { ...base.textureMips } : undefined;
  let order = props.reduce((m, p) => Math.max(m, p.order), 0) + 1;
  let missing = 0;
  const content: ContentPlacement[] = [];
  const misses: ContentMiss[] = [];
  const byAsset = new Map<string, number[][]>();
  for (const [index, p] of layout.pieces.entries()) {
    if (p.content) {
      const owner = `forge/piece_${index}`;
      const got = contentPieceHull({ owner, content: p.content, m: p.m }, resolveContent);
      if ('missing' in got) { missing++; misses.push({ owner, content: p.content, reason: got.missing }); }
      else content.push({ index, def: got.def, m: [...p.m] });
      continue;
    }
    const list = byAsset.get(p.asset) ?? [];
    list.push(p.m);
    byAsset.set(p.asset, list);
  }
  for (const [asset, matrices] of byAsset) {
    const id = parseAssetId(asset);
    const lib = id ? libraries.get(id.archive) : undefined;
    const proto = lib?.props.find((q) => q.modelName === id!.model && q.parts.length > 0);
    if (!id || !lib || !proto) { missing += matrices.length; continue; }
    const foreign = lib.archive !== base.archive && lib !== base;
    const rename = (name: string | null): string | null => (name === null || !foreign ? name : `${lib.archive}/${name}`);
    const parts = proto.parts.map((part) => {
      if (!foreign) return part;
      const name = part.textureName;
      if (name !== null) {
        const key = rename(name)!;
        if (lib.textures[name]) textures[key] = lib.textures[name]!;
        if (lib.textureFlags[name]) textureFlags[key] = lib.textureFlags[name]!;
        if (textureMips && lib.textureMips?.[name]) textureMips[key] = lib.textureMips[name]!;
      }
      const { reflect: _reflect, ...rest } = part as typeof part & { reflect?: number };
      return { ...rest, textureName: rename(name) };
    });
    const flat = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => flat.set(m, i * 16));
    props.push({ modelName: proto.modelName, parts, matrices: flat, order: order++, alternate: false, facade: proto.facade, lod: null });
  }
  const grid = groundGrid(ground);
  let slots = slotsOfSpawns(layout.spawns, grid, ground);
  if (slots.length === 0) slots = base.slots;
  else {
    // A side with no marker starts where the other side's markers stand (a layout may place one team only).
    for (const side of [0, 1] as const) {
      if (!slots.some((s) => s.side === side)) slots = [...slots, ...slots.filter((s) => s.side !== side).map((s, i) => ({ ...s, side, index: i }))];
    }
  }
  if (layout.npcs?.length) slots = seatSlots(slots, layout.npcs, player);
  // FG-31: `ground` is the base's hull without its hidden owners, the pieces' after them (`layoutGround`), so the doors'
  // owner indices are remapped from the base's own hull onto it.
  const doors = base.doors && base.ground ? doorsAfter(base.ground, ground, base.doors) : base.doors;
  // The placed respawn points (`Layout.respawns`, a browser adaptation): where a side respawns when it has some; a side
  // with none respawns at its slots, as every layout did before.
  let respawns = slots;
  if (layout.respawns?.length) {
    const placed = slotsOfSpawns(layout.respawns, grid, ground);
    respawns = [...placed, ...([0, 1] as const).flatMap((side) => (placed.some((s) => s.side === side) ? [] : slots.filter((s) => s.side === side)))];
  }
  const map: LoadedMap = {
    ...base, props, textures, textureFlags, ...(textureMips ? { textureMips } : {}), ground, slots, respawns,
    ...(doors ? { doors } : {}),
  };
  return { map, missing, content, misses };
}

/**
 * FG-24 (FG.R18; an adaptation, no original): the layout's fog distance on the match's map, before the mount
 * (`../matchCore` `mapFog` reads the camera's `fogEnabled`, `fogNear`, `fogFar`): with `fogFar` set, the camera's far
 * there, its near at the disc's ratio to it (`./settings` `nearFor`), the fog on. The light is not the map's: it is the
 * match's brighten (`./settings` `matchBrightenOf` into `../matchMount` `MatchMountOptions.brighten`), which dims the
 * world, its rig-lit parts and the fog colour together as the editor does -- scaling them here too would dim them twice.
 * Without a fog distance, or on a map with no camera, the map is returned as it is.
 */
export function withSettings(map: LoadedMap, s: Pick<LayoutSettings, 'light' | 'fogFar'>): LoadedMap {
  const c = map.camera;
  if (s.fogFar === null || !c) return map;
  return { ...map, camera: { ...c, fogEnabled: true, fogNear: nearFor(c.fogNear, c.fogFar, s.fogFar), fogFar: s.fogFar } };
}

/**
 * The blank floor's library when the served tree has no archive to lend it (a browser adaptation: no disc bytes). The
 * editor draws its own floor; this map is only what Play's match and the palette's absence need to stand on.
 */
export const BLANK_LIBRARY = 'floor';

export function blankLibraryMap(library: string, floorSize: number): LoadedMap {
  return {
    archive: library,
    camera: null,
    path: `forge/${library}`,
    name: 'Blank floor',
    world: [],
    lines: null,
    props: [],
    textures: {},
    textureFlags: {},
    detail: {},
    metersPerUnit: 0.1,
    lightRig: null,
    origin: [0, 0, 0],
    grid: DEFAULT_GRID_PARAMS,
    collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
    slots: [],
    ground: floorGround(floorSize),
    diagnostics: [],
    loadMs: 0,
    timings: { fetch: 0, decode: 0, postedAt: 0 },
  } as LoadedMap;
}

/** The blank floor's colour in the match: the forge's floor grey (its own, no original), as the vertex colour lights it. */
const FLOOR_GREY = 0.32;

/**
 * The blank floor as the match draws it: one square of `size` at y = 0, the hull's own floor (`./ground` `floorGround`),
 * untextured, in the floor's grey. Without it a blank layout's match stands on a floor nobody sees.
 */
export function floorMesh(size: number): LoadedMap['world'][number] {
  const h = size / 2;
  return {
    positions: new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]),
    uvs: new Float32Array(8),
    colors: new Float32Array(16).fill(FLOOR_GREY).map((v, i) => (i % 4 === 3 ? 1 : v)),
    normals: null, faceNormals: null,
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    textureName: null, fog: true, lit: false, order: 0, orderEnd: 0, cull: false, alternate: false, scroll: null,
  } as unknown as LoadedMap['world'][number];
}
