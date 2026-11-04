import { probeGround } from '@s2u/scene';
import type { LoadedMap } from '../../loadMap';
import { groundGrid } from '../../mover';
import { standingSpot } from '../../forge/ground';
import { archiveStem, BOMB_SITE_REACH } from '../../forge/layout';
import { checkRecord, layoutOfRecord, recordOfLayout, type LayoutRecord, type PieceRow } from '../../forge/record';
import { checkMap } from '../../forge/validate';
import type { ForgeAgentActionResult } from '../../forge/agent/api';
import { plantSite } from '../../net/objective';

/** Authored browser adaptations. These choices build creator examples, never describe retail maps or change rules. */
export const STARTERS = [
  { id: 'arena', title: 'Campaign cover arena', description: 'Cover and two team starts in the loaded campaign room. Suppression rules; paintball rules are not supplied.', requirements: ['Loaded campaign archive', 'Solid cover prototype', 'Safe team floors and clear placement'] },
  { id: 'crate-stack', title: 'Crate staircase', description: 'Three steps, sized from the selected prototype’s actual collision bounds. Test traversal in normal Play.', requirements: ['Loaded map', 'Solid crate with a ground surface', 'Clear floor for the complete stack'] },
  { id: 'frostfire-trees', title: 'Frostfire tree remix', description: 'Add three inspected tree prototypes to Frostfire. Whole prototypes only.', requirements: ['Loaded archive labelled Frostfire', 'Visually inspected tree selection', 'Solid whole prototype and clear floor'] },
  { id: 'hostile-range', title: 'Stationary hostile range', description: 'Three hostile seats use the Forge’s existing stationary NPC driver. They can turn and shoot in offline Play.', requirements: ['Loaded map with safe team starts', 'Loaded hostile character type', 'Safe actor floors'] },
  { id: 'static-mood', title: 'Static dusk settings', description: 'A static light and fog preset with room settings. No moving sun, weather or new renderer behaviour.', requirements: ['Loaded map', 'Safe team floors'] },
  { id: 'demolition', title: 'Demolition rehearsal', description: 'A bomb pickup and one planting site for each team, using existing Demolition rules. Complete the route in normal Play.', requirements: ['Loaded map with safe team starts', 'Safe pickup and site floors'] },
] as const;
export type StarterId = (typeof STARTERS)[number]['id'];
type V3 = [number, number, number];
type Bounds = { min: readonly [number, number, number]; max: readonly [number, number, number] };
/** Structural boundary shared with the live catalogue; no copied geometry, asset list or geometry reader. */
export interface StarterAsset {
  ref: string; revision: number; asset: string; model: string;
  source: { archive: string; path: string };
  bounds: Bounds | null;
  geometry: { parts: number; separability: 'whole-prototype-only' };
  collision: { state: 'available' | 'none' | 'unavailable' | 'invalid'; polygons: number; ground: number; walls: number; bounds: Bounds | null };
  roles: string[]; diagnostics: string[];
}
export interface StarterDiagnostic { code: string; message: string; ref?: string }
export interface StarterContext {
  revision: number;
  archives: { stem: string; label: string; campaign: boolean }[];
  map: LoadedMap | null;
  assets: StarterAsset[];
  /** Explicit selection can override deterministic lexical candidate discovery. Names alone never validate geometry. */
  coverRef?: string; crateRef?: string;
  /** Refs visually inspected by a person/agent as trees. The catalogue deliberately makes no semantic tree claim. */
  treeRefs?: readonly string[];
  hostileType?: number;
  /** Same-revision placement checker. Must check the EXACT proposed transform on the replacement base plus prior
   * proposed hulls. Current editor pieces are replaced by import and must not become support for this recipe. */
  checkPlacement?: (ref: string, transform: { at: V3; yaw?: number }, prior: readonly PieceRow[], assets: readonly string[]) =>
    { revision: number; diagnostics: readonly StarterDiagnostic[] } | Promise<{ revision: number; diagnostics: readonly StarterDiagnostic[] }>;
  /** Required for props: check every actor seat on the completed replacement base PLUS ALL proposed source hulls. */
  checkLayout?: (record: LayoutRecord) => { revision: number; diagnostics: readonly StarterDiagnostic[] }
    | Promise<{ revision: number; diagnostics: readonly StarterDiagnostic[] }>;
}
export interface StarterPreview {
  id: StarterId; title: string; expectedRevision: number; requirements: readonly string[];
  record: LayoutRecord | null; diagnostics: StarterDiagnostic[];
  /** Placement probes and bounds do not establish a playable route. */
  traversability: 'unverified';
}
export type StarterChoices = Pick<StarterContext, 'coverRef' | 'crateRef' | 'treeRefs' | 'hostileType'>;
const tenth = (n: number): number => Math.round(n * 10) / 10 + 0;
const degrees = (n: number): number => ((Math.round(n * 180 / Math.PI) % 360) + 360) % 360;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const validBounds = (b: Bounds | null): b is Bounds => !!b && b.min.every((n, i) => Number.isFinite(n) && Number.isFinite(b.max[i]) && b.max[i]! > n);

/** Pure planning except for injected read-only placement checks. Never applies or stores a partial layout. */
export async function previewStarter(id: StarterId, c: StarterContext): Promise<StarterPreview> {
  const def = STARTERS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown starter: ${String(id)}`);
  const out: StarterPreview = { id, title: def.title, expectedRevision: c.revision, requirements: [...def.requirements], record: null, diagnostics: [], traversability: 'unverified' };
  const block = (code: string, message: string, ref?: string): void => { out.diagnostics.push({ code, message, ...(ref ? { ref } : {}) }); };
  const map = c.map;
  if (!map) { block('MAP_UNAVAILABLE', 'Load a map from your own source before previewing this starter.'); return out; }
  const stem = archiveStem(map.archive);
  const archive = c.archives.find((a) => a.stem === stem);
  if (!archive) { block('ARCHIVE_UNAVAILABLE', `The loaded archive ${stem} is absent from the current source listing.`); return out; }
  if (id === 'arena' && !archive.campaign) block('MAP_INCOMPATIBLE', 'Open a campaign room, such as Stranglehold, using its actual archive label.');
  if (id === 'frostfire-trees' && !/^frostfire$/i.test(archive.label.trim())) block('MAP_INCOMPATIBLE', 'Open the archive labelled Frostfire in the current source.');
  if (out.diagnostics.length) return out;
  if (!map.ground) { block('NO_SAFE_FLOOR', 'The loaded map has no collision ground.'); return out; }
  const grid = groundGrid(map.ground);
  const floor = (x: number, z: number, below: number): V3 | null => {
    x = tenth(x); z = tenth(z);
    const ys = probeGround(grid, x, z).map((h) => h.y).filter((y) => Number.isFinite(y) && y <= below + 0.1).sort((a, b) => b - a);
    return ys.length ? [tenth(x), tenth(ys[0]!), tenth(z)] : null;
  };
  const slots = [...map.slots].sort((a, b) => a.side - b.side || a.index - b.index);
  const starts = ([0, 1] as const).map((side) => {
    for (const slot of slots.filter((s) => s.side === side)) {
      const p = floor(slot.position[0], slot.position[2], slot.position[1]);
      if (p && Math.abs(p[1] - slot.position[1]) <= 0.1) return { p, yaw: degrees(Math.atan2(-slot.facing[0], -slot.facing[1])) };
    }
    return null;
  });
  // Campaign rooms need not have multiplayer slots. These are authored offsets around actual decoded floor, not
  // claims about original spawn positions. Prefer real decoded slots; never fabricate a floor underneath an offset.
  const partner = (origin: V3): { p: V3; yaw: number } | null => {
    for (const distance of [100, 200, 400]) {
      for (const [dx, dz] of [[distance, 0], [-distance, 0], [0, distance], [0, -distance]] as [number, number][]) {
        const p = floor(origin[0] + dx, origin[2] + dz, origin[1]);
        if (p && Math.abs(p[1] - origin[1]) <= 0.1) return { p, yaw: degrees(Math.atan2(p[0] - origin[0], p[2] - origin[2])) };
      }
    }
    return null;
  };
  if (!starts[0] && !starts[1]) {
    const p = standingSpot(grid, map.ground, []);
    if (p) starts[0] = { p: p.map(tenth) as V3, yaw: 0 };
  }
  if (!starts[0] && starts[1]) starts[0] = partner(starts[1].p);
  if (!starts[1] && starts[0]) starts[1] = partner(starts[0].p);
  if (starts.some((s) => !s) || starts[0]!.p.every((n, i) => n === starts[1]!.p[i])) { block('NO_SAFE_FLOOR', 'Two distinct team starts need actual supported floor.'); return out; }
  const a = starts[0]!, b = starts[1]!;
  const middle = floor((a.p[0] + b.p[0]) / 2, (a.p[2] + b.p[2]) / 2, Math.max(a.p[1], b.p[1]));
  if (!middle) { block('NO_SAFE_FLOOR', 'No safe floor between the team starts.'); return out; }
  const record: LayoutRecord = { v: 2, name: def.title, base: stem, assets: [], pieces: [],
    spawns: [['A', ...a.p, a.yaw], ['B', ...b.p, b.yaw]] };
  const choose = (kind: 'cover' | 'crate' | 'tree'): StarterAsset | null => {
    let rows: StarterAsset[];
    if (kind === 'tree') {
      if (!c.treeRefs?.length) { block('TREE_UNVERIFIED', 'Inspect a real tree in the asset catalogue and explicitly select its current ref. A name is insufficient.'); return null; }
      rows = c.assets.filter((v) => c.treeRefs!.includes(v.ref));
    } else {
      const chosen = kind === 'cover' ? c.coverRef : c.crateRef;
      rows = chosen ? c.assets.filter((v) => v.ref === chosen) : c.assets.filter((v) => /crate|box|container/i.test(v.model));
    }
    rows.sort((x, y) => x.asset < y.asset ? -1 : x.asset > y.asset ? 1 : 0);
    if (!rows.length) { block('ASSET_UNAVAILABLE', `No ${kind} candidate is present in the supplied catalogue. Select a real prototype.`); return null; }
    const eligible = (v: StarterAsset): boolean => v.revision === out.expectedRevision && v.geometry.parts > 0 && validBounds(v.bounds)
      && v.collision.state === 'available' && v.collision.polygons > 0 && v.collision.walls > 0 && validBounds(v.collision.bounds)
      && (kind === 'tree' || v.collision.ground > 0);
    const v = rows.find(eligible) ?? rows[0]!;
    if (v.revision !== out.expectedRevision) block('STALE_CATALOGUE', 'Read the catalogue again at this editor revision.', v.ref);
    if (v.geometry.parts <= 0 || !validBounds(v.bounds) || v.geometry.separability !== 'whole-prototype-only') block('GEOMETRY_INCOMPATIBLE', 'The prototype must have complete finite whole geometry.', v.ref);
    if (v.collision.state !== 'available' || !validBounds(v.collision.bounds) || v.collision.polygons <= 0 || v.collision.walls <= 0 || (kind !== 'tree' && v.collision.ground <= 0)) block('COLLISION_UNAVAILABLE', 'The candidate needs valid solid collision (and a ground surface for cover or stairs).', v.ref);
    return out.diagnostics.length ? null : v;
  };
  const placements: { asset: StarterAsset; at: V3; yaw: number }[] = [];
  const placeOnFloor = (v: StarterAsset, x: number, z: number): void => {
    const bounds = v.collision.bounds!;
    const p = floor(x, z, middle[1]);
    if (!p) { block('NO_SAFE_FLOOR', 'A proposed placement has no floor.', v.ref); return; }
    // Probe every hull corner, not merely a named crate's centre. Nonplanar ground needs a deliberate manual placement.
    for (const dx of [bounds.min[0], bounds.max[0]]) for (const dz of [bounds.min[2], bounds.max[2]]) {
      const q = floor(x + dx, z + dz, p[1]);
      if (!q || Math.abs(q[1] - p[1]) > 0.1) { block('NO_SAFE_FLOOR', 'The whole collision footprint needs a level supported floor.', v.ref); return; }
    }
    placements.push({ asset: v, at: [p[0], tenth(p[1] - bounds.min[1]), p[2]], yaw: 0 });
  };
  if (id === 'arena' || id === 'crate-stack' || id === 'frostfire-trees') {
    const v = choose(id === 'arena' ? 'cover' : id === 'crate-stack' ? 'crate' : 'tree');
    if (v) {
      const bounds = v.collision.bounds!, width = bounds.max[0] - bounds.min[0], depth = bounds.max[2] - bounds.min[2], height = bounds.max[1] - bounds.min[1];
      if (id === 'crate-stack') {
        for (let step = 0; step < 3; step++) {
          const before = placements.length;
          placeOnFloor(v, middle[0] + (step - 1) * width, middle[2]);
          const bottom = placements[before];
          if (bottom) for (let level = 1; level <= step; level++) placements.push({ asset: v, at: [bottom.at[0], tenth(bottom.at[1] + level * height), bottom.at[2]], yaw: 0 });
        }
      } else if (id === 'arena') {
        for (const sign of [-1, 1]) for (const side of [-1, 1]) placeOnFloor(v, middle[0] + sign * width * 2, middle[2] + side * depth * 2);
      } else {
        for (let i = -1; i <= 1; i++) placeOnFloor(v, middle[0] + i * width * 2, middle[2] + depth * 3);
      }
    }
  }
  if (id === 'hostile-range') {
    const types = map.types?.terrorist ?? [];
    const type = c.hostileType ?? types.findIndex((v) => v !== null && v !== undefined);
    if (!Number.isInteger(type) || type < 0 || !types[type]) block('ACTOR_UNAVAILABLE', 'Choose a supported, loaded terrorist character index from this map.');
    else {
      record.npcs = [];
      for (const offset of [-40, 0, 40]) {
        const p = floor(b.p[0] + offset, b.p[2], b.p[1]);
        if (!p) block('NO_SAFE_FLOOR', 'A hostile seat has no floor.');
        else record.npcs.push(['terrorist', type, ...p, degrees(Math.atan2(p[0] - a.p[0], p[2] - a.p[2]))]);
      }
    }
    record.objectives = { gameType: 5 };
  }
  if (id === 'static-mood') record.settings = { light: 0.5, fogFar: 1000, players: 2, rounds: 3, roundSeconds: 180, friendlyFire: false };
  if (id === 'arena') record.objectives = { gameType: 5 };
  if (id === 'demolition') {
    const pickup = map.bombStart ? floor(map.bombStart[0], map.bombStart[2], map.bombStart[1]) : middle;
    if (!pickup) block('NO_SAFE_FLOOR', 'The loaded bomb pickup has no supported floor.');
    const sites = ([0, 1] as const).map((team) => {
      const source = plantSite(team === 0 ? 'seal' : 'terrorist', map.meta?.actions ?? []);
      const fallback = team === 0 ? b : a;
      const at = source ? floor(source.at[0], source.at[2], source.at[1]) : [...fallback.p] as V3;
      if (!at) block('NO_SAFE_FLOOR', 'A loaded planting site has no supported floor.');
      return { team, at: at ?? [...fallback.p] as V3, yaw: fallback.yaw * Math.PI / 180,
        range: source?.range ?? BOMB_SITE_REACH, elevation: source?.elevation ?? BOMB_SITE_REACH };
    });
    record.objectives = { gameType: 2, bomb: { start: pickup ?? [...middle], sites } };
  }
  if (placements.length && !c.checkPlacement) block('PLACEMENT_UNAVAILABLE', 'The live collision placement checker is required before applying props.');
  if (placements.length && !c.checkLayout) block('LAYOUT_VALIDATION_UNAVAILABLE', 'The completed starter needs a full collision and actor clearance check before applying props.');
  if (out.diagnostics.length) return out;
  for (const p of placements) {
    const checked = await c.checkPlacement!(p.asset.ref, { at: [...p.at], yaw: p.yaw }, clone(record.pieces), [...record.assets]);
    if (checked.revision !== out.expectedRevision) block('STALE_CATALOGUE', 'The editor changed during placement checks.', p.asset.ref);
    out.diagnostics.push(...checked.diagnostics.map((d) => ({ ...d })));
    let index = record.assets.indexOf(p.asset.asset);
    if (index < 0) { index = record.assets.length; record.assets.push(p.asset.asset); }
    record.pieces.push([index, ...p.at, degrees(p.yaw)]);
  }
  const invalid = checkRecord(record);
  if (invalid) block('INVALID_RECIPE', invalid);
  else if (c.checkLayout) {
    const checked = await c.checkLayout(clone(record));
    if (checked.revision !== out.expectedRevision) block('STALE_CATALOGUE', 'The editor changed during completed-layout checks.');
    out.diagnostics.push(...checked.diagnostics.map(d => ({ ...d })));
  } else {
    // No props: the loaded base IS the complete collision ground. Use the same existing actor checks directly.
    const bodies = layoutOfRecord(record);
    for (const n of bodies.npcs ?? []) bodies.spawns.push({ team: n.side === 'seal' ? 'A' : 'B', p: [...n.p], yaw: n.yaw });
    for (const issue of checkMap(bodies, map.ground, []).issues) {
      if (issue.kind === 'spawn-inside' || issue.kind === 'spawn-facing') block('ACTOR_OBSTRUCTED', issue.text);
      if (issue.kind === 'spawn-floor') block('NO_SAFE_FLOOR', issue.text);
    }
  }
  // FCW-07a: a starter is written as the record v3, each row its default id (built as the v2 rows above, migrated once).
  if (!out.diagnostics.length) out.record = recordOfLayout(layoutOfRecord(record), record.name);
  return out;
}

export interface StarterEditor {
  read(): { revision: number; ready: boolean; mode: 'forge-editor' | 'forge-play' | 'blocked' };
  execute(operation: string, args: unknown, expectedRevision?: number): Promise<ForgeAgentActionResult>;
}
/** Explicit Apply only. Import is the existing atomic staging path and creates exactly one normal undo step. */
export async function applyStarter(preview: StarterPreview, editor: StarterEditor): Promise<ForgeAgentActionResult> {
  const now = editor.read();
  const fail = (code: string, message: string): ForgeAgentActionResult => ({ ok: false, revision: now.revision, code, message });
  if (!preview.record || preview.diagnostics.length) return fail('REQUIREMENTS_UNMET', 'Resolve the preview diagnostics before applying.');
  if (now.mode === 'blocked') return fail('BLOCKED', 'A live server lobby or match blocks this editor.');
  if (now.mode === 'forge-play') return fail('PLAYING', 'Stop offline Play before applying a starter.');
  if (!now.ready) return fail('NOT_READY', 'Wait for the editor to finish loading.');
  if (now.revision !== preview.expectedRevision) return fail('STALE_REVISION', 'The editor changed. Preview again to preserve your edits.');
  return editor.execute('layout.import', { layout: clone(preview.record) }, preview.expectedRevision);
}
