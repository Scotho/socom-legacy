import type { ServerEvent } from './net/protocol';

/**
 * The game's own round valves on the page's world (the Forge's owner (crispy, OT.R112), 2026-11-13: "add all the in game flags"; a browser
 * adaptation, FG.R2): the port runs a round in its room, not through each map's `objectives` script (research 192 s2),
 * so the valves that script tests are not kept by anything -- this keeps them, from the room's events, under the
 * game's own names and numbers, for a Forge map script to test (`@s2u/creator-contracts` `SCRIPT_GAME_VALUES`). Nothing
 * of the page's own reads them. `mp_bomb` is the bomb page's (`./bombPage`, its `valve`).
 *
 * The names and their numbers (research 91, 192 s2, 175): teams 0 SEAL, 8 Terrorist, 16 a spectator; `aiteam_00` /
 * `aiteam_08` the living of each side (the elimination's `== 0`); `mp_timer` 1 while the round's clock runs, 0 once at
 * 00:00 (the master zeroes it, research 91 s18.1 -- "created at 1"); `mp_round_count` the rounds played (the round in play
 * is it + 1), `mp_max_rounds` the match's; `mp_score00` / `mp_score08` each side's round wins; `mp_winner` 0, 8 or 99 (a
 * draw); `mp_game_over` 1 once the match is over; `mp_game_type` the map's type (1 BREACH .. 5 SUPPRESSION, as
 * `mp_game_type` mirrors it, research 192 s1); `mp_allow_respawn` 1 under respawn rules. EXTRACTION's: `rescuecount` /
 * `hostages_rescued` the hostages rescued, `mp_hostages_by_seals` / `mp_hostages_by_turds` those each side killed,
 * `mp_penalty` the SEALs' kills (each one a minute off, research 192 G11). ESCORT's: `VIP1_valve_alive` ..
 * `VIP3_valve_alive` 1 while that VIP lives, `killcount` the VIPs dead.
 *
 * GAME_VALVES_FEED_READING: each value is the room's fact under the game's name, not the game's script's own write --
 * when the script would have written it (a frame later, after a WAIT) is not kept; `mp_winner` holds the last decided
 * round's until the next is decided [reading: the game's reset of it at a round's start is not traced]. Listed in
 * research 452 s3, with the evidence that would settle both.
 */
export const GAME_VALVES_FEED_READING = 'the room events under the game valve names; their script timing not kept' as const;

/** A team's number, as the game numbers a side (`player_team`, `aiteam_NN`, `mp_scoreNN`, `mp_winner`). */
const TEAM_NO = { seal: 0, terrorist: 8 } as const;
const SPECTATOR_NO = 16;
const DRAW_NO = 99;
/** The ESCORT records' names (`VIP1`..`VIP3`): each its `<name>_valve_alive`. */
const VIP_NAME = /^VIP\d$/i;
/** A rescued hostage's AI state (`HostageStateWire.ai` 0x11). */
const RESCUED_AI = 0x11;

/**
 * The feed: `set` writes a valve on the page's world (`WorldState.setValve`); its `event` takes every room event
 * (`RoomEvents.on`).
 */
export function gameValves(set: (name: string, value: number) => void): (ev: ServerEvent) => void {
  let me: number | null = null;
  const teamOf = new Map<number, 'seal' | 'terrorist'>();
  const names = new Map<number, string>();          // a hostage's or a VIP's record name, by its body id
  const alive = new Map<number, boolean>();
  const rescued = new Set<number>();
  const killedBy = { seal: 0, terrorist: 0 };
  const write = (name: string, v: number): void => { set(name, v); };
  const countBodies = (): void => {
    let vipDead = 0;
    for (const [id, name] of names) {
      if (!VIP_NAME.test(name)) continue;
      const on = alive.get(id) !== false;
      write(`${name.toUpperCase()}_valve_alive`, on ? 1 : 0);
      if (!on) vipDead++;
    }
    write('killcount', vipDead);
    const hostagesRescued = [...rescued].filter((id) => !VIP_NAME.test(names.get(id) ?? '')).length;
    write('rescuecount', hostagesRescued);
    write('hostages_rescued', hostagesRescued);
    write('mp_hostages_by_seals', killedBy.seal);
    write('mp_hostages_by_turds', killedBy.terrorist);
    write('mp_penalty', killedBy.seal);
  };
  const wins = (w: { seal: number; terrorist: number }): void => { write('mp_score00', w.seal); write('mp_score08', w.terrorist); };
  const feed = (ev: ServerEvent): void => {
    switch (ev.type) {
      case 'welcome': {
        // `RoomEvents.reset` (a match let go, a client followed anew) is a welcome that carries nothing: back to no room --
        // its fields absent, every one read as such.
        me = typeof ev.id === 'number' ? ev.id : null;
        teamOf.clear();
        for (const p of ev.players ?? []) teamOf.set(p.id, p.team);
        write('player_team', ev.team ? TEAM_NO[ev.team] : SPECTATOR_NO);
        write('mp_round_count', typeof ev.round === 'number' ? Math.max(0, ev.round - 1) : 0);
        write('mp_max_rounds', typeof ev.rounds === 'number' ? ev.rounds : 0);
        write('mp_allow_respawn', ev.rules === 'respawn' ? 1 : 0);
        if (ev.gameType !== undefined) write('mp_game_type', ev.gameType);
        write('mp_game_over', 0);
        names.clear(); alive.clear(); rescued.clear(); killedBy.seal = 0; killedBy.terrorist = 0;
        for (const h of ev.hostages ?? []) {
          names.set(h.id, h.name);
          alive.set(h.id, h.alive);
          if (h.ai === RESCUED_AI) rescued.add(h.id);
        }
        countBodies();
        return;
      }
      case 'roundStart':
        // A new round: its clock running, its bodies standing again, its counts back to none.
        write('mp_timer', 1);
        write('mp_round_count', Math.max(0, ev.round - 1));
        write('mp_max_rounds', ev.rounds);
        wins(ev.wins);
        for (const id of names.keys()) alive.set(id, true);
        rescued.clear(); killedBy.seal = 0; killedBy.terrorist = 0;
        countBodies();
        return;
      case 'score': {
        // Each side's living (`aiteam_NN`), this seat's side, the wins.
        let seals = 0, terrorists = 0;
        for (const r of ev.rows) {
          teamOf.set(r.id, r.team);
          if (r.alive) { if (r.team === 'seal') seals++; else terrorists++; }
          if (r.id === me) write('player_team', TEAM_NO[r.team]);
        }
        if (me !== null && !ev.rows.some((r) => r.id === me)) write('player_team', SPECTATOR_NO);
        write('aiteam_00', seals);
        write('aiteam_08', terrorists);
        wins(ev.wins);
        return;
      }
      case 'timeExpired': write('mp_timer', 0); return;
      case 'timedOut': write('mp_timer', 0); write('mp_winner', TEAM_NO[ev.winner]); return;
      case 'eliminated': write('mp_winner', TEAM_NO[ev.winner]); return;
      case 'roundOver':
        write('mp_winner', ev.winner ? TEAM_NO[ev.winner] : DRAW_NO);
        wins(ev.wins);
        write('mp_round_count', ev.round);
        if (ev.matchOver) write('mp_game_over', 1);
        return;
      case 'hostageState':
        if (!names.has(ev.id)) return;
        alive.set(ev.id, ev.alive);
        if (ev.ai === RESCUED_AI) rescued.add(ev.id);
        countBodies();
        return;
      case 'kill': {
        // A hostage killed: by the killer's side (a VIP's death is `killcount`'s, either side's).
        if (!names.has(ev.victim) || VIP_NAME.test(names.get(ev.victim) ?? '')) return;
        const side = ev.killer !== null ? teamOf.get(ev.killer) : undefined;
        if (side) killedBy[side]++;
        alive.set(ev.victim, false);
        countBodies();
        return;
      }
      default: return;
    }
  };
  // Never the room's stream's failure (the bug of 2026-11-13: a reset's bare welcome threw here, and the match's close,
  // whose `RoomEvents.reset` it was, stopped part way -- its sound left running): a fault here is said and let go.
  return (ev) => {
    try { feed(ev); } catch (e) { console.warn('game valves: an event not taken', ev.type, e); }
  };
}
