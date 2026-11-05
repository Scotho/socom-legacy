// @vitest-environment jsdom
// test/replaySpectate.test.ts -- PT-19: the spectator modes in the replay (web sprint 35; research 244 §3): the existing
// readings of `spectatorView.ts` (`FUN_00295260`, research 91's row) on the recorded bodies, W35.R8's keys, and F2's
// animation clock (`dtScale`)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { parseZdb } from '@s2u/archive';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import type { ReplayPlayer, ReplayRecord } from '../../match/src/replay/format';
import { noInput, type Input } from '../src/gamepad';
import { Hud, spectatorHudView } from '../src/hud';
import { scenicViewsOf, type ScenicView } from '../src/mapMeta';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { ReplayClock } from '../src/replay/clock';
import { mountReplayBar } from '../src/replay/controls';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import {
  cameraEye, followPose, jumpToVisible, scenicViews, SpectatorView, type SpectatorBody, type SpectatorPose,
} from '../src/spectatorView';
import type { WalkMode } from '../src/walk';
import { body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

/** Three players; their feet are `spectatorView.test.ts`'s Triangle fixture (3 at the far line, 5 within the band and nearer, 9 off it). */
const PLAYERS: ReplayPlayer[] = [
  { id: 3, name: 'Alpha', team: 'seal', role: 'player', char: 0 },
  { id: 5, name: 'Bravo', team: 'terrorist', role: 'player', char: 0 },
  { id: 9, name: 'Charlie', team: 'seal', role: 'player', char: 0 },
];
const FEET: Record<number, [number, number, number]> = { 3: [10, 0, -100], 5: [10.5, 0, -50], 9: [20, 0, -30] };

/** `spectatorView.test.ts`'s views (MP2's first three, SCENIC_VIEWS_READING). */
const VIEWS: ScenicView[] = [
  { name: 'SEAL Start', at: [979, 236, 689], pitch: -26, yaw: 53, roll: 0 },
  { name: 'Middle Passage', at: [749, 206, 647], pitch: -16, yaw: 155, roll: 0 },
  { name: 'Eastern Overlook', at: [1199, 255, 1073], pitch: -37, yaw: 54, roll: 0 },
];

/**
 * The segment: the three from tick 0, a snapshot every 2 ticks to 200, `leave` taking one out of the roster and the
 * snapshots at its tick. REPLAY-SEEK-KEEP: `roundStarts` puts a `roundStart` (round 1, 2, ...) at each of its ticks -- a
 * stateful record, so a seek is told by a fold-built welcome (`ReplayClient.seekTo`, W37.R4) -- and the bodies walk +x a
 * unit a tick, so "where it stands" moves.
 */
function segment(leave?: { id: number; at: number }, roundStarts: readonly number[] = []): LoadedSegment {
  const h = header();
  const records: ReplayRecord[] = [{ kind: 'header', header: h }];
  const present = (id: number, tick: number): boolean => !(leave && leave.id === id && tick >= leave.at);
  const walks = roundStarts.length > 0;
  for (let tick = 0; tick <= 200; tick++) {
    if (tick === 0) records.push({ kind: 'players', tick, players: PLAYERS });
    if (leave && tick === leave.at) records.push({ kind: 'players', tick, players: PLAYERS.filter((p) => p.id !== leave.id) });
    const round = roundStarts.indexOf(tick) + 1;
    if (round > 0) {
      records.push({ kind: 'event', tick, event: { type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: tick } });
    }
    if (tick % 2 === 0) {
      const feet = (id: number): [number, number, number] => { const [x, y, z] = FEET[id]!; return [walks ? x + tick : x, y, z]; };
      records.push({ kind: 'snap', tick, bodies: PLAYERS.filter((p) => present(p.id, tick)).map((p) => ({ ...body(p.id, 0), feet: feet(p.id) })) });
    }
  }
  records.push({ kind: 'end', tick: 200, reason: 'closed' });
  return { header: h, records, truncated: false };
}

const idle = (): Input => noInput();

/** A watcher's NetPage on a ReplayClient (the replay mode's path, `./replay/mount`), its camera at the origin looking down -z. */
async function replayPage(o: { leave?: { id: number; at: number }; views?: readonly ScenicView[]; roundStarts?: readonly number[] } = {}) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(segment(o.leave, o.roundStarts)), { name: 'Watcher', map: 'MP2', now: () => now });
  const poses: (SpectatorPose | null)[] = [];
  const dts: number[] = [];
  /** The remote bodies' animation time: what `RemotePlayers.frame` advances every gait, flinch, death clip and fade by. */
  let phase = 0;
  const deps = baseDeps({
    spectate: (p) => { poses.push(p); }, scenicViews: () => o.views ?? [],
    remote: remoteOf((dt) => { dts.push(dt); phase += dt; }),
    client: () => asNetClient(replay),
  });
  const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const camera = new PerspectiveCamera();
  camera.far = 1000;
  camera.updateMatrixWorld();
  /** One frame of `dt` seconds of the wall: the mode's loop pumps the records, then the page draws. */
  const frame = (dt = 1 / 60): void => { now += dt * 1000; replay.advance(); net.frame(dt, camera, false); };
  const pad = (held: Partial<Input> = {}): void => { net.spectatorPad({ ...idle(), ...held }); };
  const tap = (flag: keyof Input): void => { pad({ [flag]: true }); pad(); };
  pad();
  return { replay, net, poses, dts, phase: () => phase, frame, tap, camera, now: () => now };
}

/** The live spectator's host over the same bodies (`netPage.ts`'s, for a watcher): the comparison for "as the live one does". */
function liveView(bodies: () => readonly SpectatorBody[], views: readonly ScenicView[] = []) {
  const poses: (SpectatorPose | null)[] = [];
  const view = new SpectatorView({
    bodies, spectate: (p) => { poses.push(p); }, leaveSelf: () => {}, views: () => views,
    seat: () => ({ role: 'spectator', self: null, team: null, teams: new Map(), rules: 'classic', ghost: false }),
  });
  const tap = (flag: keyof Input): void => { view.pad({ ...idle(), [flag]: true }); view.pad(idle()); };
  view.pad(idle());
  return { view, poses, tap };
}

function remoteOf(frame: (dt: number) => void): RemotePlayers {
  return {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    clear: () => undefined, frame: (dt: number) => { frame(dt); }, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined,
    setOpacity: () => undefined,
  } as unknown as RemotePlayers;
}

function baseDeps(over: Partial<NetPageDeps>): NetPageDeps {
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  return {
    walk, remote: remoteOf(() => {}), hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    ...over,
  };
}

/** A live page (no factory: its own NetClient on a fake socket), welcomed as `role`. */
function livePage(over: Partial<NetPageDeps>, role: 'spectator' | 'player' = 'spectator') {
  const sockets: WebSocketLike[] = [];
  const deps = baseDeps({
    socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
    ...over,
  });
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, role === 'spectator', 'classic');
  sockets.at(-1)!.onopen?.({} as Event);
  const welcome = {
    type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 0, role, team: role === 'player' ? 'seal' : null, queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as unknown as ServerEvent;
  /** The room's welcome on the page's socket (again: a re-welcome, as a reconnect's). */
  const welcomeAgain = (): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(welcome) } as MessageEvent); };
  welcomeAgain();
  return { net, sockets, welcomeAgain };
}

const key = (type: 'keydown' | 'keyup', code: string): void => {
  document.body.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
};

describe('PT-19: the spectator modes on a replay with three bodies -- the existing readings, used as they are', () => {
  it('follow takes the first living body at the follow pose (FOLLOW_BEHIND/OVER/PITCH) and Right/Left cycle in the reading\'s order (SPECTATOR_CYCLE_ORDER_READING), on the release (SPECTATOR_RELEASE_READING) -- the live spectator\'s sequence', async () => {
    const r = await replayPage();
    const live = liveView(() => r.replay.bodies());
    r.frame();
    live.view.frame();
    // The replay opens free, no pose handed (SPECTATOR_START_READING, SPECTATOR_ENTRY_POSE_PLACEHOLDER; PT-19b's fix round).
    expect([r.net.spectator.mode, r.net.spectator.target, r.poses.every((p) => p === null)]).toEqual(['free', null, true]);
    expect(r.net.spectator.mode).toBe(live.view.mode);     // the starting mode: the shared reading's, compared
    r.tap('leanRight');                                     // Right follows the first living body
    live.tap('leanRight');
    r.frame();
    expect(r.net.spectator.target).toBe(3);
    const b3 = r.replay.bodies().find((b) => b.id === 3)!;
    expect(r.poses.at(-1)).toEqual(followPose(b3));
    const seen: (number | null)[] = [], liveSeen: (number | null)[] = [];
    for (const flag of ['leanRight', 'leanRight', 'leanRight', 'leanLeft', 'leanLeft'] as const) {
      r.tap(flag);
      live.tap(flag);
      seen.push(r.net.spectator.target);
      liveSeen.push(live.view.target);
    }
    expect(seen).toEqual([5, 9, 3, 9, 5]);                 // the shared reading's seat-id order (nextFollow), wrapping both ways
    expect(seen).toEqual(liveSeen);
    r.frame();
    expect(r.poses.at(-1)).toEqual(followPose(r.replay.bodies().find((b) => b.id === 5)!));
    r.net.close();
  });

  it('Triangle jumps to the body jumpToVisible picks (JUMP_TO_VISIBLE_READING) -- 5, the one spectatorView.test picks for these feet', async () => {
    const r = await replayPage();
    r.frame();                                              // the eye taken; the start is free
    r.tap('leanRight');                                     // Right follows 3
    expect(r.net.spectator.target).toBe(3);
    const live = liveView(() => r.replay.bodies());
    live.view.frame(cameraEye(r.camera));
    live.tap('leanRight');
    r.tap('stance');
    live.tap('stance');
    expect(r.net.spectator.target).toBe(5);
    expect(jumpToVisible(cameraEye(r.camera)!, r.replay.bodies())).toBe(5);
    expect(r.net.spectator.mode).toBe(live.view.mode);     // the mode the jump enters: the shared reading's, compared
    r.net.close();
  });

  it('scenic walks the map\'s views (Up/Down, FUN_002ab260); X, the jump and the cycle do on the replay what SpectatorView does on the live page -- the modes compared, never restated here', async () => {
    // The mode labels and X's toggle are `spectatorView.ts`'s shared reading (research 244 §3, corrected by PT-19b): the
    // replay asserts only that it does what the live view does over the same bodies and views, so a fix there applies
    // here unchanged.
    const r = await replayPage({ views: VIEWS });
    const live = liveView(() => r.replay.bodies(), VIEWS);
    r.frame();
    live.view.frame(cameraEye(r.camera));
    const state = (v: SpectatorView): unknown[] => [v.mode, v.remembered, v.scenic, v.target];
    const at = (p: SpectatorPose | null | undefined): string => VIEWS.find((v) => p && v.at[0] === p.x && v.at[1] === p.y && v.at[2] === p.z && v.yaw === p.yaw && v.pitch === p.pitch)?.name ?? 'none';
    const stood: string[] = [];
    for (const flag of ['action', 'action', 'zoom', 'zoom', 'zoom', 'zoom', 'zoomOut', 'action', 'action', 'stance', 'action', 'leanRight'] as const) {
      r.tap(flag);
      live.tap(flag);
      expect(state(r.net.spectator), flag).toEqual(state(live.view));
      expect(r.poses.length, flag).toBe(live.poses.length);
      expect(r.poses.at(-1), flag).toEqual(live.poses.at(-1));
      if (flag === 'zoom' || flag === 'zoomOut') stood.push(at(r.poses.at(-1)));
    }
    expect(stood).toEqual(['SEAL Start', 'Middle Passage', 'Eastern Overlook', 'SEAL Start', 'Eastern Overlook']);
    r.frame();
    live.view.frame(cameraEye(r.camera));
    expect(r.poses.at(-1)).toEqual(live.poses.at(-1));     // a frame stands the camera where the live view's does
    r.net.close();
  });

  it('PT-19b: on the replay too, X goes follow -> free -> follow and scenic -> free -> scenic -- free the hub (FUN_00295260 D:L139480-139530; research 244 §3)', async () => {
    const r = await replayPage({ views: VIEWS });
    r.frame();
    const state = (): unknown[] => [r.net.spectator.mode, r.net.spectator.remembered];
    expect([...state(), r.net.spectator.target]).toEqual(['free', 'free', null]);   // the replay opens free (PT-19b fix round)
    r.tap('action');
    expect(state()).toEqual(['free', 'free']);             // X from the start: a remembered free, nothing (D:L139519)
    r.tap('leanRight');
    expect([...state(), r.net.spectator.target]).toEqual(['follow', 'free', 3]);
    r.tap('action');
    expect(state()).toEqual(['free', 'follow']);
    r.tap('action');
    expect([...state(), r.net.spectator.target]).toEqual(['follow', 'follow', 3]);
    r.tap('zoom');
    r.tap('action');
    expect(state()).toEqual(['free', 'scenic']);
    r.tap('action');
    expect([...state(), r.net.spectator.scenic]).toEqual(['scenic', 'scenic', 0]);
    r.net.close();
  });

  const mp2 = fixture('RUN/MP2.ZDB');
  it.skipIf(mp2 === null)(`scenic walks MP2's own views, read off its mission.rdr (scenicViewsOf -> scenicViewsFromRdr), in file order${mp2 === null ? ` (${FIXTURES_ABSENT})` : ''}`, async () => {
    const map = { scenicViews: scenicViewsOf(mp2!, parseZdb(mp2!)) };
    const views = scenicViews(map);                          // `matchNet.ts`'s `scenicViews: () => scenicViews(p.map() ?? {})`
    expect(views.length).toBe(6);
    const r = await replayPage({ views });
    r.frame();
    const walked: string[] = [];
    for (let i = 0; i < views.length + 1; i++) {
      r.tap('zoom');
      const p = r.poses.at(-1)!;
      walked.push(views.find((v) => v.at[0] === p.x && v.at[1] === p.y && v.at[2] === p.z)!.name);
    }
    expect(walked).toEqual([...views.map((v) => v.name), views[0]!.name]);
    r.net.close();
  });

  it('a followed body that leaves the roster mid-follow: the follow stays on it as the live spectator\'s does -- retired, deleted, the camera left (AD-8, research 314 §5.4)', async () => {
    const r = await replayPage({ leave: { id: 5, at: 100 } });
    const live = liveView(() => r.replay.bodies());
    r.frame();
    live.view.frame();
    for (let i = 0; i < 2; i++) { r.tap('leanRight'); live.tap('leanRight'); }   // the start is free: 3, then 5
    expect([r.net.spectator.target, live.view.target]).toEqual([5, 5]);
    for (let i = 0; i < 120; i++) { r.frame(); live.view.frame(); }   // past tick 100: 5 gone from the roster and the snapshots
    expect(r.replay.roster().map((p) => p.id)).toEqual([3, 9]);
    expect(r.replay.bodies().map((b) => b.id)).toEqual([3, 9]);
    // AD-8 (was: on to 3, the first living): the leaver kept retired, then deleted (one a frame), the target kept and no
    // pose handed after (FOLLOW_RETIRED_BODY_PLACEHOLDER, FOLLOW_DELETE_QUEUE_PLACEHOLDER, FOLLOW_AFTER_DELETE_PLACEHOLDER).
    expect([r.net.spectator.target, r.net.spectator.mode, r.net.spectator.retired.length]).toEqual([5, 'follow', 0]);
    expect(r.net.spectator.target).toBe(live.view.target);
    expect(r.poses.at(-1)).toEqual(live.poses.at(-1));                // the last pose the retired body gave, on both
    expect(r.poses.at(-1)).not.toEqual(followPose(r.replay.bodies().find((b) => b.id === 3)!));
    r.net.close();
  });
});

describe('REPLAY-SEEK-KEEP (#270, #271): a replay seek keeps the watcher\'s camera -- AD-9\'s reset is the level\'s init and the turnover\'s, not a seek\'s (research 314 §5.5)', () => {
  // A browser adaptation (no original: the original has no replay seek). The fixture carries a stateful record (a
  // `roundStart`), so each seek here is told by the fold's welcome (W37.R4) -- the one the earlier fixture never sent.
  type Page = Awaited<ReturnType<typeof replayPage>>;
  const state = (r: Page): unknown[] => [r.net.spectator.mode, r.net.spectator.remembered, r.net.spectator.target];
  /** The welcomes the page is told from now (the fold's carrier at a seek; none at play). */
  const welcomes = (r: Page): (() => number) => {
    let n = 0;
    r.replay.on((ev) => { if (ev.type === 'welcome') n++; });
    return () => n;
  };
  /** The walk a watcher's welcome flew (`NetPage.spectatorWelcome`: `walk.setMode('fly')`), as `./main`'s frame hands it. */
  const flown = { mode: (): string => 'fly', isDead: (): boolean => false };

  it('#271: Right, X, then End and a step back keep [mode, remembered, target] at free / follow / 3; X then follows body 3 where it stands', async () => {
    const r = await replayPage({ roundStarts: [4] });
    r.replay.pause();
    r.replay.seek(10);                                      // past the round's start: its roundStart behind the playhead
    r.frame();
    r.tap('leanRight');                                     // the start is free: Right follows 3
    r.tap('action');                                        // X: free, the follow remembered
    expect(state(r)).toEqual(['free', 'follow', 3]);
    const feetThen = r.replay.bodies().find((b) => b.id === 3)!.feet;
    const told = welcomes(r);
    r.replay.seekEnd();
    r.frame();
    expect(state(r), 'End').toEqual(['free', 'follow', 3]);
    r.replay.step(-1);
    r.frame();
    expect(told(), 'End and the step back each told by a welcome').toBe(2);
    expect(state(r), 'a step back').toEqual(['free', 'follow', 3]);
    r.tap('action');                                        // X: back to the remembered follow
    r.frame();
    expect(state(r)).toEqual(['follow', 'follow', 3]);
    const b3 = r.replay.bodies().find((b) => b.id === 3)!;
    expect(b3.feet[0]).toBeGreaterThan(feetThen[0]! + 100); // the body has walked on since the follow was left
    expect(r.poses.at(-1)).toEqual(followPose(b3));
    r.net.close();
  });

  it('#270: the followed player\'s name (spectatorHudView\'s followed.name, what RV-8d reads off hud().model.spectator) is kept across a seek over the round\'s start', async () => {
    const r = await replayPage({ roundStarts: [4] });
    r.replay.pause();                                       // at tick 0, before the roundStart at 4
    r.frame();
    r.tap('leanRight');
    expect(spectatorHudView(r.net, flown)?.followed?.name).toBe('Alpha');
    const told = welcomes(r);
    r.replay.seek(150);                                     // over the roundStart, not played: folded into the welcome
    r.frame();
    expect(told()).toBe(1);
    expect(state(r)).toEqual(['follow', 'free', 3]);
    expect(spectatorHudView(r.net, flown)).toMatchObject({ path: 'spectator', followed: { name: 'Alpha' } });
    r.net.close();
  });

  it('the named edge (a replay adaptation\'s choice, as RE-3\'s and PAR-94d\'s guards): a seek landing in a LATER round keeps the follow too -- the seek plays no roundStart', async () => {
    const r = await replayPage({ roundStarts: [4, 100] });
    r.replay.pause();
    r.replay.seek(10);
    r.frame();
    r.tap('leanRight');
    r.replay.seek(150);                                     // round 2's start folded, not played
    r.frame();
    expect(state(r)).toEqual(['follow', 'free', 3]);
    r.net.close();
  });

  it('the counter-pin: a roundStart played through still resets the camera (AD-9: the page\'s unbench at roundStart, SPECTATOR_TURNOVER_EVENT_READING) to free / free / null', async () => {
    const r = await replayPage({ roundStarts: [4, 100] });
    r.replay.pause();
    r.replay.seek(90);
    r.frame();
    r.tap('leanRight');
    r.tap('action');
    r.tap('action');                                        // X twice: follow, remembered follow
    expect(state(r)).toEqual(['follow', 'follow', 3]);
    r.replay.play();
    for (let i = 0; i < 30; i++) r.frame();                 // 30 ticks at 1x: across the roundStart at 100, played
    expect(r.replay.serverTick()).toBeGreaterThan(100);
    expect(state(r)).toEqual(['free', 'free', null]);
    r.net.close();
  });

  it('the live branch (the review\'s F1): a live spectator\'s second welcome (a reconnect\'s) still resets the camera at the entry (FUN_001ec480 D:L50946) to free / free / null -- the guard is the replay\'s alone', () => {
    const bodies = [{ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 }, { id: 3, flags: 64, feet: [300, 0, 0], yaw: 0 }];
    const { net, welcomeAgain } = livePage({});
    expect(net.client.role).toBe('spectator');
    net.client.bodies = (() => bodies) as never;
    key('keyup', 'ArrowRight');                              // the start is free: Right follows 2
    key('keyup', 'KeyX');                                    // X: free, the follow remembered
    expect([net.spectator.mode, net.spectator.remembered, net.spectator.target]).toEqual(['free', 'follow', 2]);
    welcomeAgain();
    expect([net.spectator.mode, net.spectator.remembered, net.spectator.target]).toEqual(['free', 'free', null]);
    net.close();
  });
});

describe('W35.R8: the keys -- Space the replay\'s, the spectator\'s "next" on ArrowRight and the pad; the live spectator unchanged', () => {
  it('in the replay mode Space plays and pauses and does not move the follow; ArrowRight and the pad\'s Right step it', async () => {
    const r = await replayPage();
    const bar = mountReplayBar(document, r.replay);
    r.frame();
    r.tap('leanRight');                                     // the start is free: Right follows 3
    expect([r.replay.playing(), r.net.spectator.target]).toEqual([true, 3]);
    key('keydown', 'Space');
    key('keyup', 'Space');
    expect([r.replay.playing(), r.net.spectator.target]).toEqual([false, 3]);
    key('keydown', 'Space');
    key('keyup', 'Space');
    expect([r.replay.playing(), r.net.spectator.target]).toEqual([true, 3]);
    key('keydown', 'ArrowRight');
    key('keyup', 'ArrowRight');
    expect(r.net.spectator.target).toBe(5);
    r.tap('leanRight');
    expect(r.net.spectator.target).toBe(9);
    bar.dispose();
    r.net.close();
  });

  it('the live spectator (no replay): Space on keyup is still the next target (PF.R51), beside ArrowRight', () => {
    const bodies = [{ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 }, { id: 3, flags: 64, feet: [300, 0, 0], yaw: 0 }];
    const { net } = livePage({});
    expect(net.client.role).toBe('spectator');
    net.client.bodies = (() => bodies) as never;
    key('keydown', 'Space');
    expect(net.spectator.target).toBeNull();
    key('keyup', 'Space');
    expect(net.spectator.target).toBe(2);
    key('keyup', 'Space');
    expect(net.spectator.target).toBe(3);
    key('keyup', 'ArrowRight');
    expect(net.spectator.target).toBe(2);
    net.close();
  });
});

describe('F2: the animation on the replay\'s clock (dtScale; research 244 §3)', () => {
  it('the clock\'s scale: the speed while playing, 0 paused or at the end, 0 once after a seek or a step', () => {
    let now = 0;
    const c = new ReplayClock({ tickHz: 60, start: 0, end: 100, snaps: [0, 2, 4, 50, 100], now: () => now });
    expect(c.dtScale()).toBe(0);                            // not playing yet
    c.play();
    expect(c.dtScale()).toBe(1);
    c.speed(2);
    expect(c.dtScale()).toBe(2);
    c.seek(40);
    expect([c.dtScale(), c.dtScale()]).toEqual([0, 2]);     // the seek's frame no elapsed time, then the speed again
    c.pause();
    expect(c.dtScale()).toBe(0);
    c.play();
    c.step(1);                                              // a step pauses there: 0 (and the jump taken)
    expect([c.playing, c.dtScale(), c.dtScale()]).toEqual([false, 0, 0]);
    c.play();
    c.speed(0.25);
    expect(c.dtScale()).toBe(0.25);
    now += 100_000;                                         // far past the end: the clock stands at the last tick
    expect([c.atEnd(), c.dtScale()]).toEqual([true, 0]);
  });

  it('paused: the remote animation does not advance (two frames, the same phase); 2x advances it twice the wall dt; a seek frame advances nothing', async () => {
    const r = await replayPage();
    r.frame(1 / 60);
    expect(r.dts.at(-1)).toBe(1 / 60);                      // 1x: the wall's dt
    r.replay.pause();
    const before = r.phase();
    const bodiesBefore = JSON.stringify(r.replay.bodies());
    r.frame(1 / 60);
    r.frame(1 / 60);
    expect(r.phase()).toBe(before);                         // identical gait phase across two paused frames
    expect(r.dts.slice(-2)).toEqual([0, 0]);
    expect(JSON.stringify(r.replay.bodies())).toBe(bodiesBefore);
    r.replay.speed(2);
    r.replay.play();
    r.frame(1 / 60);
    expect(r.dts.at(-1)).toBe(2 / 60);                      // twice per wall dt
    r.replay.seek(150);
    r.frame(1 / 60);
    expect(r.dts.at(-1)).toBe(0);                           // the seek's frame: no elapsed time, no animation jump
    r.frame(1 / 60);
    expect(r.dts.at(-1)).toBe(2 / 60);
    r.replay.step(1);
    r.frame(1 / 60);
    expect(r.dts.at(-1)).toBe(0);                           // a step: paused there, the jump not run
    r.net.close();
    expect(r.replay.dtScale()).toBe(0);                     // closed: nothing plays
  });

  it('without the factory (every live page) remote.frame gets the frame\'s dt as it did -- the same number, unscaled', () => {
    const dts: number[] = [];
    const { net } = livePage({ remote: remoteOf((dt) => { dts.push(dt); }) }, 'player');
    const camera = new PerspectiveCamera();
    for (const dt of [1 / 60, 0.0123456789, 1 / 30]) net.frame(dt, camera, false);
    expect(dts).toEqual([1 / 60, 0.0123456789, 1 / 30]);
    expect(Object.is(dts[1], 0.0123456789)).toBe(true);
    net.close();
  });
});


describe('WALL-CAM: NetPage carries the live follow callback', () => {
  it('hands the followed replicated body and frame time to the shared rig and resets it on turnover', () => {
    const followed: [SpectatorBody, number][] = []; let resets = 0;
    const r = livePage({ spectateFollow: (b, dt) => { followed.push([b, dt]); }, spectateFollowReset: () => { resets++; } });
    const b = { ...body(3, 0), feet: [0, 0, 3.5] as [number, number, number] };
    vi.spyOn(r.net.client, 'bodies').mockReturnValue([b]);
    r.net.spectator.key({ type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault() {} });
    r.net.spectator.frame(undefined, 1 / 60);
    expect(followed.at(-1)).toEqual([b, 1 / 60]);
    const before = resets; r.net.spectator.reset(); expect(resets).toBe(before + 1);
    r.net.close();
  });
});
