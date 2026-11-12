import { CanvasTexture, Group, Sprite, SpriteMaterial, Vector3, type Intersection, type Object3D, type Raycaster } from 'three';
import type { SpawnSlot } from '@s2u/scene';
import type { MapDataGroup, MapDataRow } from './mapData';

/**
 * The viewport's billboards for the map's own data (a browser adaptation, FG.R2: editor marks, no original, never in a
 * match): one camera-facing mark -- a disc in its kind's colour with its kind's letter -- at each disc spawn slot and
 * each row of the Outliner's Map Data branches that has a place (`./mapData`). The props draw themselves, so they have
 * none. A constant size on screen, hidden behind what stands in front of it, under the View panel's toggle. A mark can
 * be picked (`pick`) and drawn as the selection (`highlight`): the map data is selectable, never editable.
 */

/**
 * A billboard's look by kind: its letter, its colour (an editor's palette, not the game's) and the Inspector's word -- a
 * disc, the same for the map's own data and the user's own placements of a kind (the owner, 2026-11-10: "unify the
 * billboards ... they should use the same icon").
 */
/** The map's hostages' mark colour, a placed hostage's too. */
const MAP_HOSTAGE_COLOUR = '#f2d14b';

export const MAP_DATA_MARKS: Record<string, { glyph: string; colour: string; word: string }> = {
  // The user's own placements: their props, their spawns by team, their NPCs, their bomb markers -- each its map
  // counterpart's mark (props M, spawns S, the bomb start B).
  userProps: { glyph: 'M', colour: '#9aa5b1', word: 'User prop' },
  // A placed spawn in the disc spawn slot's colours (`../overlays` SPAWN_COLOURS).
  userSpawnA: { glyph: 'Ss', colour: '#4d9bff', word: 'Spawn A (SEALs)' },
  userSpawnB: { glyph: 'St', colour: '#ff6a3d', word: 'Spawn B (Terrorists)' },
  // A placed respawn point by its team, as the map's (Rs, Rt; their colours).
  userRespawnA: { glyph: 'Rs', colour: '#9cc8ff', word: 'Respawn point A (SEALs)' },
  userRespawnB: { glyph: 'Rt', colour: '#ffa27f', word: 'Respawn point B (Terrorists)' },
  // A placed flare: a disc facade prop (`./mapCensus` `flarePropsOf`), the map's flares' F.
  userFlares: { glyph: 'F', colour: '#fff2a8', word: 'Flare' },
  userNpcs: { glyph: 'N', colour: '#b9a6ff', word: 'NPC' },
  // The bomb's markers as `./pieces` colours them: the start sand, a site its planting team's (`SIDE_COLOUR`).
  userEscortees: { glyph: 'H', colour: MAP_HOSTAGE_COLOUR, word: 'Hostage' },
  userTacZones: { glyph: 'Z', colour: '#3fb58a', word: 'Extraction zone' },
  userTacPoints: { glyph: 'P', colour: '#5fd38d', word: 'Tactical point' },
  userScenicViews: { glyph: 'V', colour: '#ff79c6', word: 'Spectator view' },
  userTurrets: { glyph: 'T', colour: '#c77dff', word: 'Turret' },
  userDoors: { glyph: 'D', colour: '#a0c878', word: 'Door' },
  // A placed ladder: a disc ladder prop (its own hull's ladder polygons), the map's L.
  userLadders: { glyph: 'L', colour: '#e07a5f', word: 'Ladder' },
  // A placed gate (a disc access object with its slide, `./placedAccess`): the map's G.
  userGates: { glyph: 'G', colour: '#78c8a8', word: 'Gate' },
  // A placed damage trigger (a copied C4 barrier or hit trigger, `./placedAccess`): the map's damage triggers' X.
  userBarriers: { glyph: 'X', colour: '#ff9f43', word: 'Damage trigger (C4 barrier or hit trigger)' },
  userBombStart: { glyph: 'B', colour: '#ff4d4d', word: 'Bomb start' },
  // A placed plant site is a context action (MPBOMB) as the disc's tents are: the map's ! mark.
  userSiteSeal: { glyph: '!', colour: '#e0e0e0', word: 'Site · SEAL (MPBOMB)' },
  userSiteTerrorist: { glyph: '!', colour: '#e0e0e0', word: 'Site · Terrorist (MPBOMB)' },
  // A placed gate's switch: a context action (SWITCH), the map's ! mark.
  userSwitches: { glyph: '!', colour: '#e0e0e0', word: 'Switch (SWITCH)' },
  // The Forge objects (`./forgeObjects`): an ambient effect (a map's fire, water, weather).
  userAmbients: { glyph: '~', colour: '#e08a2c', word: 'Ambient effect' },
  // The map's own ambient effects (`./mapData` `ambients`), round as the map's data is.
  ambients: { glyph: '~', colour: '#e08a2c', word: 'Ambient effect (the map\'s)' },
  // The base map's own props (M, map prop): they draw themselves, so their marks start switched off.
  mapProps: { glyph: 'M', colour: '#9aa5b1', word: 'Map prop' },
  // A spawn slot by its side: Ss the SEALs' (side A, 0 -- `bombMarkers`' team 0 is the SEALs), St the Terrorists' (side
  // B, 1); its colour the slots overlay's own (`../overlays` SPAWN_COLOURS).
  slotA: { glyph: 'Ss', colour: '#4d9bff', word: 'Spawn slot (SEALs)' },
  slotB: { glyph: 'St', colour: '#ff6a3d', word: 'Spawn slot (Terrorists)' },
  // A respawn point by its side, as a spawn slot: Rs the SEALs', Rt the Terrorists', each its side's colour a shade lighter.
  respawnA: { glyph: 'Rs', colour: '#9cc8ff', word: 'Respawn point (SEALs)' },
  respawnB: { glyph: 'Rt', colour: '#ffa27f', word: 'Respawn point (Terrorists)' },
  escortees: { glyph: 'H', colour: '#f2d14b', word: 'Hostage' },
  bombStart: { glyph: 'B', colour: '#ff4d4d', word: 'Bomb start' },
  turrets: { glyph: 'T', colour: '#c77dff', word: 'Turret' },
  doors: { glyph: 'D', colour: '#a0c878', word: 'Door' },
  gates: { glyph: 'G', colour: '#78c8a8', word: 'Gate' },
  cranes: { glyph: 'C', colour: '#c9853a', word: 'Crane' },
  actions: { glyph: '!', colour: '#e0e0e0', word: 'Context action' },
  // A damage trigger: a destructible whose death runs its program (C4 or damage, or any hit at health 0; `./mapData`).
  damage: { glyph: 'X', colour: '#ff9f43', word: 'Damage trigger' },
  tacPoints: { glyph: 'P', colour: '#5fd38d', word: 'Tactical point' },
  tacZones: { glyph: 'Z', colour: '#3fb58a', word: 'Tactical zone' },
  scenicViews: { glyph: 'V', colour: '#ff79c6', word: 'Spectator view' },
  // A flare: a light's glow (F, flare), the sun's and the sky's too.
  flares: { glyph: 'F', colour: '#fff2a8', word: 'Flare' },
  // A ladder: part of the hull, not an object (L).
  ladders: { glyph: 'L', colour: '#e07a5f', word: 'Ladder' },
};

/**
 * The View dropdown's switches, a kind each (the owner, 2026-11-10: "only have a single list not a user and map data
 * list"): each switch shows or hides that kind's marks, the map's own and the user's own placements alike (one icon). The
 * map's alone are hidden all at once by Only user data (`isUserMarkKind`). A spawn's two sides are one switch.
 */
export const MAP_DATA_KIND_TOGGLES: readonly { id: string; label: string; kinds: readonly string[] }[] = [
  { id: 'mapProps', label: 'Props', kinds: ['mapProps', 'userProps'] },
  { id: 'slots', label: 'Spawns', kinds: ['slotA', 'slotB', 'userSpawnA', 'userSpawnB'] },
  { id: 'respawns', label: 'Respawn points', kinds: ['respawnA', 'respawnB', 'userRespawnA', 'userRespawnB'] },
  { id: 'escortees', label: 'Hostages', kinds: ['escortees', 'userEscortees'] },
  { id: 'bombStart', label: 'Bomb start', kinds: ['bombStart', 'userBombStart'] },
  { id: 'turrets', label: 'Turrets', kinds: ['turrets', 'userTurrets'] },
  { id: 'doors', label: 'Doors', kinds: ['doors', 'userDoors'] },
  { id: 'gates', label: 'Gates', kinds: ['gates', 'userGates'] },
  { id: 'ladders', label: 'Ladders', kinds: ['ladders', 'userLadders'] },
  { id: 'actions', label: 'Context actions', kinds: ['actions', 'userSiteSeal', 'userSiteTerrorist', 'userSwitches'] },
  { id: 'tacPoints', label: 'Tactical points', kinds: ['tacPoints', 'userTacPoints'] },
  { id: 'tacZones', label: 'Tactical zones', kinds: ['tacZones', 'userTacZones'] },
  { id: 'scenicViews', label: 'Spectator views', kinds: ['scenicViews', 'userScenicViews'] },
  { id: 'flares', label: 'Flares', kinds: ['flares', 'userFlares'] },
  // Under Objects, with the Triggers dropdown that places them (the owner, 2026-11-08).
  { id: 'damage', label: 'Damage triggers', kinds: ['damage', 'userBarriers'] },
  { id: 'cranes', label: 'Cranes', kinds: ['cranes'] },
  { id: 'ambients', label: 'Ambient effects', kinds: ['ambients', 'userAmbients'] },
  { id: 'userNpcs', label: 'NPCs', kinds: ['userNpcs'] },
];

/** Whether a mark kind is one of the user's own placements' (`user*`), not the map's own data's. */
export const isUserMarkKind = (kind: string): boolean => kind.startsWith('user');

/** A user placement's mark kind by what it is (the page's `userData`: a piece, a spawn's team, an NPC, a bomb marker's kind). */
export function userMarkKind(r: { piece?: boolean; team?: 'A' | 'B'; respawn?: 'A' | 'B'; npc?: boolean; bomb?: 'start' | 'seal' | 'terrorist' | null; hostage?: boolean; zone?: boolean; point?: boolean; view?: boolean; turret?: boolean; door?: boolean; ladder?: boolean; gate?: boolean; barrier?: boolean; switch?: boolean; flare?: boolean; object?: 'ambient' }): string | null {
  if (r.object) return 'userAmbients';   // a Forge object (`./forgeObjects`)
  if (r.hostage) return 'userEscortees';
  if (r.zone) return 'userTacZones';
  if (r.point) return 'userTacPoints';
  if (r.view) return 'userScenicViews';
  if (r.turret) return 'userTurrets';
  if (r.door) return 'userDoors';
  if (r.ladder) return 'userLadders';
  if (r.flare) return 'userFlares';
  if (r.gate) return 'userGates';
  if (r.barrier) return 'userBarriers';
  if (r.switch) return 'userSwitches';
  if (r.bomb) return r.bomb === 'start' ? 'userBombStart' : r.bomb === 'seal' ? 'userSiteSeal' : 'userSiteTerrorist';
  if (r.respawn) return r.respawn === 'A' ? 'userRespawnA' : 'userRespawnB';
  if (r.team) return r.team === 'A' ? 'userSpawnA' : 'userSpawnB';
  if (r.npc) return 'userNpcs';
  if (r.piece) return 'userProps';
  return null;
}

/** A user placement's mark: its key (`user:<n>`, the page's), its kind (`userMarkKind`), its words and the object it follows. */
export interface UserMark { key: string; kind: string; label: string; object: Object3D }

/** The render order the marks take drawn over everything (`setOnTop`): after the scene's own. An editor's value. */
const BILLBOARD_ON_TOP_ORDER = 10_000;

export interface BillboardSpec {
  /** The row's key (`./mapData` `MapDataRow.key`; a spawn slot's `slot:A1`): what selects it, in the Outliner too. */
  key: string;
  /** `MAP_DATA_MARKS`'s key: a spawn slot's side (`slotA`, `slotB`) or the Map Data branch's. */
  kind: string;
  label: string;
  at: [number, number, number];
  /** How far back to stand to frame it whole (a zone's size). */
  reach?: number;
  /** A spectator view: the pose to frame it by. */
  view?: MapDataRow['view'];
  /** Its record (`MapDataRow.data`; a spawn slot's own), for the Inspector's Data. */
  data?: unknown;
}

/** A base map prop's mark: its placement's key (`./hide` `Placement.key`), its model's name, its place. */
export interface PropMark { key: string; model: string; at: [number, number, number] }

/** The `BillboardSpec.key` of a map prop's mark (its placement's key behind `prop:`), and back. */
export const propMarkKey = (placementKey: string): string => `prop:${placementKey}`;
export const placementOfMark = (key: string): string | null => (key.startsWith('prop:') ? key.slice(5) : null);

/**
 * The billboards: the map's props (`props`, their marks a kind of their own), each spawn slot (side A's then B's),
 * then each Map Data row with a place -- a view at its camera.
 */
export function billboardSpecs(groups: readonly MapDataGroup[], slots: readonly SpawnSlot[], props: readonly PropMark[] = []): BillboardSpec[] {
  const out: BillboardSpec[] = props.map((p) => ({ key: propMarkKey(p.key), kind: 'mapProps', label: p.model, at: p.at }));
  out.push(...[...slots].sort((a, b) => a.side - b.side || a.index - b.index).map((s): BillboardSpec => {
    const name = `${s.side === 0 ? 'A' : 'B'}${s.index + 1}`;
    return { key: `slot:${name}`, kind: s.side === 0 ? 'slotA' : 'slotB', label: `Slot ${name}`, at: [s.position[0], s.position[1], s.position[2]], data: s };
  }));
  for (const g of groups) {
    for (const r of g.rows) {
      const at = r.at ?? (r.view ? [r.view.x, r.view.y, r.view.z] as [number, number, number] : null);
      if (!at) continue;
      out.push({ key: r.key, kind: r.kind ?? g.key, label: r.label, at, ...(r.reach !== undefined ? { reach: r.reach } : {}), ...(r.view ? { view: r.view } : {}), ...(r.data !== undefined ? { data: r.data } : {}) });
    }
  }
  return out;
}

/** How high over its place a mark floats, game units (a slot's centre is at the feet). An editor's value. */
const BILLBOARD_LIFT = 12;
/** The mark's size on screen: a fraction of the viewport's height (`sizeAttenuation` off). An editor's value. */
const BILLBOARD_SCREEN_SIZE = 0.035;
/** The selected mark drawn this much larger. An editor's value. */
const BILLBOARD_SELECTED_SCALE = 1.6;
/**
 * The selected mark's border: the editor's selection colour, the gold its selection box is drawn in (`./page`'s
 * `Box3Helper` 0xd8a640, `--fx-gold`). No kind's own colour is it, so a selected mark always reads as selected.
 */
export const MAP_DATA_SELECTED_BORDER = '#d8a640';

/**
 * One kind's mark, drawn once a look: a disc with an outline and the kind's letter -- selected, the outline thick and
 * the selection colour. A canvas is the only font three.js has.
 */
function markTexture(mark: { glyph: string; colour: string }, selected: boolean): CanvasTexture | null {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const border = selected ? 8 : 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - border / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = mark.colour;
  ctx.fill();
  ctx.lineWidth = border;
  ctx.strokeStyle = selected ? MAP_DATA_SELECTED_BORDER : '#0b1418';
  ctx.stroke();
  ctx.font = `bold ${size * (mark.glyph.length > 1 ? 0.38 : 0.5)}px sans-serif`;   // two letters (Ss, St) a size down
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0b1418';
  ctx.fillText(mark.glyph, size / 2, size / 2 + 2);
  return new CanvasTexture(canvas);
}

/** The billboards in a scene: replaced whole by `set`, shown or not by `setVisible`, picked by `pick`. */
export class MapDataBillboards {
  private readonly group = new Group();
  /** The map's own marks (`set`) and the user's placements' (`setUser`), each replaced on its own. */
  private readonly mapGroup = new Group();
  private readonly userGroup = new Group();
  private readonly materials = new Map<string, SpriteMaterial>();
  private readonly sprites = new Map<string, Sprite>();
  /** A user mark's sprite and the placement it follows (`sync`). */
  private readonly tracked = new Map<Sprite, Object3D>();
  /** The selected marks' keys (one, or a box's several). */
  private selected: readonly string[] = [];
  /** The mark kinds hidden by their switches (`setHiddenKinds`). */
  private hidden = new Set<string>();
  /** Drawn over all the geometry (`setOnTop`), so a mark is found from anywhere on the map. */
  private onTop = false;

  constructor(parent: Object3D) {
    this.group.name = 'forge map data billboards';
    this.group.userData['forgeLightingInstrument'] = true;   // an editor guide, as the floor's grid is (FDL.R4)
    this.group.visible = false;
    this.group.add(this.mapGroup, this.userGroup);
    parent.add(this.group);
  }

  /** The map's own marks, replaced whole (the user's left as they are). */
  set(specs: readonly BillboardSpec[]): void {
    this.drop(this.mapGroup);
    for (const s of specs) {
      const sprite = this.mark(s.key, s.kind, s.label);
      if (!sprite) continue;
      sprite.position.set(s.at[0], s.at[1] + BILLBOARD_LIFT, s.at[2]);
      this.mapGroup.add(sprite);
    }
    this.highlight(this.selected);
  }

  /** The user's placements' marks, replaced whole; each follows its placement (`sync`, every frame). */
  setUser(marks: readonly UserMark[]): void {
    this.drop(this.userGroup);
    for (const m of marks) {
      const sprite = this.mark(m.key, m.kind, m.label);
      if (!sprite) continue;
      this.tracked.set(sprite, m.object);
      this.userGroup.add(sprite);
    }
    this.sync();
    this.highlight(this.selected);
  }

  /** Each user mark over its placement where it is now (a drag, a move, an undo between frames). */
  sync(): void {
    for (const [sprite, object] of this.tracked) {
      object.getWorldPosition(sprite.position);
      sprite.position.y += BILLBOARD_LIFT;
    }
  }

  private mark(key: string, kind: string, label: string): Sprite | null {
    const material = this.material(kind, false);
    if (!material) return null;
    const sprite = new Sprite(material);
    sprite.name = `map data ${label}`;
    sprite.userData['mapData'] = key;
    sprite.userData['mapDataKind'] = kind;
    sprite.visible = !this.hidden.has(kind);
    this.sprites.set(key, sprite);
    return sprite;
  }

  /** A part's marks gone (out of the pick, the highlight and the follow). */
  private drop(part: Group): void {
    for (const child of part.children) {
      const key = child.userData['mapData'];
      if (typeof key === 'string') this.sprites.delete(key);
      this.tracked.delete(child as Sprite);
    }
    part.clear();
  }

  setVisible(on: boolean): void { this.group.visible = on; }
  get visible(): boolean { return this.group.visible; }
  /** Drawn over everything, or hidden behind what stands in front of it as before. */
  get drawnOnTop(): boolean { return this.onTop; }

  /** The mark kinds their switches hide (`MAP_DATA_KIND_TOGGLES`' `kinds`); the rest shown. */
  setHiddenKinds(kinds: Iterable<string>): void {
    this.hidden = new Set(kinds);
    for (const sprite of this.sprites.values()) sprite.visible = !this.hidden.has(sprite.userData['mapDataKind'] as string);
  }

  /**
   * Over all the geometry (no depth test, drawn after the scene), so a mark is found from the other side of the map --
   * or, off, hidden behind what stands in front of it.
   */
  setOnTop(on: boolean): void {
    this.onTop = on;
    for (const m of this.materials.values()) { m.depthTest = !on; m.needsUpdate = true; }
    this.highlight(this.selected);
  }

  /**
   * The shown mark the ray meets first (its key) and how far along, or null; nothing while the marks are hidden. Drawn
   * on top, a mark is picked wherever it is (`distance` 0: nearer than any geometry, as it is drawn).
   */
  pick(ray: Raycaster): { key: string; distance: number } | null {
    if (!this.group.visible) return null;
    const hits: Intersection[] = [];
    for (const sprite of this.sprites.values()) if (sprite.visible) sprite.raycast(ray, hits);
    hits.sort((a, b) => a.distance - b.distance);
    const first = hits[0];
    const key = first?.object.userData['mapData'];
    return first && typeof key === 'string' ? { key, distance: this.onTop ? 0 : first.distance } : null;
  }

  /**
   * Where a mark is drawn now, world space (its place lifted `BILLBOARD_LIFT`), or null for a mark not drawn: what a
   * selection box tests, so a box round the icon picks it however near the camera (the owner, 2026-11-06).
   */
  markAt(key: string): Vector3 | null {
    const sprite = this.sprites.get(key);
    return sprite ? sprite.getWorldPosition(new Vector3()) : null;
  }

  /** The selected marks drawn larger (`BILLBOARD_SELECTED_SCALE`) and ringed in the selection colour; null, none. */
  highlight(key: string | readonly string[] | null): void {
    this.selected = key === null ? [] : typeof key === 'string' ? [key] : [...key];
    const keys = new Set(this.selected);
    for (const [k, sprite] of this.sprites) {
      const on = keys.has(k);
      const size = BILLBOARD_SCREEN_SIZE * (on ? BILLBOARD_SELECTED_SCALE : 1);
      sprite.scale.set(size, size, 1);
      sprite.renderOrder = (this.onTop ? BILLBOARD_ON_TOP_ORDER : 0) + (on ? 1 : 0);
      const material = this.material(sprite.userData['mapDataKind'] as string, on);
      if (material) sprite.material = material;
    }
  }

  dispose(): void {
    this.drop(this.mapGroup);
    this.drop(this.userGroup);
    this.group.clear();
    this.sprites.clear();
    this.group.removeFromParent();
    for (const m of this.materials.values()) { m.map?.dispose(); m.dispose(); }
    this.materials.clear();
  }

  /** A kind's material, its plain look or its selected one, drawn once each and kept. */
  private material(kind: string, selected: boolean): SpriteMaterial | null {
    const id = `${kind}${selected ? ':selected' : ''}`;
    const have = this.materials.get(id);
    if (have) return have;
    const mark = MAP_DATA_MARKS[kind];
    const map = mark ? markTexture(mark, selected) : null;
    if (!map) return null;
    const m = new SpriteMaterial({ map, ...billboardMaterialParams(this.onTop) });
    this.materials.set(id, m);
    return m;
  }
}

/**
 * A mark's material settings (a browser adaptation, FG.R2): drawn over everything when `onTop` (no depth test), else hidden
 * behind what stands in front; never fogged (the owner, 2026-11-09) -- the map's fog is the world's, a mark is read through
 * it at any distance -- the same size on screen at any distance, written to no depth.
 */
export function billboardMaterialParams(onTop: boolean): { transparent: true; depthWrite: false; depthTest: boolean; sizeAttenuation: false; fog: false } {
  return { transparent: true, depthWrite: false, depthTest: !onTop, sizeAttenuation: false, fog: false };
}

type KindToggle = (typeof MAP_DATA_KIND_TOGGLES)[number];

/**
 * The View dropdown's sections (the owner, 2026-11-06): the placing toolbar's own headers (`./page` `modeSection`), each its
 * switches in this order; Other the kinds no tool places (cranes), the ambient effects and NPCs. A switch no section names
 * goes to Other.
 */
export const BILLBOARD_SECTIONS: readonly { heading: string; ids: readonly string[] }[] = [
  { heading: 'Spawn', ids: ['slots', 'respawns'] },
  { heading: 'Objects', ids: ['mapProps', 'doors', 'gates', 'ladders', 'turrets', 'flares', 'damage'] },
  { heading: 'Demolition · Breach', ids: ['bombStart', 'actions'] },
  { heading: 'Escort · Extraction', ids: ['escortees', 'tacZones'] },
  { heading: 'Info', ids: ['tacPoints', 'scenicViews'] },
  { heading: 'Other', ids: ['cranes', 'ambients', 'userNpcs'] },
];

/** The View dropdown's rows, by section (`BILLBOARD_SECTIONS`): a section's heading, then its switches, one list. */
export type BillboardRow = { heading: string } | { toggle: KindToggle };

export function billboardRows(): BillboardRow[] {
  const named = new Set(BILLBOARD_SECTIONS.flatMap((x) => x.ids));
  const out: BillboardRow[] = [];
  for (const section of BILLBOARD_SECTIONS) {
    const ids = [...section.ids, ...(section.heading === 'Other' ? MAP_DATA_KIND_TOGGLES.filter((t) => !named.has(t.id)).map((t) => t.id) : [])];
    const rows = ids.flatMap((id) => { const toggle = MAP_DATA_KIND_TOGGLES.find((t) => t.id === id); return toggle ? [{ toggle }] : []; });
    if (rows.length) out.push({ heading: section.heading }, ...rows);
  }
  return out;
}
