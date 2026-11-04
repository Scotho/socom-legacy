import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, type Material, type Object3D } from 'three';
import type { LoadedMap } from '../loadMap';
import { DEFAULT_LIGHTING } from '../lighting';
import { buildWorld, type WorldView } from '../world';
import type { GlobalLighting } from '@s2u/scene';
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
export class PieceLibrary {
  private readonly templates = new Map<string, { view: WorldView; group: Group; rig: GlobalLighting | null } | null>();
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
  template(asset: string, map: LoadedMap): Group | null {
    if (this.templates.has(asset)) return this.templates.get(asset)?.group ?? null;
    const id = parseAssetId(asset);
    const one = id ? prototypeMap(map, id.model) : null;
    if (!one) { this.templates.set(asset, null); return null; }
    const view = buildWorld(one);
    view.setLighting({ ...DEFAULT_LIGHTING, rig: map.lightRig, brighten: this.brighten });
    // The reveal queues run at once: a piece is a few draws, not a map's thousands.
    for (const task of view.revealWorld) task();
    for (const task of view.revealProps) task();
    this.onBuild?.(view);
    this.templates.set(asset, { view, group: view.group, rig: map.lightRig });
    return view.group;
  }

  /** FG-24: the brighten on every template, built and to come; the same rig object, so `WorldView.setLighting` rebakes nothing. */
  setBrighten(brighten: number): void {
    this.brighten = brighten;
    for (const t of this.templates.values()) t?.view.setLighting({ ...DEFAULT_LIGHTING, rig: t.rig, brighten });
  }

  /** A new placement of `asset` (a clone of its template), tagged so a pick finds its root. */
  piece(asset: string, map: LoadedMap): Group | null {
    const t = this.template(asset, map);
    if (!t) return null;
    const g = new Group();
    g.add(t.clone(true));
    g.userData['forgePiece'] = asset;
    g.name = asset;
    return g;
  }

  dispose(): void {
    for (const t of this.templates.values()) t?.view.dispose();
    this.templates.clear();
  }
}

/** The team colours of the markers: the forge's own (no original), A gold and B cyan, as the design system's states. */
const TEAM_COLOUR = { A: 0xd8a640, B: 0x40c8d8 } as const;

/**
 * A team spawn marker (the forge's own drawing): a post 25 units tall and an arrow along its facing (-z, as the camera
 * looks), its yaw the group's.
 */
export function spawnMarker(team: 'A' | 'B'): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: TEAM_COLOUR[team], fog: false });
  const post = new Mesh(new CylinderGeometry(2, 2, 25, 8), mat);
  post.position.y = 12.5;
  const arrow = new Mesh(new ConeGeometry(4, 10, 8), mat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 25, -6);
  g.add(post, arrow);
  g.userData['forgeSpawn'] = team;
  g.name = `spawn ${team}`;
  return g;
}

/** The NPCs' side colours: the forge's own (no original), SEAL blue and terrorist red. */
export const SIDE_COLOUR = { seal: 0x5a9cff, terrorist: 0xe0503c } as const;

/** A bomb marker's kind: the start, or the team that plants at a site (the forge's own drawing, no original). */
export type BombMarkerKind = 'start' | 'seal' | 'terrorist';

/**
 * FG-51: a bomb start or a plant site, drawn as a spawn marker is -- a post and an arrow along its facing. The start is
 * sand, a site its planting team's colour (`SIDE_COLOUR`). `userData.forgeBomb` is the kind a pick and a save read.
 */
export function bombMarker(kind: BombMarkerKind): Group {
  const g = new Group();
  const color = kind === 'start' ? 0xf0e6c8 : SIDE_COLOUR[kind];
  const mat = new MeshBasicMaterial({ color, fog: false });
  const post = new Mesh(new CylinderGeometry(2, 2, 25, 8), mat);
  post.position.y = 12.5;
  const arrow = new Mesh(new ConeGeometry(4, 10, 8), mat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 25, -6);
  g.add(post, arrow);
  g.userData['forgeBomb'] = kind;
  g.name = kind === 'start' ? 'bomb start' : `bomb site ${kind}`;
  return g;
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
    if (at.userData['forgePiece'] || at.userData['forgeSpawn'] || at.userData['forgeNpc'] || at.userData['forgeBomb']) return at;
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
export function disposeGhost(g: Object3D): void {
  g.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of matsOf(o.material)) m.dispose();
  });
}
