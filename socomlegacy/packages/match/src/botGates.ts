/**
 * The record-visible gates of a game's CPUs (OT.R81) -- one source for the room and for central (LATER 545, the
 * dispatcher's ruling 2026-10-27, point 2): `RoomBots.for` (`./roomBots`) asks it before its room-only gates (the play
 * list's game type, the host's navigation), and central's placement asks it of a game's record (`central/src/placement.ts`
 * `mayAskCpus`) to prefer a host that holds the map's bot graph. Lifting a gate here lifts it in both.
 * - H314's initial Frostfire rollout, extended to Vigilance by the owner's word of 2026-10-29 (respawn games
 *   only, as Frostfire: "respawn bots on vigilance can work, just like ff - not normal games");
 * - H315 ("yes respawn only to start"): a respawn game only;
 * - BTL.R9 (the merge controller, 2026-10-24, provisional; H317 to confirm): no clan game.
 * The current extension changes the map list only; the respawn and clan restrictions remain.
 * P537-L2: under `CREATE_GAME_ALL_MAPS=1` (`allMapsSwitch`, a developer's test server only) the map and rules gates
 * lift for every disc multiplayer map; the clan gate stays. Unset -- every public server -- they are as above.
 */
/** Authored multiplayer-bot adaptation: the explicitly supported maps, shared by access and preparation. */
export const BOT_MAPS: readonly string[] = ['MP2', 'MP51'];

/**
 * P537-L2 (product track, an adaptation with no original: a developer's test server; PR #537's switch, Fuse's name,
 * 5bbb4e3f3): the one server environment variable that opens PR #537's all-maps work -- CREATE GAME's whole played set
 * (central `main.ts`), the bots on every disc multiplayer map in either rules (`botGatesAdmit`, the room's CPU seat in a
 * classic game, the game-type gate), the character libraries for them on the match server (viewer `simMap.ts`) and a
 * game's own map's graph read as it opens (central `bridge.ts`). Off unless it is exactly `1`; a public server never sets
 * it (the owner, 2026-10-31, relayed by 6d: "it won't be enabled for public use. Only FF and VIG respawn to start"). No
 * lobby option and no player setting: the page learns it from the server's `/maps` answer (`allCreateGameMaps`).
 */
export const ALL_MAPS_SWITCH = 'CREATE_GAME_ALL_MAPS';

/** Whether `CREATE_GAME_ALL_MAPS` is `1` in `env` (the process's own by default; a page, which has none, reads off). */
export function allMapsSwitch(env: Readonly<Record<string, string | undefined>> | undefined =
  typeof process === 'undefined' ? undefined : process.env): boolean {
  return env?.[ALL_MAPS_SWITCH] === '1';
}

/** A disc multiplayer map's stem (`MP` and one or two digits, `RUN/MP<n>.ZDB`), as PR #537's builder lists them. */
const DISC_MAP_STEM = /^MP\d{1,2}$/i;

export function botGatesAdmit(stem: string, respawn: boolean, clan: boolean, all: boolean = allMapsSwitch()): boolean {
  if (all) return DISC_MAP_STEM.test(stem) && !clan;                                        // P537-L2: the switch set
  return BOT_MAPS.includes(stem.toUpperCase()) && respawn && !clan;
}

/**
 * P537-L3 (an adaptation's switches, no original: the game had no bots): PR #537's other-map bot behaviours, Fuse's
 * (origin/agent/bots-all-maps), each behind its own switch so each can be measured and enabled alone (6d's plan,
 * evidence/p537/LAND-PLAN.md, "Update: Craig on L3"):
 * - `pursuit`: floor-aware pursuit and team commitments (7a2b34909);
 * - `ladders`: the disc's ladders as navigation links and the ladder drive (86d8be1b5);
 * - `climbs`: discovered climbs as navigation links and the climb drive (e7d271abb);
 * - `routes`: the objective and access routes, hostage rescue (f6c171687, dca60a232, e7d271abb).
 */
export const BOT_BEHAVIOURS = ['pursuit', 'ladders', 'climbs', 'routes'] as const;
export type BotBehaviour = typeof BOT_BEHAVIOURS[number];
export type BotBehaviours = Readonly<Record<BotBehaviour, boolean>>;
/** Every behaviour off: main's bots exactly. */
export const BOT_BEHAVIOURS_OFF: BotBehaviours = Object.freeze({ pursuit: false, ladders: false, climbs: false, routes: false });
const BOT_BEHAVIOURS_ON: BotBehaviours = Object.freeze({ pursuit: true, ladders: true, climbs: true, routes: true });
/**
 * BTL.R11 (the owner, 2026-10-31, relayed by 5d: "On for FF and Vig"; the bots plan): a Frostfire or Vigilance respawn
 * room's default -- pursuit on (its gate (b): kills up, stuck flat, routes completed down, accepted as the behaviour),
 * ladders, climbs and routes off (their gates failed or are not run).
 */
const BOT_MAPS_RESPAWN_BEHAVIOURS: BotBehaviours = Object.freeze({ ...BOT_BEHAVIOURS_OFF, pursuit: true });

/**
 * P537-L3 (product track, an adaptation: a developer's measurement server, never a client or lobby setting): the server
 * variable that names exactly the behaviours on, in every room of that server, replacing the per-room default -- a
 * comma list of `BOT_BEHAVIOURS` names, `all` or `none` (6d's per-behaviour runs on Frostfire and Vigilance, gate (b)).
 * Unset or blank: the default. A public server never sets it.
 */
export const BOT_BEHAVIOURS_SWITCH = 'S2U_BOT_BEHAVIOURS';

/**
 * The behaviours a room on map `stem` runs (P537-L3), resolved per room by `MatchBots` from its room's map and rules
 * (`respawn`: the room's rules are respawn):
 * - `S2U_BOT_BEHAVIOURS` set: exactly the ones it names (a name that is no behaviour throws: a measurement must not
 *   silently run with one off; `none` is main's play everywhere, gate (a));
 * - else, in a Frostfire or Vigilance (`BOT_MAPS`) respawn room, pursuit alone (BTL.R11; the owner, 2026-10-31, relayed
 *   by 5d: "if fuses extra logic ... does not cause new issues on ff vig they may be on. otherwise leave as launch
 *   outlined", then "On for FF and Vig" for pursuit, its gate (b)'s route drop accepted);
 * - else, under `CREATE_GAME_ALL_MAPS=1`, all four on for a disc map other than Frostfire and Vigilance;
 * - else all four off -- every other room, Frostfire and Vigilance classic (a developer's server only) included.
 */
export function botBehaviours(stem: string, respawn: boolean, env: Readonly<Record<string, string | undefined>> | undefined =
  typeof process === 'undefined' ? undefined : process.env): BotBehaviours {
  const named = env?.[BOT_BEHAVIOURS_SWITCH]?.trim();
  if (named) {
    const on: Record<BotBehaviour, boolean> = { ...BOT_BEHAVIOURS_OFF };
    for (const raw of named.split(',')) {
      const name = raw.trim().toLowerCase();
      if (!name || name === 'none') continue;
      if (name === 'all') { for (const b of BOT_BEHAVIOURS) on[b] = true; continue; }
      if (!(BOT_BEHAVIOURS as readonly string[]).includes(name)) {
        throw new Error(`${BOT_BEHAVIOURS_SWITCH}: "${raw.trim()}" is not a bot behaviour (${BOT_BEHAVIOURS.join(', ')}, all, none)`);
      }
      on[name as BotBehaviour] = true;
    }
    return Object.freeze(on);
  }
  if (BOT_MAPS.includes(stem.toUpperCase())) return respawn ? BOT_MAPS_RESPAWN_BEHAVIOURS : BOT_BEHAVIOURS_OFF;
  if (allMapsSwitch(env) && DISC_MAP_STEM.test(stem)) return BOT_BEHAVIOURS_ON;
  return BOT_BEHAVIOURS_OFF;
}
