import type { EffectOp, Grid } from '@s2u/scene';
import type { LoadedMap } from './loadMap';
import { groundGrid } from './mover';
import { bareMeta, GLASS_FRAGMENTS_PLACEHOLDER, WorldState } from './worldState';

/**
 * MATCH-GAPS (web research 222 §9): the page's world -- `./worldState` on the walk's hull, its scene destructibles C4's
 * targets (SUP-03), its running scene programs (SUP-02), the room's followed through protocol 10 (MAP-03) -- built from
 * a map as `/testroom`'s `show` builds its `pageWorld` (`./main`, MAP-02): one hull grid of the map's ground, shared with
 * the walk (`WalkMode.setGround`'s third argument), the map's metadata (else `bareMeta`), zAnim's opening state
 * (`applyInitial`). The page lends its draw, its sound, its effects and its log (`PageWorldHooks`).
 *
 * The front end's match (`./matchMount`) builds its world here; `/testroom` still builds its own in `./main` with the
 * same calls (sprint 31's wave 4 holds `main.ts`), and is to adopt this one once that lands (research 222 §9: owed).
 */

/** What the page lends its world: the draw of a node, a program's sound and effect, a line of the page's log. */
export interface PageWorldHooks {
  /** `WorldView.setNodeActive`: every placement at or under `path` drawn (`on`) or hidden. */
  setNodeActive(path: string, on: boolean): void;
  /** PB-9b: `WorldView.setNodeOpacity` -- a program's opacity on a node (the bases' pulse outlines, research 284 s8). */
  setNodeOpacity?(path: string, opacity: number): void;
  /** LATER 782: `WorldView.setNodeUvOffset` -- a program's `SCROLL_MOTION` on a node (Fish Hook's washes and water). */
  setNodeUvOffset?(path: string, u: number, v: number): void;
  /** A program's `SOUND` where the world places it (null: without a place; `SCENE_SOUND_PLACE_READING`), at its volume. */
  sound(name: string, at: [number, number, number] | null, volume: number): void;
  /** XR-04: a program's common-set effect (`COMMON_EFFECT_CALL_READING`) at the calling program's root. */
  effect(name: string, at: [number, number, number]): void;
  /** A line of the page's log (`console.info` on both pages). */
  log(line: string): void;
  /** A program's `MESSAGE` text (a Forge switch's script): the HUD's message window. */
  message?(text: string, colour?: number): void;
  /** FORGE_SCRIPT_BLAST_ADAPTATION: a Forge script's blast drawn at its place (`../effects` `Effects.scriptRound`). */
  scriptRound?(op: Extract<EffectOp, { op: 'fireWeapon' }>, at: [number, number, number]): void;
}

/** The page's world and the hull grid it keeps, the walk's to stand on; null for a map with no ground. */
export interface PageWorld { world: WorldState; grid: Grid }

/**
 * The page's world for `map` (`./main`'s `show`, its `pageWorld` lines), or null when the map has no ground. `ambient`
 * is the effect runner's ambient effects (`EffectData.ambient`) when in hand (LATER 409 F1: `WorldState.setAmbient`).
 */
export function buildPageWorld(map: LoadedMap, hooks: PageWorldHooks, ambient: readonly string[] | null = null): PageWorld | null {
  if (!map.ground) return null;
  const grid = groundGrid(map.ground);
  // SUP-02: DESTRUCTION_SOURCE logged once a node (GLASS_FRAGMENTS_PLACEHOLDER: no fragment is drawn).
  const debrisSeen = new Set<string>();
  const world: WorldState = new WorldState(map.meta ?? bareMeta(), map.ground, grid, {
    visible: (path, on) => { hooks.setNodeActive(path, on); },
    opacity: (path, f) => { hooks.setNodeOpacity?.(path, f); },
    scroll: (path, u, v) => { hooks.setNodeUvOffset?.(path, u, v); },
    sound: (name, _path, volume, at) => { hooks.sound(name, at, volume); },   // SCENE_SOUND_PLACE_READING: the node's origin
    call: (name, path) => {
      const at = path !== null ? world.placeOf(path) : null;
      if (at) hooks.effect(name, at);
    },
    message: (text, colour) => { hooks.message?.(text, colour); },
    scriptRound: (op, path) => {
      const at = path !== null ? world.placeOf(path) : null;
      if (at) hooks.scriptRound?.(op, at);
    },
    destruction: (path) => {
      const key = path ?? '';
      if (debrisSeen.has(key)) return;
      debrisSeen.add(key);
      hooks.log(`world: DESTRUCTION_SOURCE at ${path ?? '(no node)'} -- ${GLASS_FRAGMENTS_PLACEHOLDER}: no fragments drawn`);
    },
  });
  world.runAutostartPrograms = true;             // AS-1: the page runs the autostart programs (the room does not)
  world.setAmbient(ambient);                     // LATER 409 F1: what the effect runner plays stays its own
  world.applyInitial();
  return { world, grid };
}
