/**
 * The smoke grenade's screen and the detonation kinds, without three.js: the page's `./grenade` re-exports them, and
 * the match server reads them (BOTS-LAND: a bot sees no more through a live AN-M8 than a player's screen shows,
 * `match/src/bots/matchBots.ts` `SMOKE_SIGHT_ADAPTATION`). Moved here verbatim from `./grenade` (02's word, 2026-10-24).
 */
import type { ThrowableRecord } from '@s2u/scene';

/**
 * The smoke the AN-M8 pours out from `Timer1` to `Timer2`, as `smoke_stream` (`CZANIM.ZAR`, called by `smoke_grenade`)
 * sets it out [reading of its three `large_smoke` sources, command 0x1b]: puffs of `cloudpuff01.tif` thrown +-20 across
 * and 0-17 up, 3-4.5 across (x10 here, as the game's metres), living 5-7 s, grey 0.6 and 0.4, the pair running 20 s
 * twice over -- the 40 s of `Timer2`. The rate (one a source every 0.4 s) is doubled to fill the screen the game's own
 * sort order builds [placeholder].
 */
export const SMOKE_PLACEHOLDER = { every: 0.2, rise: [0, 17] as const, spread: 20, size: [30, 45] as const, grow: 1.6, life: [5, 7] as const, grey: [0.6, 0.4] as const,
  // the page's puff motion, named here so a bot's wall is derived from the same numbers (BOTS-LAND): each puff born `lift`
  // over the canister, its `spread` and `rise` speeds (per second) slowed by `drag` (per second, exponential)
  lift: 2, drag: 0.6 };

/** What a throwable does when it goes off: the frag's blast, the smoke's screen, the flash's white-out. */
export type Detonation = 'blast' | 'smoke' | 'flash';
export const detonationOf = (r: ThrowableRecord): Detonation =>
  r.explosionRadius === 0 ? 'smoke' : r.explosionDamage === 0 ? 'flash' : 'blast';
