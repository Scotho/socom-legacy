// test/replayRoundAudio.test.ts -- LATER 160 (reading, pending review): a replay's seek leaves the page's round audio as
// a joiner's welcome would. The seek resets it (`./matchActions`' seek listener, through the round audio both pages lend
// the bomb's view), as the live page's close resets it before a reconnect's welcome (`NetPage.retry`); the seek's folded
// welcome then marks the target's hold by its own reason (LATER 155, `RoundAudio.markDecided`), and a target in play is
// undecided. Was: the round audio kept the old playhead's decision -- a seek from a time-out hold into an elimination
// hold kept 'timeout', so a defuse there played MP61's and MP62's live defuse branch (LATER 150) where a joiner plays
// nothing. A browser adaptation's seam (REPLAY_ADAPTATION): SOCOM II plays no recording back.
import { describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayRecord } from '../../match/src/replay/format';
import { mountActions, type MatchActionsDeps } from '../src/matchActions';
import type { StreamPlay } from '../src/audio';
import { BOMB_STATE, type BombWire } from '../src/net/objective';
import { TICK_HZ, type ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import { RoundAudioHost } from '../src/roundAudioHost';
import type { RoundCues } from '../src/roundCues';
import type { WalkMode } from '../src/walk';
import { ALPHA, BRAVO, body, header } from './replayFixture';

const HZ = TICK_HZ;
const msOf = (ticks: number): number => (ticks * 1000) / HZ;

const line = (sound: string) => ({ sound, slot: false });
const byTeam = <T>(steps: T) => ({ 0: steps, 8: steps, 16: steps });
const none = { seal: {}, terrorist: {} };
/**
 * A BREACH map's cues in small, by hand (MP61's shape, LATER 150): the time-out's win (`decided.timeout`), the bomb's
 * defuse as a result, and the time-out hold's live defuse branch (`timeoutPlantLive`) -- one stream each, named for the test.
 */
const CUES: RoundCues = {
  map: 'MP61', intro: {}, introRespawn: null,
  elimination: { seal: byTeam([line('ELIM_SEAL')]), terrorist: byTeam([line('ELIM_TERR')]) },
  timeExpired: [], objective: {},
  bomb: { pickup: none, drop: none, planted: none, detonated: none, defused: { seal: byTeam([line('BOMB_DEFUSED')]), terrorist: byTeam([line('BOMB_DEFUSED')]) } },
  decided: {
    rescue: {}, hostageKills: {}, timeout: byTeam([line('TIMEOUT_WIN')]),
    timeoutPlantLive: { defused: { seal: byTeam([line('LIVE_DEFUSE')]), terrorist: byTeam([line('LIVE_DEFUSE')]) } },
  },
};

const start = (round: number, tick: number): ServerEvent =>
  ({ type: 'roundStart', round, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: tick }) as unknown as ServerEvent;
const bomb = (state: BombWire['state'], over: Partial<BombWire> = {}): ServerEvent =>
  ({ type: 'bomb', state, pos: [5, 0, 5], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, ...over }) as unknown as ServerEvent;
const planted = bomb(BOMB_STATE.planted, { planter: 2, plantingTeam: 'terrorist', detonateTick: 99_999 });
const defused = bomb(BOMB_STATE.defused, { planter: 2, plantingTeam: 'terrorist', defuser: 1 });
const over = (round: number): ServerEvent =>
  ({ type: 'roundOver', round, winner: 'seal', wins: { seal: round, terrorist: 0 }, matchOver: false, screens: [] }) as unknown as ServerEvent;

/**
 * The recording (MP61-like): round 1 decided by the time-out at 100, its bomb defused in the hold at 140; round 2
 * decided by an elimination at 300, its bomb defused in the hold at 340.
 */
const EVENTS: readonly [number, ServerEvent][] = [
  [10, start(1, 10)], [40, planted], [100, { type: 'timedOut', winner: 'seal' } as ServerEvent], [140, defused], [180, over(1)],
  [200, start(2, 200)], [201, bomb(BOMB_STATE.ground)], [240, planted], [300, { type: 'eliminated', winner: 'seal' } as ServerEvent],
  [340, defused], [380, over(2)],
];

function segment(events: readonly [number, ServerEvent][], end = 420): LoadedSegment {
  const h = header({ map: 'MP61' });
  const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
  for (let tick = 0; tick <= end; tick++) {
    for (const [at, event] of events) if (at === tick) records.push({ kind: 'event', tick, event });
    if (tick % 2 === 0) records.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

/**
 * The replay mode in small (`./replayAir.test.ts`'s rig): a watcher's `NetPage` on a `ReplayClient`, the page's
 * `RoundAudioHost` lent to the page and to the bomb's view as both pages lend it, the action part following the page's
 * client every frame (`acts.followNet()`). `calls`: the streams the round audio asked for.
 */
async function replayPage(seg: LoadedSegment) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP61', now: () => now });
  const calls: string[] = [];
  const audio = {
    roundCues: () => CUES,
    playMusic: (n: string): StreamPlay => { calls.push(`music ${n}`); return 'played'; },
    playStream: (n: string): StreamPlay => { calls.push(`voice ${n}`); return 'played'; },
    stopMusic: () => undefined,
    stopTransient: vi.fn(),
  };
  const host = new RoundAudioHost(audio, () => now / 1000);
  const hud = new Proxy({}, { get: () => () => undefined }) as unknown as NetPageDeps['hud'];
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, victory: () => undefined, clear: () => undefined, frame: () => undefined,
    bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null,
    playerType: () => 0, setGearVisible: () => undefined,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined, newRound: () => undefined,
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], client: () => asNetClient(replay), roundAudio: host,
  };
  const net = new NetPage(deps, 'replay:', 'MP61', 'Watcher', undefined, true, 'classic');
  const acts = mountActions({
    walk: {
      mode: () => 'fly' as const, isDead: () => false, isLocked: () => false, feet: () => null, fireAim: () => null,
      setCamera: () => true, setLocked: () => undefined, setActionFilter: () => undefined, setNetTap: () => undefined,
      syncVictoryMotion: () => undefined, victoryMotionActive: () => false,
    },
    fly: { pose: () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }) },
    doors: { target: () => null, action: () => false },
    traversal: { cancelAction: () => undefined, padLanes: () => undefined, hudClimb: () => null, traversal: () => null, holdAllowed: () => true },
    grenade: { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => undefined },
    play: { startVictory: () => false, stopVictory: () => undefined, resetVictory: () => undefined, victoryActive: () => false, victoryState: () => null },
    firearm: { held: () => undefined, fire: { subscribe: () => () => undefined } },
    net: () => net, map: () => null, view: () => null, world: () => null,
    remote: { teamOf: () => null, feet: () => null },
    bombView: { roundAudio: host },
  } as unknown as MatchActionsDeps);
  await replay.ready;
  const frame = (): void => { replay.advance(); net.frame(0, {} as never, false); acts.followNet(); };
  frame();
  const state = (): [boolean, string | null] => {
    const r = host.round as unknown as { decided: boolean; reason: string | null };
    return [r.decided, r.reason];
  };
  return {
    replay, calls, audio, acts, state,
    /** `ms` of the replay played, in page frames of 1 tick. */
    play: (ms: number): void => { const end = now + ms; while (now < end) { now = Math.min(end, now + msOf(1)); frame(); } },
  };
}

describe('LATER 160: a seek leaves the round audio as a joiner\'s welcome would', () => {
  it('the seek resets the round audio once, before the welcome; play and a step on do not', async () => {
    const p = await replayPage(segment(EVENTS));
    const order: string[] = [];
    const reset = vi.spyOn(RoundAudioHost.prototype, 'reset').mockImplementation(() => { order.push('reset'); });
    p.replay.on((ev) => { if (ev.type === 'welcome') order.push('welcome'); });
    p.play(msOf(60));
    p.replay.pause();
    p.replay.step(1);                                       // a step on: play
    expect(reset).not.toHaveBeenCalled();
    p.replay.seek(120);
    expect(order).toEqual(['reset', 'welcome']);
    p.replay.step(-1);                                      // a step back is a seek
    expect(reset).toHaveBeenCalledTimes(2);
    reset.mockRestore();
  });

  it('MP61-like: a seek from the time-out hold into the elimination hold -- the hold\'s reason is the target\'s, so its defuse plays nothing', async () => {
    const p = await replayPage(segment(EVENTS));
    p.replay.seek(120);                                     // round 1's time-out hold
    expect(p.state()).toEqual([true, 'timeout']);
    p.replay.seek(310);                                     // round 2's elimination hold (the SEALs')
    expect.soft(p.state()).toEqual([true, 'elimination']);
    p.calls.length = 0;
    p.play(msOf(50));                                       // through round 2's defuse at 340
    expect(p.calls).toEqual([]);                            // as a joiner's page: no second result, no live defuse branch
  });

  it('a seek back from the elimination hold into the time-out hold: its defuse plays the time-out hold\'s own branch (LATER 150)', async () => {
    const p = await replayPage(segment(EVENTS));
    p.replay.seek(310);
    expect(p.state()).toEqual([true, 'elimination']);
    p.replay.seek(120);
    expect.soft(p.state()).toEqual([true, 'timeout']);
    p.calls.length = 0;
    p.play(msOf(30));                                       // through round 1's defuse at 140
    expect(p.calls).toEqual(['voice LIVE_DEFUSE']);
  });

  it('a seek within one hold: its reason and its rule unchanged', async () => {
    const p = await replayPage(segment(EVENTS));
    p.replay.seek(110);
    p.replay.seek(125);
    expect(p.state()).toEqual([true, 'timeout']);
    p.calls.length = 0;
    p.play(msOf(25));                                       // through the defuse at 140
    expect(p.calls).toEqual(['voice LIVE_DEFUSE']);
  });

  it('a seek out of a hold into play: undecided, so the round\'s own decision plays when it is reached', async () => {
    const p = await replayPage(segment(EVENTS));
    p.replay.seek(120);
    expect(p.state()).toEqual([true, 'timeout']);
    p.replay.seek(50);                                      // round 1 in play, before its time-out
    expect.soft(p.state()).toEqual([false, null]);
    p.calls.length = 0;
    p.play(msOf(60));                                       // through the time-out at 100
    expect(p.calls).toEqual(['voice TIMEOUT_WIN']);
  });

  it('the live path is unchanged: a client without `onSeek` never resets the round audio through the action part', () => {
    const reset = vi.fn();
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { state: 'open', id: 1, role: 'player', team: 'seal', serverTick: () => 0, bodies: () => [], on: (fn: (ev: ServerEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const acts = mountActions({
      walk: { mode: () => 'walk', isDead: () => false, isLocked: () => false, feet: () => null, fireAim: () => null, setCamera: () => true, setLocked: () => undefined, setActionFilter: () => undefined, setNetTap: () => undefined, syncVictoryMotion: () => undefined, victoryMotionActive: () => false },
      fly: { pose: () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }) }, doors: { target: () => null, action: () => false },
      traversal: { cancelAction: () => undefined, padLanes: () => undefined, hudClimb: () => null, traversal: () => null, holdAllowed: () => true },
      grenade: { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => undefined },
      play: { startVictory: () => false, stopVictory: () => undefined, resetVictory: () => undefined, victoryActive: () => false, victoryState: () => null },
      firearm: { held: () => undefined, fire: { subscribe: () => () => undefined } },
      net: () => ({ client }) as unknown as NetPage, map: () => null, view: () => null, world: () => null,
      remote: { teamOf: () => null, feet: () => null }, bombView: { roundAudio: { bomb: () => undefined, reset } },
    } as unknown as MatchActionsDeps);
    acts.follow(client as never);
    for (let i = 0; i < 5; i++) acts.followNet();
    for (const fn of listeners) fn(start(2, 300));
    expect(reset).not.toHaveBeenCalled();
  });
});
