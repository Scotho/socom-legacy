// @vitest-environment jsdom
// test/replayHostages.test.ts -- RE-2 (web sprint 38; W38.R2; research 249 §3): EXTRACTION's hostages as recorded state.
// The recording's `hostages` record carries the roster as the room's welcome does (`HostageWire`: each hostage's id,
// name, model and place, with its state); the seek's fold restores it at the target -- the record at or before it, the
// `hostageState` and hostage `kill` events after it, the place from the target's snapshot -- and tells it in the re-told
// welcome, so the page's hostage map and the HUD's compass marks survive a seek, laid silently (no YES, no Lead/Rescue
// line, no live handler). A file with no `hostages` record reads as before RE-2: no roster, no marks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayRecord } from '../../match/src/replay/format';
import { Hud } from '../src/hud';
import { TICK_HZ, type BodyState, type HostageWire, type ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { foldTo, statefulRecord } from '../src/replay/fold';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { WalkMode } from '../src/walk';
import { ALPHA, BRAVO, body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

const HZ = TICK_HZ;
type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
const welcomeOf = (told: readonly ServerEvent[]): Welcome | undefined => told.find((e): e is Welcome => e.type === 'welcome');

/** A hostage as the room's `ExtractionAuthority.wire()` gives it, in its starting state (0x17, the escortee unit 17). */
const hostage = (id: number, over: Partial<HostageWire> = {}): HostageWire => ({
  id, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17,
  name: id === 240 ? 'Hostage' : `Hostage${id - 239}`, character: `mp_fem${id - 239}`, at: [100 * (id - 239), 0, 0], yaw: 0.5, ...over,
});
const ROSTER = [hostage(240), hostage(241), hostage(242)];
/** Where a hostage's body stands at `tick` in the snapshots: 240 walks along x, the others stand at their starts. */
const feetOf = (id: number, tick: number): [number, number, number] => (id === 240 ? [100 + tick, 0, 7] : [100 * (id - 239), 0, 0]);

type StateEvent = Extract<ServerEvent, { type: 'hostageState' }>;
const state = (id: number, over: Partial<StateEvent> = {}): StateEvent => ({
  type: 'hostageState', id, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17, ...over,
});
const kill = (victim: number, clip: string): ServerEvent => ({
  type: 'kill', killer: 1, victim, weapon: 'M4A1', how: 'weapon', clip, cause: 3, voiced: true, victimKind: 'hostage',
} as ServerEvent);

/**
 * A segment of `end` ticks as the room's step writes one: the roster (Alpha and Bravo) at tick 0, then -- at the first
 * snapshot's tick, as the room's call before its snapshot writes it -- the `hostages` record (`roster`, or none), then
 * `events` at their ticks, and a snapshot every 2 ticks of the seats and the hostages' bodies (a dead one not alive, a
 * hidden one left out, as `ExtractionAuthority.bodies` does).
 */
function segment(events: readonly [number, ServerEvent][], o: {
  end?: number; roster?: HostageWire[] | null; rosterAt?: number; dead?: (id: number, tick: number) => boolean; hidden?: (id: number, tick: number) => boolean;
  place?: (id: number, tick: number) => { feet: [number, number, number]; yaw: number } | null;
} = {}): LoadedSegment {
  const end = o.end ?? 600;
  const roster = o.roster === undefined ? ROSTER : o.roster;
  const rosterAt = o.rosterAt ?? 2;
  const h = header({ map: 'MP6', gameType: '4' });
  const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
  for (let tick = 0; tick <= end; tick++) {
    if (roster && tick === rosterAt) records.push({ kind: 'hostages', tick, hostages: roster });
    for (const [at, event] of events) if (at === tick) records.push({ kind: 'event', tick, event });
    if (tick > 0 && tick % 2 === 0) {
      const bodies: BodyState[] = [body(1, tick), body(2, -tick)];
      for (const id of [240, 241, 242]) {
        if (o.hidden?.(id, tick)) continue;
        const b = body(id, 0);
        b.feet = feetOf(id, tick);
        b.yaw = id === 240 ? 2 : 0.5;
        const placed = o.place?.(id, tick);
        if (placed) { b.feet = placed.feet; b.yaw = placed.yaw; }
        if (o.dead?.(id, tick)) b.flags = 0;
        bodies.push(b);
      }
      records.push({ kind: 'snap', tick, bodies });
    }
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

/** A watcher's NetPage on a ReplayClient (the replay mode's path), the hostage drawers and every voice spied. */
async function replayPage(seg: LoadedSegment) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP6', now: () => now });
  const hud = new Hud();
  vi.spyOn(hud, 'postMessage').mockImplementation(() => undefined);
  const spies = {
    escortee: vi.fn(), opacity: vi.fn(), corpse: vi.fn(), died: vi.fn(), escorteeVoice: vi.fn(), hostageLine: vi.fn(), hostageState: vi.fn(),
    deathVoice: vi.fn(),
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: spies.died,
    hydrateCorpse: spies.corpse, markGhost: () => undefined, victory: () => undefined, clear: () => undefined, frame: () => undefined,
    bodies: () => [], flinch: () => undefined, setEscortee: spies.escortee, setOpacity: spies.opacity, feet: () => null,
    playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const roundAudio = {
    roundStart: () => undefined, eliminated: () => undefined, timeExpired: () => undefined, roundOver: () => undefined, reset: () => undefined,
    frame: () => undefined, hostage: spies.hostageLine, decided: () => false,
  } as unknown as NonNullable<NetPageDeps['roundAudio']>;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], deathVoice: spies.deathVoice,
    escorteeVoice: spies.escorteeVoice, hostageState: spies.hostageState, roundAudio, client: () => asNetClient(replay),
  };
  const net = new NetPage(deps, 'replay:', 'MP6', 'Watcher', undefined, true, 'classic');
  const told: ServerEvent[] = [];
  replay.on((ev) => told.push(ev));
  await replay.ready;
  const camera = new PerspectiveCamera();
  return {
    replay, net, spies, told,
    wait: (ms: number): void => { now += ms; replay.advance(); },
    frame: (): void => { replay.advance(); net.frame(0, camera, false); },
    clear: (): void => { told.length = 0; for (const s of Object.values(spies)) s.mockClear(); },
  };
}

const msOf = (ticks: number): number => (ticks * 1000) / HZ;
/** The page's marks, as `main.ts` hands the HUD them (`hostageMarks(ai)`; no AI maps here, so no extraction points). */
const marks = (net: NetPage) => net.hostageMarks(null).map((m) => [m.x, m.z]);

describe('RE-2: the roster restored on a seek, as the room\'s welcome carries it (W38.R2; room.ts hello, `hostages`)', () => {
  it('the opening welcome carries the roster written at the segment\'s open; the page\'s marks stand at once', async () => {
    const p = await replayPage(segment([]));
    // the open's tick is the segment's first (the roster's, 0); the record is at the first snapshot's (2), the file's open
    expect(welcomeOf(p.told)!.hostages).toEqual([{ ...hostage(240), at: [102, 0, 7], yaw: 2 }, hostage(241), hostage(242)]);
    expect([...p.net.hostages().keys()]).toEqual([240, 241, 242]);
    expect(p.spies.escortee.mock.calls).toEqual([[240, 'mp_fem1'], [241, 'mp_fem2'], [242, 'mp_fem3']]);
    expect(marks(p.net)).toEqual([[102, 7], [200, 0], [300, 0]]);   // 240 where the open's snapshot (tick 2) stands it
  });

  it('a seek past a hostageState change keeps the roster in the re-told welcome: id, name, model, place, the state at the target', async () => {
    const follow = state(240, { ai: 9, leader: 1, unit: 0x21 });
    const p = await replayPage(segment([[100, follow]]));
    p.clear();
    p.replay.seek(301);                                     // the snapshot at or before it: tick 300
    const w = welcomeOf(p.told)!;
    expect(w.hostages).toEqual([
      { ...hostage(240), at: [400, 0, 7], yaw: 2, ai: 9, leader: 1, unit: 0x21 },
      hostage(241), hostage(242),
    ]);
    expect([...p.net.hostages().values()].map((h) => [h.id, h.ai, 'name' in h ? h.name : null])).toEqual([[240, 9, 'Hostage'], [241, 0x17, 'Hostage2'], [242, 0x17, 'Hostage3']]);
    expect(marks(p.net)).toEqual([[400, 7], [200, 0], [300, 0]]);
    // through the welcome only: no YES, no Lead line, no live handler
    expect(p.spies.escorteeVoice).not.toHaveBeenCalled();
    expect(p.spies.hostageLine).not.toHaveBeenCalled();
    expect(p.spies.hostageState).not.toHaveBeenCalled();
  });

  it('a hostage killed before the target is told dead with its clip and its age, laid as a corpse by the welcome alone; no mark', async () => {
    const p = await replayPage(segment([[200, kill(241, 'die_back')], [200, state(241, { alive: false, ai: 0 })]], { dead: (id, t) => id === 241 && t >= 200 }));
    p.clear();
    p.replay.seek(260);
    const w = welcomeOf(p.told)!;
    expect(w.hostages![1]).toEqual({ ...hostage(241), alive: false, ai: 0, deathClip: 'die_back', age: 60 });
    expect(w.hostages![0]).not.toHaveProperty('age');
    expect(w.join!.corpses.map((c) => c.id)).toEqual([]);   // the room's envelope holds seats' corpses; a hostage's rides `hostages`
    expect(p.spies.corpse.mock.calls).toEqual([[241, 'die_back', 1]]);
    expect(p.spies.died).not.toHaveBeenCalled();
    expect(p.spies.deathVoice).not.toHaveBeenCalled();
    expect(p.spies.hostageLine).not.toHaveBeenCalled();
    expect(marks(p.net)).toEqual([[360, 7], [300, 0]]);
    // a seek back before the kill: alive again, no death
    p.clear();
    p.replay.seek(150);
    expect(welcomeOf(p.told)!.hostages![1]).toEqual(hostage(241));
    expect(marks(p.net)).toEqual([[250, 7], [200, 0], [300, 0]]);
  });

  it('a round\'s reset brings a dead hostage back: the hostageState after the roundStart (`tellAll`) clears its death', async () => {
    const p = await replayPage(segment([
      [200, kill(242, 'die_front')], [200, state(242, { alive: false, ai: 0 })],
      [400, { type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 1 }, rounds: 11, epoch: 2, startTick: 400 } as ServerEvent],
      [400, state(240)], [400, state(241)], [400, state(242)],
    ], { dead: (id, t) => id === 242 && t >= 200 && t < 400 }));
    p.replay.seek(500);
    const w = welcomeOf(p.told)!;
    expect(w.hostages![2]).toEqual(hostage(242));
    expect(marks(p.net)).toEqual([[600, 7], [200, 0], [300, 0]]);
  });

  it('a rescued one keeps its state and fade; a hidden one (out of the snapshot) keeps the place of the last snapshot that held it', async () => {
    const rescued = state(241, { ai: 0x11, rescuer: 1, opacity: 0.4, unit: 0x21 });
    // the record says [200, 0, 0] yaw 0.5; the snapshots stand 241 elsewhere, the last one to hold it (tick 148) at x 348
    const place = (id: number, t: number) => (id === 241 && t >= 50 ? { feet: [200 + t, 0, 30] as [number, number, number], yaw: 1.25 } : null);
    const p = await replayPage(segment([[100, rescued]], { hidden: (id, t) => id === 241 && t >= 150, place }));
    p.clear();
    p.replay.seek(200);
    const w = welcomeOf(p.told)!;
    expect(w.hostages![1]).toEqual({ ...hostage(241), at: [348, 0, 30], yaw: 1.25, ai: 0x11, rescuer: 1, opacity: 0.4, unit: 0x21 });
    expect(w.hostages![1]!.at).not.toEqual(hostage(241).at);           // not the record's place
    expect(p.spies.opacity).toHaveBeenCalledWith(241, 0.4, true);
    expect(marks(p.net)).toEqual([[300, 7], [300, 0]]);       // a rescued hostage has no mark (MARK_REMOVED_ON_RESCUE_READING)
    expect(p.spies.hostageLine).not.toHaveBeenCalled();
  });

  it('play after the seek goes on through the live handler as before (the next hostageState is the room\'s)', async () => {
    const p = await replayPage(segment([[100, state(240, { ai: 9, leader: 1, unit: 0x21 })], [400, state(240, { ai: 2, leader: null, unit: 17 })]]));
    p.replay.seek(300);
    p.clear();
    p.wait(msOf(150));
    expect(p.told.some((e) => e.type === 'hostageState')).toBe(true);
    expect(p.spies.hostageState).toHaveBeenCalledTimes(1);
    expect(p.net.hostages().get(240)!.ai).toBe(2);
  });

  it('the fold reads the record at or before the target and the events after it; `hostages` is a stateful record', () => {
    const seg = segment([[100, state(242, { ai: 2 })]]);
    expect(statefulRecord(seg.records.find((r) => r.kind === 'hostages')!)).toBe(true);
    expect(foldTo(seg.records, 1, HZ).state.hostages).toBeNull();          // before the record: no roster yet
    const at = foldTo(seg.records, 150, HZ).state.hostages!;
    expect([...at.keys()]).toEqual([240, 241, 242]);
    expect(at.get(242)!.wire.ai).toBe(2);
  });
});

describe('RE-2: a file with no hostages record reads as before (W38.R2: an older file has no roster)', () => {
  it('no roster on the open or on a seek, even past a hostageState; no marks; nothing voiced', async () => {
    const p = await replayPage(segment([[100, state(240, { ai: 9, leader: 1, unit: 0x21 })]], { roster: null }));
    expect(p.net.hostages().size).toBe(0);
    expect(p.spies.escortee).not.toHaveBeenCalled();
    p.clear();
    p.replay.seek(300);
    const w = welcomeOf(p.told)!;
    expect(w).not.toHaveProperty('hostages');
    expect(p.net.hostages().size).toBe(0);
    expect(marks(p.net)).toEqual([]);
    expect(p.spies.escorteeVoice).not.toHaveBeenCalled();
    expect(p.spies.hostageLine).not.toHaveBeenCalled();
  });

  it('a hostage killed in an older file is still laid by the envelope\'s corpses, as before RE-2', async () => {
    const p = await replayPage(segment([[200, kill(241, 'die_back')]], { roster: null, dead: (id, t) => id === 241 && t >= 200 }));
    p.clear();
    p.replay.seek(260);
    expect(welcomeOf(p.told)!.join!.corpses.map((c) => c.id)).toEqual([241]);
  });
});
