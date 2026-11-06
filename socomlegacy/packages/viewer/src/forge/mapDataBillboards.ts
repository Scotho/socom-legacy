import { CanvasTexture, Group, Sprite, SpriteMaterial, type Intersection, type Object3D, type Raycaster } from 'three';
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
 * A billboard's look by kind: its letter, its colour (an editor's palette, not the game's), the Inspector's word, and its
 * shape -- the map's own data a disc, the user's own placements a rounded square, so the two read apart at a glance.
 */
/** The map's hostages' mark colour, a placed hostage's too. */
const MAP_HOSTAGE_COLOUR = '#f2d14b';

export const MAP_DATA_MARKS: Record<string, { glyph: string; colour: string; word: string; shape?: 'disc' | 'square' }> = {
  // The user's own placements (square): their props, their spawns by team, their NPCs, their bomb markers.
  // A user kind with a map counterpart is that kind's letter and colour (props M, spawns S, the bomb start B): only square.
  userProps: { glyph: 'M', colour: '#9aa5b1', word: 'User prop', shape: 'square' },
  // A placed spawn in the disc spawn slot's colours (`../overlays` SPAWN_COLOURS); square, where a slot is round.
  userSpawnA: { glyph: 'Ss', colour: '#4d9bff', word: 'Spawn A (SEALs)', shape: 'square' },
  userSpawnB: { glyph: 'St', colour: '#ff6a3d', word: 'Spawn B (Terrorists)', shape: 'square' },
  userNpcs: { glyph: 'N', colour: '#b9a6ff', word: 'NPC', shape: 'square' },
  // The bomb's markers as `./pieces` colours them: the start sand, a site its planting team's (`SIDE_COLOUR`).
  userEscortees: { glyph: 'H', colour: MAP_HOSTAGE_COLOUR, word: 'Hostage', shape: 'square' },
  userTacZones: { glyph: 'Z', colour: '#3fb58a', word: 'Extraction zone', shape: 'square' },
  userTacPoints: { glyph: 'P', colour: '#5fd38d', word: 'Tactical point', shape: 'square' },
  userScenicViews: { glyph: 'V', colour: '#ff79c6', word: 'Spectator view', shape: 'square' },
  userTurrets: { glyph: 'T', colour: '#c77dff', word: 'Turret', shape: 'square' },
  userDoors: { glyph: 'D', colour: '#a0c878', word: 'Door', shape: 'square' },
  // A placed ladder: a disc ladder prop (its own hull's ladder polygons), the map's L.
  userLadders: { glyph: 'L', colour: '#e07a5f', word: 'Ladder', shape: 'square' },
  // A placed gate (a disc access object with its slide, `./placedAccess`): the map's G.
  userGates: { glyph: 'G', colour: '#78c8a8', word: 'Gate', shape: 'square' },
  // A placed C4 barrier: a context action (C4's), the map's ! mark.
  userBarriers: { glyph: '!', colour: '#e0e0e0', word: 'C4 barrier (context action)', shape: 'square' },
  userBombStart: { glyph: 'B', colour: '#ff4d4d', word: 'Bomb start', shape: 'square' },
  // A placed plant site is a context action (MPBOMB) as the disc's tents are: the map's ! mark, square.
  userSiteSeal: { glyph: '!', colour: '#e0e0e0', word: 'Site · SEAL (MPBOMB)', shape: 'square' },
  userSiteTerrorist: { glyph: '!', colour: '#e0e0e0', word: 'Site · Terrorist (MPBOMB)', shape: 'square' },
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
  tacPoints: { glyph: 'P', colour: '#5fd38d', word: 'Tactical point' },
  tacZones: { glyph: 'Z', colour: '#3fb58a', word: 'Tactical zone' },
  scenicViews: { glyph: 'V', colour: '#ff79c6', word: 'Spectator view' },
  // A flare: a light's glow (F, flare), the sun's and the sky's too.
  flares: { glyph: 'F', colour: '#fff2a8', word: 'Flare' },
  // A ladder: part of the hull, not an object (L).
  ladders: { glyph: 'L', colour: '#e07a5f', word: 'Ladder' },
};

/**
 * The Billboards dropdown's switches, a kind each, in two sections: the map's own data (`map`, the Outliner's Map Data
 * branches' order) and the user's own placements (`user`, User Data's). Which mark kinds each shows; a spawn slot's two
 * sides are one switch, as a placed spawn's two teams are.
 */
export const MAP_DATA_KIND_TOGGLES: readonly { id: string; label: string; kinds: readonly string[]; group: 'map' | 'user' }[] = [
  { id: 'mapProps', label: 'Props', kinds: ['mapProps'], group: 'map' },
  { id: 'slots', label: 'Spawns', kinds: ['slotA', 'slotB'], group: 'map' },
  { id: 'respawns', label: 'Respawn points', kinds: ['respawnA', 'respawnB'], group: 'map' },
  { id: 'escortees', label: 'Hostages', kinds: ['escortees'], group: 'map' },
  { id: 'bombStart', label: 'Bomb start', kinds: ['bombStart'], group: 'map' },
  { id: 'turrets', label: 'Turrets', kinds: ['turrets'], group: 'map' },
  { id: 'doors', label: 'Doors', kinds: ['doors'], group: 'map' },
  { id: 'gates', label: 'Gates', kinds: ['gates'], group: 'map' },
  { id: 'cranes', label: 'Cranes', kinds: ['cranes'], group: 'map' },
  { id: 'ladders', label: 'Ladders', kinds: ['ladders'], group: 'map' },
  { id: 'actions', label: 'Context actions', kinds: ['actions'], group: 'map' },
  { id: 'tacPoints', label: 'Tactical points', kinds: ['tacPoints'], group: 'map' },
  { id: 'tacZones', label: 'Tactical zones', kinds: ['tacZones'], group: 'map' },
  { id: 'scenicViews', label: 'Spectator views', kinds: ['scenicViews'], group: 'map' },
  { id: 'flares', label: 'Flares (lights)', kinds: ['flares'], group: 'map' },
  { id: 'userProps', label: 'Props', kinds: ['userProps'], group: 'user' },
  { id: 'userSpawns', label: 'Spawns', kinds: ['userSpawnA', 'userSpawnB'], group: 'user' },
  { id: 'userNpcs', label: 'NPCs', kinds: ['userNpcs'], group: 'user' },
  { id: 'userEscortees', label: 'Hostages', kinds: ['userEscortees'], group: 'user' },
  { id: 'userTacZones', label: 'Tactical zones', kinds: ['userTacZones'], group: 'user' },
  { id: 'userTacPoints', label: 'Tactical points', kinds: ['userTacPoints'], group: 'user' },
  { id: 'userScenicViews', label: 'Spectator views', kinds: ['userScenicViews'], group: 'user' },
  { id: 'userTurrets', label: 'Turrets', kinds: ['userTurrets'], group: 'user' },
  { id: 'userDoors', label: 'Doors', kinds: ['userDoors'], group: 'user' },
  { id: 'userLadders', label: 'Ladders', kinds: ['userLadders'], group: 'user' },
  { id: 'userGates', label: 'Gates', kinds: ['userGates'], group: 'user' },
  { id: 'userObjectives', label: 'Bomb start', kinds: ['userBombStart'], group: 'user' },
  { id: 'userActions', label: 'Context actions', kinds: ['userSiteSeal', 'userSiteTerrorist', 'userBarriers'], group: 'user' },
];

/** A user placement's mark kind by what it is (the page's `userData`: a piece, a spawn's team, an NPC, a bomb marker's kind). */
export function userMarkKind(r: { piece?: boolean; team?: 'A' | 'B'; npc?: boolean; bomb?: 'start' | 'seal' | 'terrorist' | null; hostage?: boolean; zone?: boolean; point?: boolean; view?: boolean; turret?: boolean; door?: boolean; ladder?: boolean; gate?: boolean; barrier?: boolean }): string | null {
  if (r.hostage) return 'userEscortees';
  if (r.zone) return 'userTacZones';
  if (r.point) return 'userTacPoints';
  if (r.view) return 'userScenicViews';
  if (r.turret) return 'userTurrets';
  if (r.door) return 'userDoors';
  if (r.ladder) return 'userLadders';
  if (r.gate) return 'userGates';
  if (r.barrier) return 'userBarriers';
  if (r.bomb) return r.bomb === 'start' ? 'userBombStart' : r.bomb === 'seal' ? 'userSiteSeal' : 'userSiteTerrorist';
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
function markTexture(mark: { glyph: string; colour: string; shape?: 'disc' | 'square' }, selected: boolean): CanvasTexture | null {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const border = selected ? 8 : 4;
  ctx.beginPath();
  if (mark.shape === 'square') {
    // A user placement's mark: a rounded square (the map's are discs).
    const inset = border / 2 + 1, side = size - inset * 2, r = 12;
    ctx.moveTo(inset + r, inset);
    ctx.arcTo(inset + side, inset, inset + side, inset + side, r);
    ctx.arcTo(inset + side, inset + side, inset, inset + side, r);
    ctx.arcTo(inset, inset + side, inset, inset, r);
    ctx.arcTo(inset, inset, inset + side, inset, r);
    ctx.closePath();
  } else ctx.arc(size / 2, size / 2, size / 2 - border / 2 - 1, 0, Math.PI * 2);
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
  private selected: string | null = null;
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

  /** The selected mark drawn larger (`BILLBOARD_SELECTED_SCALE`) and ringed in the selection colour; null, none. */
  highlight(key: string | null): void {
    this.selected = key;
    for (const [k, sprite] of this.sprites) {
      const on = k === key;
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
    const m = new SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: !this.onTop, sizeAttenuation: false });
    this.materials.set(id, m);
    return m;
  }
}

/** Each user kind's map counterpart (the same billboard's kind): the dropdown's rows pair them. */
export const BILLBOARD_PAIRS: Readonly<Record<string, string>> = {
  userProps: 'mapProps', userSpawns: 'slots', userEscortees: 'escortees', userTacZones: 'tacZones', userTacPoints: 'tacPoints',
  userScenicViews: 'scenicViews', userTurrets: 'turrets', userDoors: 'doors', userLadders: 'ladders', userGates: 'gates',
  userObjectives: 'bombStart', userActions: 'actions',
};

type KindToggle = (typeof MAP_DATA_KIND_TOGGLES)[number];

/**
 * The Billboards dropdown's rows (the owner, 2026-11-06): the map's switches in their own order, each beside its user
 * counterpart (`BILLBOARD_PAIRS`), an empty cell where a side has none; a user switch with no map counterpart (NPCs) on
 * a row of its own right after the user switch before it.
 */
export function billboardRows(): { user: KindToggle | null; map: KindToggle | null }[] {
  const users = MAP_DATA_KIND_TOGGLES.filter((t) => t.group === 'user');
  const rows: { user: KindToggle | null; map: KindToggle | null }[] = MAP_DATA_KIND_TOGGLES.filter((t) => t.group === 'map')
    .map((m) => ({ user: users.find((u) => BILLBOARD_PAIRS[u.id] === m.id) ?? null, map: m }));
  users.forEach((u, i) => {
    if (BILLBOARD_PAIRS[u.id]) return;
    const before = users.slice(0, i).reverse().find((p) => rows.some((r) => r.user === p));
    const at = before ? rows.findIndex((r) => r.user === before) + 1 : 0;
    rows.splice(at, 0, { user: u, map: null });
  });
  return rows;
}
