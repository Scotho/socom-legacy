import type { Group } from 'three';

/**
 * LATER 253: the map's effects compiled before their first use on a match page. A browser adaptation (OT.R28) of the
 * renderer's first use -- nothing of the game changes; it moves the cost of building the effects' programs and
 * uploading their bitmaps from the frame of the first shot or the first blast to the match's first frames, once the
 * map and the renderer are in (on the front end's match the loading screen is already gone then -- `./lobbyMatch`
 * `begin` hides it before the match mounts -- and the pad held until the round starts; LATER 254 moves it under the
 * cover).
 *
 * Measured on the front end's match (the owner's report, 2026-10-21: "the first grenade, the first bullet, they still lag
 * the client"): its first shot took a 617 ms frame (12 shaders compiled, 9 programs linked) and its first explosion an
 * 817 ms one (17 and 14), where `/testroom` -- which warms them (`./main` `warmEffects`, research 90 items 16 and 19) --
 * linked none. The sequence is `./main`'s, shared: the effects' warm-up group in the scene (`Effects.warmUp`), the
 * renderer's whole-scene compile (a light pass compiled for the canvas alone still stalled the first blast, research
 * 90 item 19), the group out of the drawn scene once the compile has its list (`warmStarted`), and gone when it settles
 * (`warmDone`).
 */
export interface WarmableEffects {
  stats(): { loaded: boolean };
  warmUp(): Group;
  warmStarted(g: Group): void;
  warmDone(g: Group): void;
}

/** The effects' warm-up through `compile` (the renderer's whole-scene compile); nothing when no effects are loaded. */
export async function warmMapEffects(effects: WarmableEffects, compile: () => Promise<void>): Promise<void> {
  if (!effects.stats().loaded) return;
  const g = effects.warmUp();
  try {
    let compiling: Promise<void>;
    try {
      compiling = compile();
    } finally {
      effects.warmStarted(g);
    }
    await compiling;
  } finally {
    effects.warmDone(g);                                       // the review's F1: on every path, a throw at once too
  }
}
