// @vitest-environment jsdom
// test/replayPovPaused.test.ts -- PV-14 (the player's-view lane; product track, a labelled browser adaptation with no
// original: `../src/spectatorView` POV_VIEW_ADAPTATION, research 402): the player's view chosen in a PAUSED replay after a
// seek -- the browser run of `e2e/replayViewer.spec.ts` case 11 (pv13-e0a15b4eb) read 'waiting' for its whole wait. The
// whole chain without a browser: a `ReplayClient` on a protocol-16 recording, `NetPage`'s spectator host wired to
// `matchNetDeps`' own view deps (`spectatePov`, `spectatePovWarm`, `spectatePovIdle`, `spectatePovReset`,
// `spectatePovCarried` -- the rig, the command clock, `placeView`), the replay's media time standing still while the
// page's frames run, the HUD's state read as the spec reads it (`spectatorHudView(...).pov`). The page harness is
// `netPagePov.test.ts`'s, the parts `matchNetPov.test.ts`'s, cut to what these cases read. Nothing here claims a value
// of the original.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayPlayer, ReplayRecord } from '../../match/src/replay/format';
import { noInput, type Input } from '../src/gamepad';
import { Hud, spectatorHudView } from '../src/hud';
import { TESTROOM_CAPABILITIES } from '../src/matchCore';
import { matchNetDeps, type MatchNetParts } from '../src/matchNet';
import { BodyFlag, TICK_HZ, type BodyState } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { WalkMode } from '../src/walk';
import { wrapYaw } from '../src/yaw';
import { body, header } from './replayFixture';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { Room, type Conn } from '../../match/src/room';
import { MatchBots } from '../../match/src/bots/matchBots';
import type { NavigationData } from '../../match/src/bots/navigation';
import { solidWalls } from '../../match/test/helpers/solidWalls';
import { decodeSnapshot, frameKind } from '../src/net/codec';
import { Frame, PROTOCOL_VERSION, type ServerEvent } from '../src/net/protocol';
import { groundGrid, packGround, type SimMap } from '../src/sim';

afterEach(() => { vi.restoreAllMocks(); });

const PLAYERS: ReplayPlayer[] = [
  { id: 3, name: 'Alpha', team: 'seal', role: 'player', char: 0 },
  { id: 5, name: 'Bravo', team: 'terrorist', role: 'player', char: 0 },
];
const ALPHA = 3;

/**
 * The recording's shape: `commands` -- each seat's commands run one a room tick, so the wire's nibble (`clock`, the low
 * four bits of `sim.seq`, research 402 s3) advances with them (a page that plays); false -- no seat ran a command, so
 * `sim.seq` stays 0 and every body's nibble reads 0 at every snapshot: the recording `e2e/replayViewerMatch.ts`
 * `playHostedMatch` makes for case 11 (two raw sockets that send `hello`, `loaded`, `launch` and `bye` and no command;
 * the room moves the carrier by `Walker.place` alone). `deadFrom`: Alpha dead from that tick on; `spawnAt`: Alpha's
 * seq restarts nothing but the body is stood elsewhere there (a respawn: dead the 30 ticks before it). `stall`: Alpha's
 * commands stop reaching the room after tick `from` for `len` ticks, then all of them run at once (a hidden tab's half
 * second, an uplink stall: `../src/net/commandClock.ts`' header) -- Bravo's run on.
 */
interface Shape { commands: boolean; seconds?: number; deadFrom?: number; spawnAt?: number; replaceAt?: number; replaceBetweenStepsAt?: number; stall?: { from: number; len: number } }
/** `replaceAt`: Alpha stood elsewhere at that tick with NO death before it -- a classic round's start re-placing a survivor
 * -- and the room's `spawn` event for him recorded there (`room.ts` broadcasts one for every seat at every spawn), before
 * that tick's snapshot, as a spawn inside the room's step is. `replaceBetweenStepsAt`: the same re-place made BETWEEN
 * steps (a seat leaving the ARMORY, `room.ts` `ready` -> `start`): its event stamped with that tick but written AFTER the
 * tick's snapshot, which still shows the old place; the new place from the next snapshot on. */
function recording(o: Shape): LoadedSegment {
  const h = header({ protocol: 16 });
  const ticks = (o.seconds ?? 12) * TICK_HZ;
  const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: PLAYERS }];
  for (let t = 0; t <= ticks; t += 2) {
    const seq = o.commands ? t : 0;
    const st = o.stall, aseq = st && t > st.from && t < st.from + st.len ? st.from : seq;
    const dead = (o.deadFrom !== undefined && t >= o.deadFrom) || (o.spawnAt !== undefined && t >= o.spawnAt - 30 && t < o.spawnAt);
    const late = o.replaceBetweenStepsAt;
    const moved = o.spawnAt ?? o.replaceAt ?? (late === undefined ? undefined : late + 2);
    const x = moved !== undefined && t >= moved ? 500 + 0.5 * (t - moved) : 0.5 * t;
    if (o.replaceAt === t) records.push({ kind: 'event', tick: t, event: { type: 'spawn', id: ALPHA, at: [x, 0, -50], yaw: 0, after: 0 } as never });
    const a: BodyState = { ...body(ALPHA, x), feet: [x, 0, -50], yaw: wrapYaw(t), flags: dead ? 0 : BodyFlag.Alive, clock: aseq & 15 };
    const b: BodyState = { ...body(5, -x), feet: [-x, 0, 50], clock: seq & 15 };
    records.push({ kind: 'snap', tick: t, bodies: [a, b] });
    if (late === t) records.push({ kind: 'event', tick: t, event: { type: 'spawn', id: ALPHA, at: [500, 0, -50], yaw: 0, after: 0 } as never });
  }
  records.push({ kind: 'end', tick: ticks, reason: 'closed' });
  return { header: h, records, truncated: false };
}

function remoteOf(): RemotePlayers {
  return {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined,
    setOpacity: () => undefined, cameraRoot: () => null, setPovHidden: () => undefined, mounted: () => false,
  } as unknown as RemotePlayers;
}

/** `matchNetDeps`' view deps on `replay` -- the page's own (`main.ts` `povNet: () => net?.client ?? null`), its fly placing the view. */
function viewDeps(replay: ReplayClient, placed: number[][]): Partial<NetPageDeps> {
  const p = {
    caps: TESTROOM_CAPABILITIES,
    walk: { gridOfGround: () => null, mode: () => 'fly' } as unknown as NetPageDeps['walk'],
    remote: remoteOf(),
    hud: {} as NetPageDeps['hud'],
    fly: {
      setPose: () => {}, placeView: (eye: number[]) => { placed.push([...eye]); }, setViewNear: () => {}, setSubjectOffset: () => {},
      aspect: () => 16 / 9,
    },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [], roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {}, setSubjectView: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
    },
    clips: () => null, map: () => null, side: () => 'seal', followTeam: () => {}, menuOpen: () => false,
    povNet: () => asNetClient(replay),
  } as unknown as MatchNetParts;
  const rest = {
    remoteGrenade: () => {}, ownProjectiles: () => true, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {},
    whiteOut: () => {}, sceneRound: () => {}, reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {},
    roundAudio: {} as never, objective: () => null, escorteeVoice: () => {}, taunt: () => {}, communication: () => {},
    voiceFloor: () => {}, voiceFrame: () => {}, drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},
    hostageState: () => {}, armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {}, client: null,
  } as Partial<NetPageDeps>;
  const d = matchNetDeps(p, { answered: () => {} }, rest as never);
  return {
    spectatePov: d.spectatePov!, spectatePovWarm: d.spectatePovWarm!, spectatePovIdle: d.spectatePovIdle!,
    spectatePovReset: d.spectatePovReset!, spectatePovCarried: d.spectatePovCarried!,
  };
}

/**
 * A watcher's `NetPage` on the replay, the view's deps `matchNetDeps`' own; `frame` the page's loop (`main.ts`: the wall
 * clock runs, `advance`, `net.frame`), whatever the replay's own clock does; Alpha followed (Right), as case 11 follows a
 * living player in PLAYER. `pov()` the HUD's state as the spec reads it (`hud().model.spectator.pov`).
 */
async function viewer(seg: LoadedSegment, follow = ALPHA) {
  let now = 10_000;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => now });
  const placed: number[][] = [];
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote: remoteOf(), hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    client: () => asNetClient(replay), ...viewDeps(replay, placed),
  };
  const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const camera = new PerspectiveCamera();
  camera.far = 1000;
  camera.updateMatrixWorld();
  const frame = (dt = 1 / 60): void => { now += dt * 1000; replay.advance(); net.frame(dt, camera, false); };
  const pad = (held: Partial<Input> = {}): void => { net.spectatorPad({ ...noInput(), ...held }); };
  const pov = (): string | undefined => spectatorHudView(net, { mode: () => 'fly', isDead: () => false })?.pov;
  pad();
  frame();
  for (let i = 0; i < 8 && net.spectator.target !== follow; i++) { pad({ leanRight: true }); pad(); frame(); }   // Right: follow `follow`
  expect([net.spectator.mode, net.spectator.target]).toEqual(['follow', follow]);
  /** Frames until the HUD reads 'shown' (at most `max`), or null. */
  const framesToShown = (max: number): number | null => {
    for (let i = 1; i <= max; i++) { frame(); if (pov() === 'shown') return i; }
    return null;
  };
  return { replay, net, placed, frame, pad, pov, framesToShown };
}

describe('PV-14: the player\'s view chosen in a paused replay after a seek (case 11\'s first step, without a browser)', () => {
  it('a recording whose seats ran commands: paused, sought, PLAYER\'S VIEW chosen -- drawn on the first frame, and held drawn while paused', async () => {
    const v = await viewer(recording({ commands: true }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(300);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBe(1);
    const tick = v.replay.serverTick();
    for (let i = 0; i < 120; i++) { v.frame(); expect(v.pov()).toBe('shown'); }
    expect(v.replay.serverTick()).toBe(tick);                     // two seconds of page frames: the replay stood still
    v.net.close();
  });

  /**
   * The finding (PV-14): case 11's failure is not the pause's. Its recording holds no command number to draw on -- the
   * clock's one sample is replaced at every snapshot (a stall, `../src/net/commandClock.ts` `hear` rule 2), so `cmd()` is
   * null (`n < 2`) at every tick, the rig is never run (`../src/matchNet.ts` `povFrame`: no clock, null) and every frame
   * falls back: 'waiting' paused and playing alike, as the box read it. Pinned here as what the view does on such a
   * recording (PV.R6's design: no command clock, no player's view); the fix is the case's recording, not the view.
   */
  it('case 11\'s recording (no seat ran a command: every nibble 0): no command clock anywhere, so the view never lands -- paused after a seek, and playing too', async () => {
    const v = await viewer(recording({ commands: false }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(300);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(180)).toBeNull();
    expect([v.net.spectator.pov, v.pov(), v.placed.length]).toEqual([true, 'waiting', 0]);
    expect(v.replay.commandClock()).toBeNull();
    v.replay.play();
    expect(v.framesToShown(300)).toBeNull();                       // five seconds played at 1x: the same
    expect(v.replay.commandClock()).toBeNull();
    v.net.close();
  });
});

/**
 * PV-14 item 3: the same chain at the cases the brief names, on a recording whose seats ran commands -- each pinned as
 * measured here (frames of the page at 60 Hz).
 */
describe('PV-14 item 3: after a seek, playing; a seek and a jump in the view while paused; the round\'s start, a respawn; a dead body', () => {
  it('playing at 1x after a seek: drawn on the first frame', async () => {
    const v = await viewer(recording({ commands: true }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.seek(300);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBe(1);
    for (let i = 0; i < 60; i++) { v.frame(); expect(v.pov()).toBe('shown'); }
    v.net.close();
  });

  it('paused in the view: a seek, the transport\'s jumps (a seek either way) and a step each way move the picture to the new moment on the next frame, never a fallback frame', async () => {
    const v = await viewer(recording({ commands: true }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(300);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBe(1);
    const moves: (() => void)[] = [
      () => { v.replay.seek(600); }, () => { v.replay.seek(v.replay.serverTick() + 5 * TICK_HZ); },
      () => { v.replay.seek(v.replay.serverTick() - 5 * TICK_HZ); }, () => { v.replay.step(1); }, () => { v.replay.step(-1); },
    ];
    for (const move of moves) {
      move();
      const n = v.placed.length;
      v.frame();
      expect(v.pov()).toBe('shown');
      expect(v.placed.length).toBe(n + 1);                           // placed on that very frame
      const x = 0.5 * v.replay.serverTick();                        // Alpha's feet at the new moment
      expect(Math.abs(v.placed.at(-1)![0]! - x)).toBeLessThan(40);   // the camera behind him there (third person)
    }
    v.net.close();
  });

  it('within the warm-up\'s reach of the recording\'s first tick, and just after a respawn: drawn on the first frame, from the history there is', async () => {
    const first = await viewer(recording({ commands: true }));
    first.replay.pause();
    first.replay.seek(6);
    first.net.spectator.setPov(true);
    expect(first.framesToShown(5)).toBe(1);
    first.net.close();
    const spawn = await viewer(recording({ commands: true, spawnAt: 300 }));
    for (let i = 0; i < 30; i++) spawn.frame();
    spawn.replay.pause();
    spawn.replay.seek(304);
    spawn.net.spectator.setPov(true);
    expect(spawn.framesToShown(5)).toBe(1);
    expect(Math.abs(spawn.placed.at(-1)![0]! - 502)).toBeLessThan(40);   // at the spawn's place, not slid from the corpse
    spawn.net.close();
  });

  it('a spawn with no death (a survivor re-placed at a round start): a new life to the command clock, as live -- never a slide from the old place', async () => {
    // inside the room's step (the event before the tick's snapshot) and between steps (after it: close review pass 3)
    for (const shape of [{ replaceAt: 300 }, { replaceBetweenStepsAt: 300 }]) {
      const seg = recording({ commands: true, ...shape });
      const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => 10_000 });
      await replay.ready;
      replay.pause();
      replay.seek(320);
      replay.setCommandClockBody(ALPHA);
      const top = Math.floor(replay.commandClock()!.cmd);            // the clock's own (unwrapped) numbers: 1 a room tick here
      const reads: { k: number; x: number; life: number }[] = [];
      for (let k = top - 60; k <= top; k += 0.5) {
        const b = replay.bodyAtCommand(k);
        if (b) reads.push({ k, x: b.feet[0], life: replay.lifeAtCommand(k)! });
      }
      const what = JSON.stringify(shape);
      const old = reads.filter((r) => r.x <= 150), moved = reads.filter((r) => r.x >= 500);
      expect([old.length > 0, moved.length > 0], what).toEqual([true, true]);   // the window spans the re-place
      expect(reads.filter((r) => r.x > 150 && r.x < 500), `${what}: drawn between the two places (a slide)`).toEqual([]);
      expect(new Set(old.map((r) => r.life)).size, `${what}: one life at the old place`).toBe(1);
      expect(moved[0]!.life, what).toBe(old.at(-1)!.life + 1);      // the room's spawn counted, as `NetClient.spawnsAt` counts it
      replay.close();
    }
  });

  it('a dead body: the view not offered there (no line, the choice refused), unchanged', async () => {
    const v = await viewer(recording({ commands: true, deadFrom: 200 }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(300);
    v.frame();
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBeNull();
    expect([v.net.spectator.pov, v.pov(), v.placed.length]).toEqual([undefined, undefined, 0]);
    v.net.close();
  });
});

/**
 * PV-14, the controller's item 3 (a limit, pinned, not fixed): a reset of the watched body's clock heard AHEAD of the
 * playhead while the window is primed (`../src/replay/replayClient.ts` `ccWindow` ~:780: a changed nibble after more than
 * `COMMAND_CLOCK_STALL_TICKS_ADAPTATION` ticks without an advance, within `REPLAY_COMMAND_CLOCK_AHEAD_TICKS_ADAPTATION`
 * of it) has already dropped the clock's older samples, and the read answers null until the playhead reaches it (the
 * review's fold 1). Playing, that is at most 20 ticks of the follow; PAUSED there it stands for as long as the pause --
 * reachable from a real recording: a subject whose page stopped for half a second to a second (a hidden tab, an uplink
 * stall), the replay paused in the last third of a second before his commands came back. Research 402, the PV-14 entry.
 */
describe('PV-14: the paused-only limit -- a reset of the clock just ahead of a paused playhead', () => {
  it('paused 10 ticks before a 40-tick stall\'s end: no clock, \'waiting\', for as long as it stays paused; played on, drawn within the 10 ticks', async () => {
    const v = await viewer(recording({ commands: true, stall: { from: 300, len: 40 } }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(330);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(120)).toBeNull();
    expect([v.replay.commandClock(), v.pov()]).toEqual([null, 'waiting']);
    v.replay.play();
    const n = v.framesToShown(30);
    expect(n).not.toBeNull();
    expect(n!).toBeLessThanOrEqual(12);
    v.net.close();
  });

  it('the control: paused 26 ticks before it (the reset past the window\'s reach), drawn on the first frame', async () => {
    const v = await viewer(recording({ commands: true, stall: { from: 300, len: 40 } }));
    for (let i = 0; i < 30; i++) v.frame();
    v.replay.pause();
    v.replay.seek(314);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBe(1);
    v.net.close();
  });
});

// ---- PV-14, the controller's item 2: a server-side bot -- its commands, its nibble, the view on it ----

const BOT_PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
/** `../../match/test/botController.test.ts`' `flat()` map (a floor, sixteen spawn slots), cut to the floor. */
function botMap(): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const solid = solidWalls([floor]);
  const owners: CollisionOwner[] = solid.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 }));
  const ground = packGround(BOT_PARAMS, solid, owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'BOT TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
/** A connection that keeps what the room sends it: its events, and each snapshot frame decoded. */
class Keep implements Conn {
  readonly events: ServerEvent[] = [];
  readonly snaps: { tick: number; bodies: BodyState[] }[] = [];
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') { this.events.push(JSON.parse(frame) as ServerEvent); return; }
    if (frameKind(frame) === Frame.Snapshot) { const s = decodeSnapshot(frame); this.snaps.push({ tick: s.tick, bodies: s.bodies }); }
  }
  close(): void { /* no transport */ }
}

describe('PV-14 item 2: a server-side bot carries its seat\'s command number, and the player\'s view lands on it', () => {
  /**
   * The room's own bots on the room's own wire (`botController.test.ts`' setup: a respawn room, `MatchBots`, a bot step
   * then a room step a tick): a human host who sends nothing, one CPU terrorist, and a watcher (`watch: true`) whose
   * snapshots -- the spectator's list, every tail (`room.ts` `recipientBodies`' doc), the list a recording holds -- are
   * made a protocol-16 recording as `RoomRecording` would write them.
   */
  it('the bot\'s nibble advances 1-3 a snapshot as a page\'s does; commandClock() answers; paused after a seek, the view is \'shown\' on the first frame', async () => {
    let now = 0, seed = 1;
    const random = (): number => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    const room = new Room(botMap(), null, { rules: 'respawn', heldLaunch: true, now: () => now, random }, null, null);
    expect(room.hello(1, new Keep(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Human', map: 'MP99' }, '', { host: true, side: 'seal' })).toBe(true);
    const watcher = new Keep();
    expect(room.hello(9, watcher, { type: 'hello', version: PROTOCOL_VERSION, name: 'Watcher', map: 'MP99', watch: true })).toBe(true);
    const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
    const bots = new MatchBots(room, { random, navigation, kits: null });
    bots.setRoster({ seal: 0, terrorist: 1 });
    const bot = bots.botIds()[0]!;
    expect(room.launch(0)).toBe(true);
    for (let i = 0; i < 12 * TICK_HZ; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); }
    const snaps = watcher.snaps.filter((s) => s.bodies.some((b) => b.id === bot && (b.flags & BodyFlag.Alive)));
    expect(snaps.length).toBeGreaterThan(300);
    // The nibble off the wire: its advance each snapshot (two room ticks), unwrapped as the clock unwraps it.
    const nib = (s: { bodies: BodyState[] }): number => s.bodies.find((b) => b.id === bot)!.clock ?? 0;
    const steps = snaps.slice(1).map((s, i) => (nib(s) - nib(snaps[i]!)) & 15);
    expect(steps.filter((d) => d >= 1 && d <= 3).length).toBeGreaterThan(steps.length * 0.95);
    bots.dispose();
    // The watcher's snapshots as a recording (the roster: the lobby's) -> the replay's view on the bot.
    const roster: ReplayPlayer[] = room.lobby.players().filter((p) => p.team).map((p) => ({ id: p.id, name: p.name, team: p.team!, role: 'player', char: 0 }));
    const h = header({ protocol: 16, rules: 'respawn' });
    const t0 = snaps[0]!.tick;
    const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: t0, players: roster },
      ...watcher.snaps.filter((s) => s.tick >= t0).map((s): ReplayRecord => ({ kind: 'snap', tick: s.tick, bodies: s.bodies }))];
    records.push({ kind: 'end', tick: watcher.snaps.at(-1)!.tick, reason: 'closed' });
    const v = await viewer({ header: h, records, truncated: false }, bot);
    v.replay.pause();
    v.replay.seek(t0 + 8 * TICK_HZ);
    v.net.spectator.setPov(true);
    expect(v.framesToShown(5)).toBe(1);
    expect(v.replay.commandClock()).not.toBeNull();
    v.replay.play();
    for (let i = 0; i < 120; i++) { v.frame(); expect(v.pov()).toBe('shown'); }
    v.net.close();
  });
});
