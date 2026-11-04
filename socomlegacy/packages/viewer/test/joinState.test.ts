import { describe, expect, it } from 'vitest';
import { ENGINE_READ_S, ROUND_COMPLETE_S } from '../../match/src/room';
import { BODY_FADE_S } from '../src/net/deaths';
import { JOIN_STATE_VERSION, TICK_HZ, type DropWire, type JoinWire } from '../src/net/protocol';
import { applyJoinState, CORPSE_HYDRATE_READING, GHOST_BODY_READING, RESULT_CLOCK_READING, type JoinSinks, type ProjectilePhase } from '../src/joinState';

/**
 * PF-28 (ruling PF.R47; web research 231 s2-s4): the page's half of the join envelope -- pure, through injected sinks
 * (the round screens, the grenade page, the others' bodies), so nothing here is replayed: no kill line, no blast, no
 * sound. `NetPage`'s welcome wires the sinks (held for the controller's wave 4, research 231 s4.3).
 */

interface Log {
  screens: { start: number; list: unknown; winner: unknown; wins: unknown; stats: unknown }[];
  projectiles: { kind: string; from: number[]; velocity: number[]; owner: number; pid: number; phase: ProjectilePhase }[];
  corpses: { id: number; clip: string | null; ageS: number }[];
  ghosts: number[];
}
function sinks(): { log: Log; sinks: JoinSinks } {
  const log: Log = { screens: [], projectiles: [], corpses: [], ghosts: [] };
  return {
    log,
    sinks: {
      screens: (start, list, winner, wins, stats) => { log.screens.push({ start, list, winner, wins, stats }); },
      projectile: (kind, from, velocity, owner, pid, phase) => { log.projectiles.push({ kind, from, velocity, owner, pid, phase }); },
      corpse: (id, clip, ageS) => { log.corpses.push({ id, clip, ageS }); },
      ghost: (id) => { log.ghosts.push(id); },
    },
  };
}

const empty: JoinWire = { v: JOIN_STATE_VERSION, projectiles: [], corpses: [], ghosts: [] };

/** `NetPage.roundScreen`'s clock: the screen and its seconds left `nowMs` after a `roundOver` received at `start`. */
function panel(start: number, nowMs: number, list: readonly { screen: string; seconds: number }[]): { screen: string; secondsLeft: number } | null {
  let t = (nowMs - start) / 1000 - ENGINE_READ_S;
  if (t < 0) return null;
  for (const item of list) {
    if (t < item.seconds) return { screen: item.screen, secondsLeft: item.seconds - t };
    t -= item.seconds;
  }
  return null;
}

describe('PF-28: the page hydrates the join envelope (research 231)', () => {
  it('applyJoinState starts the result panel\'s clock (tick - at) / 60 s in the past: a joiner 2 s into ROUND COMPLETE sees secondsLeft = seconds - 2 (after ENGINE_READ_S\'s read), as an existing observer does', () => {
    expect(RESULT_CLOCK_READING).toBe('room tick');
    const list = [{ screen: 'roundComplete' as const, seconds: ROUND_COMPLETE_S }];
    // The room sent the roundOver at tick 1000; an existing observer took it at 50 000 ms (its own clock).
    const at = 1000, observerStart = 50_000;
    // The joiner's welcome is sent ENGINE_READ_S + 2 s later: 2 s into ROUND COMPLETE (the engine's read before it).
    const elapsedS = ENGINE_READ_S + 2, tick = at + elapsedS * TICK_HZ;
    const joinerNow = 777_000;                                     // the joiner's clock: any origin
    const { log, sinks: s } = sinks();
    applyJoinState({ ...empty, result: { round: 3, winner: 'seal', wins: { seal: 2, terrorist: 1 }, matchOver: false, screens: list, at } }, joinerNow, tick, s, 'respawn');
    expect(log.screens).toHaveLength(1);
    expect(log.screens[0]).toMatchObject({ start: joinerNow - elapsedS * 1000, list, winner: 'seal', wins: { seal: 2, terrorist: 1 } });
    const joiner = panel(log.screens[0]!.start, joinerNow, list)!;
    const observer = panel(observerStart, observerStart + elapsedS * 1000, list)!;
    expect(joiner).toEqual(observer);
    expect(joiner.screen).toBe('roundComplete');
    // The panel's own seconds left: its 5 s less the 2 s of it already shown (the engine's 3 s read before it).
    expect(joiner.secondsLeft).toBeCloseTo(ROUND_COMPLETE_S - 2, 9);
    expect(joiner.secondsLeft).toBeCloseTo(ROUND_COMPLETE_S + ENGINE_READ_S - elapsedS, 9);
    // No result on the wire: the screens are not touched.
    const none = sinks();
    applyJoinState(empty, joinerNow, tick, none.sinks, 'respawn');
    expect(none.log.screens).toEqual([]);
  });

  it('applyJoinState hydrates each projectile once by pid: a second welcome with the same pid replaces, never duplicates (idempotent)', () => {
    const join: JoinWire = {
      ...empty,
      projectiles: [
        { pid: 4, owner: 2, kind: 'M67', pos: [1, 2, 3], vel: [10, 0, 0], state: 'flight', age: 30, fuse: 150, removal: 156, bounces: 1, dud: false },
        { pid: 5, owner: 3, kind: 'Claymore', pos: [8, 0, 0], vel: [0, 0, 0], state: 'rest', age: 600, fuse: 6e8, removal: 0, bounces: 0, dud: false, facing: [0, 0, 1] },
        { pid: 4, owner: 2, kind: 'M67', pos: [1, 2, 3], vel: [10, 0, 0], state: 'flight', age: 30, fuse: 150, removal: 156, bounces: 1, dud: false },
      ],
    };
    const { log, sinks: s } = sinks();
    applyJoinState(join, 0, 0, s, 'respawn');
    // Each pid handed on once (a duplicate in one envelope dropped); the ages in seconds; a placed charge faces its facing.
    expect(log.projectiles.map((p) => p.pid)).toEqual([4, 5]);
    expect(log.projectiles[0]).toEqual({ kind: 'M67', from: [1, 2, 3], velocity: [10, 0, 0], owner: 2, pid: 4, phase: { state: 'flight', age: 0.5, fuse: 2.5, removal: 2.6, bounces: 1, dud: false } });
    expect(log.projectiles[1]).toMatchObject({ kind: 'Claymore', from: [8, 0, 0], velocity: [0, 0, 1], owner: 3, pid: 5, phase: { state: 'rest', age: 10 } });
    // A second welcome (a rejoin) hands the same pids again: the sink replaces by pid (`GrenadeThrower.launchRemote`).
    applyJoinState(join, 0, 0, s, 'respawn');
    expect(log.projectiles.map((p) => p.pid)).toEqual([4, 5, 4, 5]);
    // An envelope of another version is not read (an older or newer room): nothing hydrated.
    const other = sinks();
    applyJoinState({ ...join, v: 2 } as unknown as JoinWire, 0, 0, other.sinks, 'respawn');
    expect(other.log.projectiles).toEqual([]);
  });

  // NU-4 B1-B2 (research 317 R317.1, R317.3, R317.4): a corpse lies until its seat is alive under both rules, so a
  // joiner's corpse of any age keeps its clip (`corpseShownS`). Was (PF-28): "a corpse older than BODY_FADE_S is hidden
  // at once with no clip replay" -- the 20 s corpse below was handed on with a null clip.
  it('applyJoinState: a classic joiner\'s 30 s corpse is in its clip, and a respawn joiner\'s 20 s one; one at 0.5 s plays its clip from 0.5 s; a dead seat without a corpse entry is a ghost and draws no body (GHOST_BODY_READING; FUN_002be150 D:L162596-162602 sets state 8, no death time)', () => {
    expect(CORPSE_HYDRATE_READING).toBe('pose at age');
    expect(GHOST_BODY_READING).toBe('nothing');
    const classic = sinks();
    applyJoinState({
      ...empty,
      corpses: [
        { id: 2, clip: 'death_stand_chest01', cause: 1, age: 0.5 * TICK_HZ },
        { id: 3, clip: 'death_stand_head01', cause: 3, age: 30 * TICK_HZ },
      ],
      ghosts: [4],
    }, 0, 0, classic.sinks, 'classic');
    expect(classic.log.corpses).toEqual([
      { id: 2, clip: 'death_stand_chest01', ageS: 0.5 },
      { id: 3, clip: 'death_stand_head01', ageS: 30 },
    ]);
    expect(classic.log.ghosts).toEqual([4]);
    const respawn = sinks();
    applyJoinState({ ...empty, corpses: [{ id: 3, clip: 'death_stand_head01', cause: 3, age: (BODY_FADE_S + 10) * TICK_HZ }] }, 0, 0, respawn.sinks, 'respawn');
    expect(respawn.log.corpses).toEqual([{ id: 3, clip: 'death_stand_head01', ageS: BODY_FADE_S + 10 }]);
  });
});

describe('PF-34: the drops in the envelope (research 234 s1)', () => {
  it("applyJoinState hands the drops sink the envelope's whole set once by did, so a rejoin replaces the page's drops (one taken meanwhile is gone); a welcome without drops clears them", () => {
    const sets: DropWire[][] = [];
    const { sinks: base } = sinks();
    const s: JoinSinks = { ...base, drops: (all) => { sets.push([...all]); } };
    const weapon: DropWire = { did: 1, kind: 'weapon', item: 62, at: [1, 2, 3], yaw: 0.5, from: 4 };
    const bundle: DropWire = { did: 0, kind: 'ammo', entries: [{ item: 62, rounds: [17, 30] }], at: [1, 2, 3], yaw: 0.5, from: 4 };
    applyJoinState({ ...empty, drops: [bundle, weapon, { ...weapon }] }, 0, 0, s, 'respawn');
    expect(sets).toEqual([[bundle, weapon]]);                    // once, a duplicate did dropped
    // A rejoin's envelope after the weapon was taken: the whole set again, the page's own replaced by it.
    applyJoinState({ ...empty, drops: [bundle] }, 0, 0, s, 'respawn');
    expect(sets[1]).toEqual([bundle]);
    // An envelope with none lying (the member left out): the set is empty -- the page clears what it drew.
    applyJoinState(empty, 0, 0, s, 'respawn');
    expect(sets[2]).toEqual([]);
    // A page whose sinks have no drops (wired before PF-34) reads the envelope as before.
    expect(() => applyJoinState({ ...empty, drops: [weapon] }, 0, 0, base, 'respawn')).not.toThrow();
  });
});
