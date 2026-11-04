import { BufferAttribute, Mesh, type Object3D } from 'three';
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
 *   drawn or not (a replay's watcher draws no HUD): the launch countdown's "GAME STARTS IN n SECONDS" after a seek.
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

export interface DevSeen {
  marker: string;
  bomb: BombWire | null;
  worldBomb: { visible: boolean; pos: [number, number, number] } | null;
  bodies: SeenBody[];
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
    ghosts: [...remote.ghosts],
    hud: { visible, drawn, posts: s.hud.postsForDev() },
  };
}

