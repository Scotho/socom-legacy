import { polygonNormal, probeFloor, type Grid } from '@s2u/scene';
import type { Effects } from './effects';
import type { Hud } from './hud';
import type { NetState } from './net/client';
import { killLine } from './netPage';
import type { PlayEvent } from './play';
import type { RemoteStep, RemoteStepHook } from './remotePlayers';
import { DEFAULT_PLAYER } from './scoreboard';
import type { WalkMode } from './walk';

/**
 * PARITY-1 wave 3 (web research 257): the shared effects of a match, written once for both pages -- `/testroom`
 * (`./main`) and the front end's match (`./matchMount`) -- out of `main.ts`'s own lines (base 30ba6d1b), as
 * `./matchSound` and `./charShadow`'s `mountCharShadow` are. Nothing here imports `./main` or reads page markup
 * (OT.R12); the pages' calls are wave 4's hunks (PAR.R3: `main.ts` and `matchMount.ts` are HOT; research 257 s4).
 *
 * - **The footprints** (PAR-8, s1): `FUN_005a3570` (D:L460268-460378) runs each actor's footfalls with no locality test
 *   (`FUN_005506a0` D:L417909) and, on each foot's step, calls the step's sound `FUN_005a39b0` and the footprint
 *   `FUN_005a3280` side by side (D:L460344-460345, L460372-460374; none prone), both under the actor's `+0xe0` bit 2
 *   (D:L460295) -- the viewer's own actor and the three nearest others (`./remotePlayers` `FOOTFALL_CAP_READING`). So a
 *   print goes where the step is heard: the own body's off `Play.onEvent`, the others' off `RemotePlayers`' step hook.
 * - **The fall-death message** (PAR-9, s2): the room's kill line on both pages (`NetPage`); the page's own landing line
 *   only with no room (`fallDeathLine`).
 */

/** The part of `Effects` a footprint needs (`./effects` `footfall`: `decals.rdr`'s `FOOTSTEP_DECALS`, SAND and SNOW). */
export type FootprintEffects = Pick<Effects, 'footfall'>;

/**
 * A footprint at a foot (`main.ts:893-904` at 30ba6d1b): the floor the ground probe picks under the foot's point, the
 * print at the floor's height there, on its polygon's normal turned upward, of its material, along the facing `yaw`
 * (degrees: the forward `[-sin, 0, -cos]`); `prone` passed on (`Effects.footfall` prints none prone). False when there
 * is no floor or the effects print nothing there (no `FOOTSTEP_DECALS` row for the material).
 */
export function footprintAt(effects: FootprintEffects, grid: Grid, at: readonly number[], yaw: number, prone: boolean): boolean {
  const floor = probeFloor(grid, at[0]!, at[1]!, at[2]!);
  if (!floor) return false;
  const n = polygonNormal(floor.poly.points) ?? [0, 1, 0];
  const up: [number, number, number] = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
  const r = (yaw * Math.PI) / 180;
  return effects.footfall([at[0]!, floor.y, at[2]!], floor.poly.material, up, [-Math.sin(r), 0, -Math.cos(r)], prone);
}

/** What the shared effects read: the firearm's `Effects`, the walk, and the sound's own step hook (`./matchSound`). */
export interface MatchEffectsParts {
  effects: FootprintEffects;
  walk: Pick<WalkMode, 'mode' | 'snapshot' | 'grid'>;
  sound: { readonly remoteStep: RemoteStepHook };
}

export interface MatchEffects {
  /** The own body's events (`Play.onEvent`, beside `sound.playEvent`): a footfall's print (`main.ts:893-904`). */
  playEvent(e: PlayEvent): void;
  /**
   * The others' footfall (`RemotePlayers`' step hook, in `sound.remoteStep`'s place): the step heard, once, then its
   * print at the foot along the body's facing -- `FUN_005a3570`'s two calls side by side, under the same gate. No facing
   * (a caller that has none), no print.
   */
  footfall(id: number, step: RemoteStep, feet: [number, number, number], yaw?: number): void;
}

export function mountEffects(p: MatchEffectsParts): MatchEffects {
  const { effects, walk, sound } = p;
  return {
    playEvent: (e) => {
      if (e.kind !== 'footfall' || walk.mode() !== 'walk') return;
      const snap = walk.snapshot(), grid = walk.grid();
      const at = e.position ?? snap?.feet ?? null;
      if (!snap || !grid || !at) return;
      footprintAt(effects, grid, at, snap.yaw, snap.stance === 'prone');
    },
    footfall: (id, step, feet, yaw) => {
      sound.remoteStep(id, step, feet, yaw);
      const grid = walk.grid();
      if (grid && yaw !== undefined) footprintAt(effects, grid, step.at, yaw, step.stance === 2);
    },
  };
}

/**
 * The fall-death message's own-landing line (PAR-9, research 257 s2): "%s falls to their death" (0x65c440) is a kill line
 * -- `FUN_00547860` (D:L412879-412880, research 91 s10) posts it on the fall's death, which `FUN_005ac1f0`
 * (D:L464955-464959) gives at the death class (cause 0xfd). In a match the room is every console and decides that death
 * (`room.ts` `fallDamage`: `kill`, how 'fall'), and `NetPage` -- both pages' -- posts its line (`killLine`); so this line
 * is posted only with no room live -- `/testroom`'s free walk (research 87 s14's lone SEAL, who walks on), where
 * `main.ts:892`'s landing of the death class is the only death there is. With a room live it posts nothing: `main.ts:892`
 * posted it beside the room's own, twice. A `Play.onEvent` listener; the name is the HUD's, else `DEFAULT_PLAYER`.
 *
 * A room is live while the page's match client is open (`net()?.client.state === 'open'`), not while a `NetPage`
 * merely exists: a socket the server or the network closed leaves the page's `NetPage` in place (`main.ts`'s `net`,
 * retrying) with the walk handed back unlocked (`NetClient.release`, `net/client.ts:316-319`) -- a free walk again, which
 * no room hears; so is a client still connecting or refused (the PAR-9 review's finding).
 */
export function fallDeathLine(p: {
  hud: Pick<Hud, 'postMessage' | 'state'>;
  net(): { readonly client: { readonly state: NetState } } | null;
}): (e: PlayEvent) => void {
  return (e) => {
    if (e.kind !== 'land' || e.cls !== 3 || p.net()?.client.state === 'open') return;
    p.hud.postMessage(killLine('fall', null, p.hud.state().model.name || DEFAULT_PLAYER, null));
  };
}
