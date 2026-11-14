import { BufferAttribute, Mesh, Vector3, type Object3D } from 'three';
import type { Hud } from './hud';
import type { BombWire } from './net/objective';
import type { RemotePlayers } from './remotePlayers';
import type { GrenadeThrower } from './grenade';

/**
 * RE-5 (web sprint 38; research 249 §7): what a replay's seek is SEEN by -- the dev hook's `devSeen()`, for the browser
 * spec `e2e/replayEngine.spec.ts`. Read only, never a write:
 * - **the bomb** as the page's `BombPage` holds it (`BombPage.state()`, the wire it last applied);
 * - **the world bomb's drawn model** (`GrenadeThrower.worldBomb`, `BOMB_MODEL_READING`'s Satchel): where it stands and
 *   whether it is shown, or null before its first placing;
 * - **each drawn body** (`RemotePlayers`): its life as its snapshot has it, the clip its `Play` plays and the key, the
 *   death clip and its age (`hydrateCorpse`, the corpse at its age), the gear asked (`RemotePlayers.setGearVisible`)
 *   and the gear drawn (each fitting's node shown or not: the carrier's Satchel), and the ghosts (`markGhost`);
 * - **the HUD's drawn quads**: the geometry the HUD pass filled on its last frame, by `layer:bitmap` (`Hud.render`'s
 *   batches, read off the HUD's own scene, `Hud.warmTarget`), each quad's centre in drawing-buffer pixels -- what was
 *   drawn, not the model it was drawn from; none while the HUD is not drawn (`Hud.render` returns before the draw);
 * - **the message window's lines** (RV-1, web sprint 39; research 276 §9): each post `Hud.postMessage` holds now
 *   (`Hud.postsForDev`), its lines' text and its age (`sinceOn` less its `at`, seconds) -- what the page posted,
 *   drawn or not (a replay's watcher draws no HUD): the launch countdown's "GAME STARTS IN n SECONDS" after a seek;
 * - **each drawn body's chest** (DEATH-PAGES, LATER 979; `chestOf`): the torso's facing off the body's posed bones, by
 *   research 421 section 1's measure, for every remote body (`chests`, by id) and for the page's own body (`own`: a body
 *   group of the scene that no remote draws), so `e2e/deathPages.spec.ts` can say whether a page draws the room's death
 *   clip to the end the disc gives it.
 *
 * The page's objects are read through their public read-only accessors, never their private fields (PAR-41):
 * `RemotePlayers.seenForDev` (the bodies, the ghosts and the gear asked), `GrenadeThrower.worldBombForDev` (the bomb
 * model) and `Hud.postsForDev` (the message window's posts, RV-1's read, moved onto an accessor at the merge with
 * PAR-41), so a rename inside any of them is a type error here. A development build's only, as the keyboard is
 * (OT.R29): `./main` hangs it on the hook under a literal `import.meta.env.DEV`, which every `vite build` folds away
 * with this module; `DEV_SEEN_MARKER` is what the release check (`test/devSeen.test.ts`, its `builtDist` guard) finds
 * absent. The three accessors are class methods, kept by a release build unused (nothing there calls them; no name
 * holds `devSeen`). A browser adaptation: a playtest instrument with no original, changing nothing the game does.
 */
export const DEV_SEEN_MARKER = 's2u-dev-seen-reads';

/** One drawn body, as the page draws it now. */
export interface SeenBody {
  id: number;
  /** A hostage's index among the map's escortees (`RemotePlayers.setEscortee`), or null for a player. */
  escortee: number | null;
  /** The body's group shown this frame (`RemotePlayers.frame`: a ghost, a faded corpse and a 0 opacity are not). */
  visible: boolean;
  /** Alive in the snapshot the body was last drawn from, or null before one. */
  alive: boolean | null;
  /** The clip its `Play` plays now and the clip's key (a corpse's death pose rides it), or null. */
  clip: string | null;
  frame: number | null;
  /** Its death clip (a kill's, or the corpse hydrated at its age), or null; and seconds since the death. */
  deathClip: string | null;
  deadFor: number;
  /**
   * The gear asked shown beyond the body's own -- `RemotePlayers.setGearVisible`'s, kept by id (the bomb's carrier's
   * Satchel; a remote body's `Play.shownGear` is not where it is kept: run 11 read it empty on a carrier drawing its
   * Satchel) -- and each fitting's node as drawn.
   */
  gear: string[];
  gearDrawn: Record<string, boolean>;
}

/**
 * DEATH-PAGES (LATER 979; research 421 section 1): a drawn body's chest, read off its bones' world matrices as the last
 * render left them (`chestOf`). Degrees.
 */
export interface ChestRead {
  /** The torso's front's elevation in the world: +90 straight up (face up), -90 straight down (face down). */
  chest: number;
  /** The same in the body's own frame (its group's axes): `deathPoses.test.ts`'s measure, blind to a tilt of the group. */
  bodyChest: number;
  /** The front's dot with the body's facing (its group's -z): about 1 for a body standing in its idle (the calibration). */
  ahead: number;
  /** The group's up against the world's, degrees (a root tilt laid on the whole body). */
  tilt: number;
}

export interface DevSeen {
  marker: string;
  bomb: BombWire | null;
  worldBomb: { visible: boolean; pos: [number, number, number] } | null;
  bodies: SeenBody[];
  /** DEATH-PAGES: each drawn body's chest (`chestOf`), by id, in `bodies`' order; null with the four bones absent. */
  chests: { id: number; chest: ChestRead | null }[];
  /**
   * DEATH-PAGES: the page's own body -- every body group of the drawn bodies' scene (a group named `body <model>` with
   * bones, `./bodyView` `buildBody`) that no remote draws: its name, whether it is shown, where it stands and its chest.
   * Empty with no remote drawn (the scene is found through one).
   */
  own: { name: string; visible: boolean; at: [number, number, number]; chest: ChestRead | null }[];
  ghosts: number[];
  hud: {
    visible: boolean; drawn: Record<string, { x: number; y: number }[]>;
    /** RV-1: the message window's posts held now, oldest first: each one's lines' text (newline-joined), age (s). */
    posts: { text: string; age: number }[];
  };
}

/** The pages' objects the read takes (`./main`'s): of `GrenadeThrower` and `RemotePlayers`, their dev accessors only. */
export interface DevSeenSources {
  bomb: { state(): BombWire | null };
  grenade: Pick<GrenadeThrower, 'worldBombForDev'>;
  remote: Pick<RemotePlayers, 'seenForDev'>;
  hud: Pick<Hud, 'state' | 'warmTarget' | 'postsForDev'>;
}

/** Visible with every ancestor up to `root` (a node under a hidden holder is not drawn). */
function shownUnder(node: Object3D, root: Object3D): boolean {
  for (let o: Object3D | null = node; o; o = o === root ? null : o.parent) if (!o.visible) return false;
  return true;
}

const DEG = 180 / Math.PI;

/** A bone of `group` by its part name (`./bodyView`: one bone a part, named by it), or null. */
function boneOf(group: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  group.traverse((o) => { if (!found && o.name === name && (o as { isBone?: boolean }).isBone === true) found = o; });
  return found;
}

/**
 * DEATH-PAGES (LATER 979; product track, a development instrument -- no original, nothing the game does changes): the
 * chest of a drawn body by research 421 section 1's measure -- the torso's normal `(lbicep - rbicep) x (neck - spinelo)`,
 * exactly the body's front (-z) in the bind -- off its bones' world matrices as the last render left them (read, never
 * written: no matrix is updated here). A mirrored group turns the cross product, so it is turned back. Null when one of
 * the four bones is absent or the torso has no area.
 */
export function chestOf(group: Object3D): ChestRead | null {
  const at = (name: string): Vector3 | null => {
    const bone = boneOf(group, name);
    return bone ? new Vector3().setFromMatrixPosition(bone.matrixWorld) : null;
  };
  const l = at('lbicep'), r = at('rbicep'), neck = at('neck'), lo = at('spinelo');
  if (!l || !r || !neck || !lo) return null;
  const front = l.sub(r).cross(neck.sub(lo));
  if (front.lengthSq() === 0) return null;
  front.normalize();
  const e = group.matrixWorld.elements;
  const x = new Vector3(e[0], e[1], e[2]).normalize(), y = new Vector3(e[4], e[5], e[6]).normalize(), z = new Vector3(e[8], e[9], e[10]).normalize();
  if (new Vector3().crossVectors(x, y).dot(z) < 0) front.negate();
  const elevation = (v: number): number => Math.asin(Math.max(-1, Math.min(1, v))) * DEG;
  return {
    chest: elevation(front.y),
    bodyChest: elevation(front.dot(y)),
    ahead: -front.dot(z),
    tilt: Math.acos(Math.max(-1, Math.min(1, y.y))) * DEG,
  };
}

/** DEATH-PAGES: the page's own body groups -- `body <model>` groups with bones in `root` that are not `drawn`. */
function ownBodies(root: Object3D, drawn: ReadonlySet<Object3D>): DevSeen['own'] {
  const out: DevSeen['own'] = [];
  root.traverse((o) => {
    if (drawn.has(o) || !o.name.startsWith('body ') || !o.children.some((c) => (c as { isBone?: boolean }).isBone === true)) return;
    const p = new Vector3().setFromMatrixPosition(o.matrixWorld);
    let shown = true;
    for (let q: Object3D | null = o; q; q = q.parent) if (!q.visible) { shown = false; break; }
    out.push({ name: o.name, visible: shown, at: [p.x, p.y, p.z], chest: chestOf(o) });
  });
  return out;
}

export function devSeen(s: DevSeenSources): DevSeen {
  const state = s.bomb.state();
  const remote = s.remote.seenForDev();
  const bodies = remote.bodies.map((r): SeenBody => {
    const anim = r.anim;
    const gearDrawn: Record<string, boolean> = {};
    for (const name of r.fittingNames) {
      const node = r.group.getObjectByName(name);
      if (node) gearDrawn[name] = shownUnder(node, r.group);
    }
    return {
      id: r.id, escortee: r.escortee, visible: r.group.visible, alive: r.alive,
      clip: anim?.clip || null, frame: anim?.clip ? anim.frame : null, deathClip: r.deathClip, deadFor: r.deadFor,
      gear: [...(remote.gearShown.get(r.id) ?? [])], gearDrawn,
    };
  });
  const chests = remote.bodies.map((r) => ({ id: r.id, chest: chestOf(r.group) }));
  let root: Object3D | null = remote.bodies[0]?.group ?? null;
  while (root?.parent) root = root.parent;
  const own = root ? ownBodies(root, new Set(remote.bodies.map((r) => r.group))) : [];
  const visible = s.hud.state().visible;
  const drawn: Record<string, { x: number; y: number }[]> = {};
  if (visible) {
    for (const c of s.hud.warmTarget().scene.children) {
      if (!(c instanceof Mesh) || !c.visible) continue;
      const m = /^hud (\d+) (.+)$/.exec((c.material as { name: string }).name);
      if (!m) continue;                                  // the untextured shapes
      const count = Math.floor(c.geometry.drawRange.count / 6);
      const pos = c.geometry.getAttribute('position') as BufferAttribute;
      const quads: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        let x = 0, y = 0;
        for (let k = 0; k < 4; k++) { x += pos.getX(i * 4 + k); y += pos.getY(i * 4 + k); }
        quads.push({ x: x / 4, y: y / 4 });
      }
      if (quads.length) drawn[`${m[1]}:${m[2]}`] = quads;
    }
  }
  return {
    marker: DEV_SEEN_MARKER,
    bomb: state ? (JSON.parse(JSON.stringify(state)) as BombWire) : null,
    worldBomb: s.grenade.worldBombForDev(),
    bodies,
    chests,
    own,
    ghosts: [...remote.ghosts],
    hud: { visible, drawn, posts: s.hud.postsForDev() },
  };
}

