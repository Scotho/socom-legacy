import { HOSTAGE_GUIDE_COLOUR, keepWorldTurn } from './interactOverlay';
import {
  BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  CanvasTexture, RingGeometry, Sprite, SpriteMaterial, type Material, type Object3D,
} from 'three';
import type { LoadedMap } from '../loadMap';
import { DEFAULT_LIGHTING } from '../lighting';
import { SLOT_CELL, slotBoxSegments, slotSegments, SPAWN_COLOURS } from '../overlays';
import { buildWorld, type WorldView } from '../world';
import { facingVector, type GlobalLighting, type SpawnSlot } from '@s2u/scene';
import { parseAssetId } from './layout';
import { prototypeMap } from './library';

/**
 * FORGE (a browser adaptation, no original): a piece is one of the disc's prop prototypes drawn by the viewer's own
 * world builder (`../world` `buildWorld`), lit by its archive's own `GlobalLighting` as the map lights it -- built once
 * per prototype, then cloned (geometry, materials and textures shared) for every placement.
 *
 * Known limit, said rather than hidden: the rig's light is baked into the vertex colours at build (`../lighting`), so a
 * piece turned from the way it was built keeps the light it had at the identity.
 */
/**
 * How much brighter a preview's prop is drawn than the world's default (a browser adaptation's own value, FG.R2): the
 * map's props are lit dark for the game's night and dusk, and in a small tile on a grey ground they read as silhouettes.
 * A gain (../lighting rightenOf: 1 + brighten / 128), 1 the world's own.
 */
export const PREVIEW_BRIGHTEN = 1.7;

export class PieceLibrary {
  private readonly templates = new Map<string, { view: WorldView; group: Group; rig: GlobalLighting | null } | null>();
  /**
   * The asset browser's previews' own templates (the owner, 2026-11-11: previews "normal textured, and geometry"): built
   * as the placed ones are but never given the page's Draw switches (`onBuild`) -- the world's defaults, no wireframe --
   * since a clone shares its template's materials and what the Draw switches set on them.
   */
  private readonly previewTemplates = new Map<string, { view: WorldView; group: Group; rig: GlobalLighting | null } | null>();
  /** The placed ones' templates (the page's day / night and rig reach these, never a preview's). */
  private placed(): { view: WorldView; group: Group; rig: GlobalLighting | null }[] {
    return [...this.templates.values()].flatMap((t) => (t ? [t] : []));
  }
  private all(): { view: WorldView; group: Group; rig: GlobalLighting | null }[] {
    return [...this.templates.values(), ...this.previewTemplates.values()].flatMap((t) => (t ? [t] : []));
  }
  /** A template built from `one` (its reveal queues run at once: a piece is a few draws), the Draw switches on it unless a preview's. */
  private build(one: LoadedMap, rig: GlobalLighting | null, preview: boolean): { view: WorldView; group: Group; rig: GlobalLighting | null } {
    const view = buildWorld(one);
    // A preview's own light (the owner, 2026-11-11: most props "quite dark" in the asset browser): its archive's rig,
    // brighter by PREVIEW_BRIGHTEN -- the day / night and a blank map's rig never reach it; the placed ones keep theirs.
    view.setLighting(preview
      ? { ...DEFAULT_LIGHTING, rig, brighten: (PREVIEW_BRIGHTEN - 1) * 128 }
      : { ...DEFAULT_LIGHTING, rig: this.rigOverride ?? rig, brighten: this.brighten });
    for (const task of view.revealWorld) task();
    for (const task of view.revealProps) task();
    if (!preview) this.onBuild?.(view);
    return { view, group: view.group, rig };
  }
  /**
   * FG-24: the brighten the page's day / night setting puts on every template (`./settings` `brightenFor`; an
   * adaptation, no original): a uniform, moved without a rebake -- each template keeps its own archive's rig.
   */
  private brighten = DEFAULT_LIGHTING.brighten;
  /** Called with each template's view once built: the page's view settings (wireframe, shadows...) put on it. */
  onBuild: ((view: WorldView) => void) | null = null;

  /** Every template's view: a setting put on one reaches every clone of it (they share its materials). */
  views(): WorldView[] {
    return [...this.templates.values()].flatMap((t) => (t ? [t.view] : []));
  }

  /** The template for `asset` out of its archive's decoded map, or null when the archive holds no such prototype. */
  template(asset: string, map: LoadedMap, preview = false): Group | null {
    const cache = preview ? this.previewTemplates : this.templates;
    if (cache.has(asset)) return cache.get(asset)?.group ?? null;
    const id = parseAssetId(asset);
    const one = id ? prototypeMap(map, id.model) : null;
    if (!one) { cache.set(asset, null); return null; }
    const t = this.build(one, map.lightRig, preview);
    cache.set(asset, t);
    return t.group;
  }

  /**
   * A placement drawn from a map of its own (a turret's template, `./turrets` `turretModelMap`): built once by `key`
   * as a prototype is, then a clone each time.
   */
  modelOf(key: string, one: LoadedMap, preview = false): Group | null {
    const cache = preview ? this.previewTemplates : this.templates;
    if (!cache.has(key)) cache.set(key, this.build(one, one.lightRig, preview));
    const t = cache.get(key);
    if (!t) return null;
    const g = new Group();
    g.add(t.group.clone(true));
    return g;
  }

  /**
   * A new empty map's own light rig (`LayoutSettings.lightRig`; a browser adaptation, FG.R2) over every template's own --
   * built and to come -- or null for each template's archive's rig again. The vertex colours rebake under it.
   */
  private rigOverride: GlobalLighting | null = null;
  setRig(rig: GlobalLighting | null): void {
    this.rigOverride = rig;
    for (const t of this.placed()) t.view.setLighting({ ...DEFAULT_LIGHTING, rig: rig ?? t.rig, brighten: this.brighten });
  }

  /** FG-24: the brighten on every template, built and to come; the same rig object, so `WorldView.setLighting` rebakes nothing. */
  setBrighten(brighten: number): void {
    this.brighten = brighten;
    for (const t of this.placed()) t.view.setLighting({ ...DEFAULT_LIGHTING, rig: this.rigOverride ?? t.rig, brighten });
  }

  /** A new placement of `asset` (a clone of its template), tagged so a pick finds its root; `preview`: a preview's template. */
  piece(asset: string, map: LoadedMap, preview = false): Group | null {
    const t = this.template(asset, map, preview);
    if (!t) return null;
    const g = new Group();
    g.add(t.clone(true));
    g.userData['forgePiece'] = asset;
    g.name = asset;
    return g;
  }

  dispose(): void {
    for (const t of this.all()) t.view.dispose();
    this.templates.clear();
    this.previewTemplates.clear();
  }
}

/**
 * A placed marker drawn as the disc's spawn slots are (`../overlays` `slotSegments`: a slot's 10-unit cell and its facing
 * arrow, one cell along -z, the group's yaw turning it), in `colour`, over the geometry as the slots overlay draws; and an
 * unseen box a body's size over the cell, so a click finds it and a frame has its extent. Its billboard
 * (`./mapDataBillboards`) is its icon. `dispose` frees what it made.
 */
/**
 * The placed spawns' cells shown or not: the page's Disc spawn slots switch (Billboards, Overlays) shows or hides the
 * disc's slots and these alike, a browser adaptation (FG.R2). Every live cell, so a switch reaches each one, and a cell
 * made later starts as the switch stands.
 */
const slotCells = new Set<LineSegments>();
let slotCellsShown = true;
export function setSlotCellsShown(on: boolean): void {
  slotCellsShown = on;
  for (const l of slotCells) l.visible = on;
}

/** `withSlots`: the cell shown and hidden with the Disc spawn slots switch (`setSlotCellsShown`), as a spawn's is. */
function slotMark(colour: number | null, withSlots = true, arrow = true): { parts: Object3D[]; dispose(): void } {
  // `null`: no cell drawn -- the unseen box alone, the billboard its whole look (a bomb marker's).
  if (colour === null) {
    const pickGeometry = new BoxGeometry(SLOT_CELL * 2, 20, SLOT_CELL * 2);
    const pickMat = new MeshBasicMaterial({ visible: false });
    const pick = new Mesh(pickGeometry, pickMat);
    pick.position.y = 10;
    return { parts: [pick], dispose: () => { pickGeometry.dispose(); pickMat.dispose(); } };
  }
  const at: SpawnSlot = { side: 0, index: 0, position: [0, 0.5, 0], onFloor: true, step: 0, facing: facingVector(0), loc: { map: 0, x: 0, z: 0 } };
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(arrow ? slotSegments([at]) : slotBoxSegments([at]), 3));
  const lineMat = new LineBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false });
  const lines = new LineSegments(geometry, lineMat);
  lines.renderOrder = 10_000;                                   // over the geometry, as the slots overlay draws
  lines.raycast = () => undefined;                             // the box below is what a click finds
  lines.visible = withSlots ? slotCellsShown : true;
  if (withSlots) slotCells.add(lines);
  const pickGeometry = new BoxGeometry(SLOT_CELL * 2, 20, SLOT_CELL * 2);
  const pickMat = new MeshBasicMaterial({ visible: false });
  const pick = new Mesh(pickGeometry, pickMat);
  pick.position.y = 10;
  return {
    parts: [lines, pick],
    dispose: () => { slotCells.delete(lines); geometry.dispose(); lineMat.dispose(); pickGeometry.dispose(); pickMat.dispose(); },
  };
}

/**
 * A team spawn marker (the forge's own placement, drawn as a disc spawn slot is -- `slotMark` -- in the slots overlay's
 * side colour, `../overlays` SPAWN_COLOURS: A blue, B orange), its facing -z as the camera looks, its yaw the group's.
 */
export function spawnMarker(team: 'A' | 'B'): Group {
  const g = new Group();
  const mark = slotMark(team === 'A' ? SPAWN_COLOURS.a : SPAWN_COLOURS.b);
  g.add(...mark.parts);
  g.userData['forgeSpawn'] = team;
  g.userData['dispose'] = mark.dispose;
  g.name = `spawn ${team}`;
  return g;
}

/** A placed respawn point's colours: the map's respawn billboards' (`./mapDataBillboards` respawnA, respawnB). */
export const RESPAWN_COLOURS = { a: 0x9cc8ff, b: 0xffa27f } as const;

/**
 * A placed respawn point (`Layout.respawns`; a browser adaptation, FG.R2): a spawn's cell and arrow in its team's respawn
 * colour. `userData.forgeRespawn` is the team a pick and a save read.
 */
export function respawnMarker(team: 'A' | 'B'): Group {
  const g = new Group();
  const mark = slotMark(team === 'A' ? RESPAWN_COLOURS.a : RESPAWN_COLOURS.b);
  g.add(...mark.parts);
  g.userData['forgeRespawn'] = team;
  g.userData['dispose'] = mark.dispose;
  g.name = `respawn ${team}`;
  return g;
}

/** The NPCs' side colours: the forge's own (no original), SEAL blue and terrorist red. */
export const SIDE_COLOUR = { seal: 0x5a9cff, terrorist: 0xe0503c } as const;

/** A bomb marker's kind: the start, or the team that plants at a site (the forge's own drawing, no original). */
export type BombMarkerKind = 'start' | 'seal' | 'terrorist';

/**
 * FG-51: a bomb start or a plant site: no drawing of its own -- its billboard (`./mapDataBillboards` userBombStart, a site
 * its team's) is its look -- and the unseen box a click finds (`slotMark(null)`). `userData.forgeBomb` is the kind a pick
 * and a save read.
 */
export function bombMarker(kind: BombMarkerKind): Group {
  const g = new Group();
  const mark = slotMark(null);
  g.add(...mark.parts);
  g.userData['dispose'] = mark.dispose;
  g.userData['forgeBomb'] = kind;
  g.name = kind === 'start' ? 'bomb start' : `bomb site ${kind}`;
  return g;
}
/**
 * A placed hostage's marker (`Layout.hostages`; a browser adaptation, FG.R2): no drawing of its own -- the unseen pick
 * box alone (`slotMark(null)`), its billboard (`./mapDataBillboards`, the map's hostages' H, square) its whole look.
 */
export function hostageMarker(): Group {
  const g = new Group();
  // A spawn's gizmo (the owner, 2026-11-06): its cell box alone, in the hostage's yellow, always shown -- no arrow, a
  // hostage's facing does not matter -- square on the world, as the AI grid's cell it stands on, whatever the marker's turn.
  const mark = slotMark(HOSTAGE_GUIDE_COLOUR, true, false);
  for (const p of mark.parts) if (p instanceof LineSegments) keepWorldTurn(p);
  g.add(...mark.parts);
  g.userData['dispose'] = mark.dispose;
  g.userData['forgeHostage'] = true;
  g.name = 'hostage';
  return g;
}
/**
 * A placed extraction zone's marker (`Layout.extractionZones`; a browser adaptation, FG.R2): its rectangle on the ground,
 * `w` along x and `d` along z about the group's origin, in the tactical zones' green (`./mapDataBillboards` `tacZones`)
 * over the geometry, and an unseen box over it a click finds. Its billboard (Z, square) names it. Not turned: a zone is
 * axis-aligned on the AI grid.
 */
export function extractionZoneMarker(w: number, d: number): Group {
  const g = new Group();
  const x = w / 2, z = d / 2, y = 0.5;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    -x, y, -z, x, y, -z, x, y, -z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, y, -z,
  ]), 3));
  const lineMat = new LineBasicMaterial({ color: 0x3fb58a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false });
  const lines = new LineSegments(geometry, lineMat);
  lines.renderOrder = 10_000;
  lines.raycast = () => undefined;
  const pickGeometry = new BoxGeometry(w, 20, d);
  const pickMat = new MeshBasicMaterial({ visible: false });
  const pick = new Mesh(pickGeometry, pickMat);
  pick.position.y = 10;
  g.add(lines, pick);
  g.userData['dispose'] = (): void => { geometry.dispose(); lineMat.dispose(); pickGeometry.dispose(); pickMat.dispose(); };
  g.userData['forgeZone'] = { w, d };
  g.name = 'extraction zone';
  return g;
}
/**
 * A placed tactical point's or spectator view's marker (`Layout.tacPoints`, `Layout.scenicViews`; a browser adaptation):
 * no drawing of its own, the unseen pick box (`slotMark(null)`), its billboard (P, V, square) its whole look.
 */
export function pointMarker(kind: 'point' | 'view'): Group {
  const g = new Group();
  const mark = slotMark(null);
  g.add(...mark.parts);
  g.userData['dispose'] = mark.dispose;
  g.name = kind === 'point' ? 'tactical point' : 'spectator view';
  return g;
}

/** The tactical zones' outline colour: their billboard's green (`./mapDataBillboards` `tacZones`), a placed zone's too. */
export const ZONE_OUTLINE_COLOUR = 0x3fb58a;

/**
 * The base map's tactical zones as ground rectangles (a browser adaptation, FG.R2), the placed zones' look
 * (`extractionZoneMarker`): one line set, each rectangle at its own height, over the geometry, never picked (its
 * billboard is). `dispose` frees it.
 */
export function zoneOutlines(rects: readonly { minX: number; minZ: number; maxX: number; maxZ: number; y: number }[]): LineSegments {
  const v: number[] = [];
  for (const r of rects) {
    const y = r.y + 0.5;
    v.push(r.minX, y, r.minZ, r.maxX, y, r.minZ, r.maxX, y, r.minZ, r.maxX, y, r.maxZ,
      r.maxX, y, r.maxZ, r.minX, y, r.maxZ, r.minX, y, r.maxZ, r.minX, y, r.minZ);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: ZONE_OUTLINE_COLOUR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false }));
  lines.renderOrder = 10_000;
  lines.raycast = () => undefined;
  lines.name = 'forge map tactical zones';
  lines.userData['forgeLightingInstrument'] = true;          // an editor guide, as the billboards
  return lines;
}

/** The figure's stand-in where the map has no body for the type: a post the height of a standing body, 72 units. */
const STAND_IN_HEIGHT = 72;

/**
 * FG-21: an NPC's marker -- `figure` (the character's own body, built by the caller from the map's types) standing on a
 * ring of its side's colour, an arrow the way it faces; a coloured post where there is no figure. Tagged so a pick finds
 * its root; `userData.dispose` frees the figure's own resources.
 */
export function npcMarker(side: 'seal' | 'terrorist', type: number, figure: { group: Object3D; dispose(): void } | null): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: SIDE_COLOUR[side], fog: false });
  const ring = new Mesh(new RingGeometry(14, 18, 24), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.5;
  const arrow = new Mesh(new ConeGeometry(4, 10, 8), mat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 1, -24);
  g.add(ring, arrow);
  if (figure) g.add(figure.group);
  else {
    const post = new Mesh(new CylinderGeometry(6, 6, STAND_IN_HEIGHT, 10), mat);
    post.position.y = STAND_IN_HEIGHT / 2;
    g.add(post);
  }
  g.userData['forgeNpc'] = { side, type };
  g.userData['dispose'] = () => { figure?.dispose(); ring.geometry.dispose(); arrow.geometry.dispose(); mat.dispose(); };
  g.name = `npc ${side} ${type}`;
  return g;
}

/**
 * A piece whose prototype this disc does not hold (`MP2:does_not_exist`). It stays in the layout -- the same asset id
 * and, once placed, the same matrix -- so a save does not drop it, and the outliner lists it as missing. A wire box is
 * the forge's own stand-in (no disc geometry).
 */
export function missingPiece(asset: string): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: 0xc45c26, wireframe: true, fog: false });
  const box = new Mesh(new BoxGeometry(50, 50, 50), mat);
  box.position.y = 25;
  g.add(box);
  g.userData['forgePiece'] = asset;
  g.userData['forgeMissing'] = true;
  g.userData['dispose'] = () => { box.geometry.dispose(); mat.dispose(); };
  g.name = asset;
  return g;
}

/** The forge root a picked object belongs to (a piece or a marker), or null for the base. A ghost is not a piece. */
export function forgeRootOf(o: Object3D | null): Object3D | null {
  for (let at = o; at; at = at.parent) {
    if (at.userData['forgeGhost']) return null;
    if (at.userData['forgePiece'] || at.userData['forgeSpawn'] || at.userData['forgeRespawn'] || at.userData['forgeFlare'] || at.userData['forgeNpc'] || at.userData['forgeBomb']
      || at.userData['forgeHostage'] || at.userData['forgeZone'] || at.userData['forgePoint'] || at.userData['forgeView'] || at.userData['forgeTurret'] || at.userData['forgeDoor'] || at.userData['forgeGate'] || at.userData['forgeBarrier'] || at.userData['forgeTrigger']) return at;
  }
  return null;
}

/**
 * The forge's own block (no disc, no original): a cube whose origin is its base, so a placement at the hull's height
 * rests on the floor. The development bench (`?bench`) places it when no archive is loaded. `forge:block` is
 * not a disc prototype.
 */
export const FORGE_BLOCK = 'forge:block';
const BLOCK_SIZE = 50;

export function blockPiece(): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: 0x7fb3c4, fog: false });
  const mesh = new Mesh(new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), mat);
  mesh.position.y = BLOCK_SIZE / 2;
  g.add(mesh);
  g.userData['forgePiece'] = FORGE_BLOCK;
  g.userData['dispose'] = () => { mesh.geometry.dispose(); mat.dispose(); };
  g.name = FORGE_BLOCK;
  return g;
}

const matsOf = (m: Material | Material[]): Material[] => (Array.isArray(m) ? m : [m]);

/**
 * A translucent copy of a piece for the place-mode ghost. Geometry and materials are its own, so hiding it does not
 * change the piece. The source is not kept: a block's own geometry is freed (it is not a shared template).
 */
export function ghostOf(source: Object3D): Object3D {
  const block = source.userData['forgePiece'] === FORGE_BLOCK;
  const g = source.clone(true);
  g.traverse((o) => {
    delete o.userData['forgePiece'];
    delete o.userData['forgeSpawn'];
    delete o.userData['forgeNpc'];
    delete o.userData['dispose'];
    if (!(o instanceof Mesh)) return;
    o.geometry = o.geometry.clone();
    const cloned = matsOf(o.material).map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.4;
      c.depthWrite = false;
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0]!;
  });
  g.userData = { forgeGhost: true };
  g.name = 'ghost';
  if (block) {
    source.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      for (const m of matsOf(o.material)) m.dispose();
    });
  }
  return g;
}

/** Frees a ghost's own geometry and materials. */
/**
 * A ghost's icon (the owner, 2026-11-10: "I don't see a live preview" of a bomb start, a site, a point...; a browser
 * adaptation, FG.R2): a marker drawn by its billboard alone (`./mapDataBillboards`, placed markers only) has nothing a
 * ghost can show -- so its ghost wears that billboard's letter on its colour (`mark`), square, a constant size on the
 * screen, over the marker's pick box. Freed with the ghost (`disposeGhost`).
 */
export function ghostIcon(mark: { glyph: string; colour: string }): Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = mark.colour;
    g.fillRect(4, 4, 56, 56);
    g.fillStyle = '#ffffff';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(mark.glyph, 32, 34);
  }
  const tex = new CanvasTexture(c);
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set(GHOST_ICON_SCALE, GHOST_ICON_SCALE, 1);
  sprite.position.y = 24;
  sprite.renderOrder = 10_001;
  sprite.raycast = () => undefined;
  sprite.name = 'ghost icon';
  return sprite;
}
/** A ghost icon's size: a share of the screen's height (`sizeAttenuation` off), about a placed billboard's. */
const GHOST_ICON_SCALE = 0.045;

export function disposeGhost(g: Object3D): void {
  g.traverse((o) => {
    // A ghost's own icon (`ghostIcon`): its texture and material are the ghost's alone.
    if (o instanceof Sprite) { o.material.map?.dispose(); o.material.dispose(); return; }
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of matsOf(o.material)) m.dispose();
  });
}
