// @vitest-environment jsdom
// test/roundScreenSilence.test.ts -- OBF-31 (`ROUND_SCREENS_STOP_ALL_READING`; research 122 §8, LATER 580): at the round
// screens' start the original stops every sound once (`FUN_002aa910` -> `FUN_00346b30` SL_STOPALLSOUNDS, `FUN_00344f80`
// the stream system, D:L151220-151222) and, MPExitState alone ticked (`FUN_002ce9e0` D:L171877-171888), starts none of
// the world's until the next round: no shot, reload or dry click of the page's own trigger, no throw or rocket, no
// other's round, effect, voice or ring. Through the engine's 3 s every one plays as before; a round's start hears again.
// A real `NetPage` on a fake socket, the match's sound (`mountSound`) on a silent output, the firearm and the
// throwables on fakes; no server is contacted (R293), no browser is run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { GameAudio } from '../src/audio';
import { FlyCamera } from '../src/camera';
import type { Fire, FireEvent, FireSource } from '../src/fire';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type FirearmHands, type MatchFirearmDeps } from '../src/matchFirearm';
import { mountSound, ROUND_SCREENS_STOP_ALL_READING, silentOut } from '../src/matchSound';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { ROUND_SCREENS_AFTER_S, type RoundScreen } from '../src/roundScreens';
import { WalkMode } from '../src/walk';
import { WeaponRaise } from '../src/weaponRaise';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noInput, type PadButton } from '../src/gamepad';
import { mountTaunts, type MatchTauntsDeps } from '../src/matchTaunts';
import type { SoundData } from '../src/soundData';
import type { TauntData } from '../src/tauntData';

afterEach(() => { vi.restoreAllMocks(); });

const READ_MS = ROUND_SCREENS_AFTER_S * 1000;   // the engine's read before the screens (netPage.ts' ENGINE_READ_S, pinned equal)

const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });
const roundOver = (matchOver: boolean): ServerEvent => ({
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver,
  screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
} as ServerEvent);

const ROUND: Extract<FireEvent, { type: 'round' }> = {
  type: 'round', weapon: { name: 'M4A1' } as never, from: [1, 2, 3], to: [4, 5, 6], hit: false, rounds: 29, normal: null, material: null,
};

/** A player's page on a fake socket, its clock the test's, and the match's sound wired to it as both pages wire it. */
function rig() {
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  let socket: WebSocketLike | null = null;
  const screens: (RoundScreen | null)[] = [];
  const hud: NetPageDeps['hud'] = {
    postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: (s) => { screens.push(s); }, startRound: () => undefined,
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [],
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
    setDead: () => undefined, feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  let net: NetPage | null = null;
  const audio = new GameAudio(silentOut(), () => 0.5, { inline: false });
  const sound = mountSound({
    audio,
    walk: { mode: () => 'walk', drawnFeet: () => [1, 2, 3], posture: () => 'stand', grid: () => null },
    fly: { groundWish: () => ({ forward: 1, right: 0, boost: false }) },
    loadouts: { type: () => 1 }, side: () => 'seal',
    seat: () => ({ id: 1, role: 'player', team: 'seal' }),
    others: () => ({ teamOf: () => 'seal', playerType: () => 1, feet: () => [5, 6, 7] }) as never,
    screenUp: () => net?.screenUp() ?? false,          // as `./main` and `./matchMount` wire it
  });
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
    ...sound.netDeps(),                                // the sound's hooks, as both pages spread them
  };
  net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  /** A page frame at `ms`: the page's, then the sound's (both pages' order). */
  const at = (ms: number): void => {
    t = ms;
    server({ type: 'pong', t, tick: 0 } as ServerEvent);
    net!.frame(1 / 60, camera, false);
    sound.frame(camera);
  };
  const stops = vi.spyOn(audio, 'stopTransient'), music = vi.spyOn(audio, 'stopMusic');
  const heard = [
    vi.spyOn(audio, 'onFire'), vi.spyOn(audio, 'onReload'), vi.spyOn(audio, 'play'), vi.spyOn(audio, 'playStream'),
    vi.spyOn(audio, 'onDeath'), vi.spyOn(audio, 'onHurt'), vi.spyOn(audio, 'onReloadAfterShot'),
  ];
  const ring = vi.spyOn(sound.ears, 'start');
  /**
   * Every world sound the page can start, once each: its own round, reload, dry click and bolt (`FirearmSound.fireEvent`),
   * an effect, the goggles, another's round (`roundFired`), another's reload, a death's and a hurt voice, a hostage's
   * YES, a ring, a teammate's grenade warning. How many reached the audio (or the ears).
   */
  const everything = (): number => {
    const before = heard.reduce((a, s) => a + s.mock.calls.length, 0) + ring.mock.calls.length;
    sound.firearm.fireEvent(ROUND);
    sound.firearm.fireEvent({ type: 'reloadStart', weapon: { name: 'M4A1' } } as FireEvent);
    sound.firearm.fireEvent({ type: 'dry', weapon: { name: 'M4A1' } } as FireEvent);
    sound.firearm.fireEvent({ type: 'afterShot', weapon: { name: 'M4A1' } } as FireEvent);
    sound.firearm.effect('.GUN_SHELL', [1, 2, 3], 1);
    sound.firearm.goggles(true);
    sound.firearm.roundFired(ROUND);
    const n = sound.netDeps();
    n.reloadSound({ name: 'M4A1' } as never, [1, 2, 3]);
    n.deathVoice('shot' as never, 'seal', 1, [1, 2, 3]);
    n.hurtVoice('seal', 1, [1, 2, 3]);
    n.escorteeVoice(9, 'yes', [1, 2, 3]);
    n.ring(2, 1);
    sound.grenadeWarning({ id: 121, owner: 2, from: [1, 2, 3] });
    return heard.reduce((a, s) => a + s.mock.calls.length, 0) + ring.mock.calls.length - before;
  };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  const played = vi.mocked(audio.play);
  return { net: net!, server, at, time: () => t, last: (): RoundScreen | null => screens.at(-1) ?? null, everything, stops, music, sound, played };
}

describe('OBF-31: the match\'s sound under the round screens (ROUND_SCREENS_STOP_ALL_READING)', () => {
  it('is the reading named', () => {
    expect(ROUND_SCREENS_STOP_ALL_READING).toBe('once at the screens');
  });

  it('ROUND COMPLETE: every world sound heard in the round and the engine\'s 3 s, none under the screen, all again next round', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    const live = r.everything();
    expect(live).toBeGreaterThan(0);
    const t0 = r.time();
    r.server(roundOver(false));
    r.at(t0 + READ_MS - 500);                                             // the engine's 3 s: CoreState still ticks
    expect(r.net.screenUp()).toBe(false);
    expect(r.everything()).toBe(live);
    r.at(t0 + READ_MS + 1_000);
    expect(r.last()).toMatchObject({ kind: 'roundComplete' });
    expect(r.everything()).toBe(0);                                       // ROUND COMPLETE: nothing starts
    r.at(t0 + READ_MS + 30_000);                                          // held until the room's next round
    expect(r.everything()).toBe(0);
    r.server(roundStart(2));
    r.at(r.time() + 16);
    expect(r.net.screenUp()).toBe(false);
    expect(r.everything()).toBe(live);                                    // the next round: heard as before
  });

  it('FINAL ROUND and GAME COMPLETE (and GAME COMPLETE held): none heard', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    const t0 = r.time();
    r.server(roundOver(true));
    for (const [ms, kind] of [[5_000, 'finalRound'], [15_000, 'gameComplete'], [60_000, 'gameComplete']] as const) {
      r.at(t0 + READ_MS + ms);
      expect(r.last()).toMatchObject({ kind });
      expect(r.everything()).toBe(0);
    }
  });

  it('every sound stopped once, at the screens\' first frame -- the voices (stopTransient) and the music slot -- not in the 3 s before', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    const t0 = r.time();
    r.server(roundOver(true));
    const stops0 = r.stops.mock.calls.length, music0 = r.music.mock.calls.length;
    for (let ms = 0; ms < READ_MS; ms += 250) r.at(t0 + ms);              // the engine's 3 s, frame by frame
    expect(r.net.screenUp()).toBe(false);
    expect(r.stops.mock.calls.length).toBe(stops0);                       // nothing stopped before the screens
    for (let ms = READ_MS; ms < READ_MS + 40_000; ms += 250) r.at(t0 + ms);   // FINAL ROUND, GAME COMPLETE, held
    expect(r.net.screenUp()).toBe(true);
    expect(r.stops.mock.calls.length - stops0).toBe(1);                    // once, at the first screen
    expect(r.music.mock.calls.length - music0).toBeGreaterThanOrEqual(1);  // the stream system stopped (FUN_00344f80)
  });
});

/** The firearm on fakes (`matchFirearm.test.ts`'s rig), its page's round screens `up`. */
function firearmRig(up: { v: boolean }, over: Partial<FirearmHands> = {}, play = new Play()) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const hands: FirearmHands = {
    launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
    putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
    mounted: () => false, ...over,
  };
  const deps: MatchFirearmDeps = {
    scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => ({ screenUp: () => up.v }) as never,
    blocked: () => false, refreshFog: () => {}, hands,
  };
  const firearm = mountFirearm(deps);
  const source = (firearm.fire as unknown as { source: FireSource }).source;
  return { firearm, hands, source, fire: firearm.fire as Fire };
}

describe('OBF-31: the page\'s own trigger is not ticked under the round screens', () => {
  it('a press under a screen reaches neither the hands (the throwables, the launcher) nor the firearm\'s pull', () => {
    const up = { v: false };
    const handsTrigger = vi.fn(() => false);
    const r = firearmRig(up, { trigger: handsTrigger });
    const pull = vi.spyOn(r.fire, 'pull').mockReturnValue(null);
    r.firearm.trigger(true); r.firearm.trigger(false);
    expect(handsTrigger).toHaveBeenCalledTimes(2);
    expect(pull).toHaveBeenCalledTimes(1);                                 // in the round: the press goes through
    up.v = true;
    r.firearm.trigger(true); r.firearm.trigger(false);
    expect(handsTrigger).toHaveBeenCalledTimes(2);                         // under the screens: nothing more
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it('the fire\'s own gates refuse a round and a reload under a screen (a held pull, a reload asked from before), and pass again after', () => {
    const up = { v: false };
    const r = firearmRig(up);
    const readyBefore = r.source.ready?.() ?? true;
    up.v = true;
    // `ready` false: no round leaves (`tryFire`, a held trigger's next), no reload begins nor lands (`reload`, `beginReload`)
    expect(r.source.ready?.()).toBe(false);
    expect(r.fire.reload()).toBe(false);
    up.v = false;
    expect(r.source.ready?.() ?? true).toBe(readyBefore);
  });

  it('a trigger held into the screens is let go at the frame (no dry click asked on a held pull)', () => {
    const up = { v: false };
    const r = firearmRig(up);
    vi.spyOn(r.fire, 'triggerHeld').mockReturnValue(true);
    const release = vi.spyOn(r.fire, 'release');
    vi.spyOn(r.fire, 'update').mockImplementation(() => 0);
    r.firearm.fireFrame(1 / 60, true);
    expect(release).not.toHaveBeenCalled();
    up.v = true;
    r.firearm.fireFrame(1 / 60, true);
    expect(release).toHaveBeenCalled();
  });
});

/** The throwables on fakes (`matchThrow.test.ts`'s rig): a LAW up, its pulls counted; the page's round screens `up`. */
function throwRig(up: { v: boolean }, weight = { v: 1 }) {
  const raise = new WeaponRaise();
  const asked: string[] = [];
  let itemRaise: (() => { trigger: boolean }) | null = null;
  const net = { throwEvent: () => {}, client: { bodies: () => [] }, screenUp: () => up.v };
  const firearm = {
    shotRumble: () => {},
    fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 1 },
    kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {}, item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}],
    icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    effects: { play: () => false },
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(),
    walk: {
      grid: () => null, snapshot: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
      hold: () => {}, mode: () => 'walk', isDead: () => false, swapGate: () => true, onActionEnd: () => () => {},
      launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
      fireAllowed: () => true,
    } as never,
    fly: { shakeScreen: () => {} },
    play: {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => {}, setItemRaise: (read: () => { trigger: boolean }) => { itemRaise = read; },   // OBF-31b: the raise's feed read
      weaponStats: () => ({ raise: { ...raise.stats(), weight: weight.v } }),
    } as never,
    loadouts: new PlayerLoadout(),
    view: () => null, map: () => null,
    net: () => net as never,
    firearm: () => firearm as never,
    audio: {
      onAnimCallback: (n: string) => { asked.push(`anim ${n}`); return null; },
      onFire: (n: string) => { asked.push(`fire ${n}`); return null; },
      play: (n: string) => { asked.push(`play ${n}`); },
    } as never,
  };
  const t = mountThrowables(deps);
  (t.rocket as unknown as { held_: number | null }).held_ = 145;                         // a LAW up
  const pulls: number[] = [];
  vi.spyOn(t.rocket, 'pull').mockImplementation(() => { pulls.push(1); return null; });
  return { t, hands: t.hands(), pulls, asked, raiseTrigger: (): boolean => itemRaise?.().trigger ?? false };
}

describe('OBF-31: no throw nor rocket, and no throwable\'s sound, under the round screens', () => {
  it('a launcher press under a screen asks no rocket; in the round it does', () => {
    const up = { v: false };
    const a = throwRig(up);
    a.hands.trigger(true);
    a.t.frame(1 / 60);
    expect(a.pulls.length).toBe(1);                                         // in the round: the rocket at the press
    const b = throwRig({ v: true });
    b.hands.trigger(true);
    for (let i = 0; i < 20; i++) b.t.frame(1 / 60);
    expect(b.pulls.length).toBe(0);                                         // under the screens: none, held or not
  });

  it('a rocket waiting on the raise when a screen comes up is not asked under it -- nor once the next round starts', () => {
    const up = { v: false }, weight = { v: 0 };
    const r = throwRig(up, weight);
    r.hands.trigger(true);                                                  // pressed in the round, the raise refusing:
    r.t.frame(1 / 60);                                                      // the pull waits (LATER 192's `launcherWaits`)
    expect(r.pulls.length).toBe(0);
    up.v = true;                                                            // the screens come up, the trigger still held
    weight.v = 1;                                                           // the raise reads up
    for (let i = 0; i < 10; i++) r.t.frame(1 / 60);
    expect(r.pulls.length).toBe(0);                                         // not ticked: no rocket under the screen
    up.v = false;                                                           // the next round, never pressed again
    for (let i = 0; i < 10; i++) r.t.frame(1 / 60);
    expect(r.pulls.length).toBe(0);
  });

  it('the throwables\' sounds -- a launch\'s report and trail -- none under a screen', () => {
    const up = { v: true };
    const r = throwRig(up);
    (r.t.rocket as unknown as { emit(k: string, e: unknown): void }).emit('launch', {
      launcher: 145, round: { id: 185, name: 'LAW HEAT' }, record: { id: 185, name: 'LAW HEAT', fireAnim: 'law_trail', rumble: null },
      from: [1, 2, 3], dir: [0, 0, -1], velocity: [0, 0, -200], to: [1, 2, -100], rounds: 0,
    });
    expect(r.asked).toEqual([]);
    up.v = false;
    (r.t.rocket as unknown as { emit(k: string, e: unknown): void }).emit('launch', {
      launcher: 145, round: { id: 185, name: 'LAW HEAT' }, record: { id: 185, name: 'LAW HEAT', fireAnim: 'law_trail', rumble: null },
      from: [1, 2, 3], dir: [0, 0, -1], velocity: [0, 0, -200], to: [1, 2, -100], rounds: 0,
    });
    expect(r.asked).toContain('anim law_trail');
  });
});

describe("OBF-31 (the review's F1): a scene program's sound under the round screens", () => {
  it('a SOUND op through `sceneSound`: heard in the round and the 3 s, none under ROUND COMPLETE, heard again next round', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    const heard = (): boolean => { const n = r.played.mock.calls.length; r.sound.sceneSound('.GLASS_BREAK', [1, 2, 3], 1); return r.played.mock.calls.length > n; };
    expect(heard()).toBe(true);
    const t0 = r.time();
    r.server(roundOver(false));
    r.at(t0 + READ_MS - 500);
    expect(heard()).toBe(true);
    r.at(t0 + READ_MS + 1_000);
    expect(r.last()).toMatchObject({ kind: 'roundComplete' });
    expect(heard()).toBe(false);
    r.server(roundStart(2));
    r.at(r.time() + 16);
    expect(heard()).toBe(true);
  });

  it("both pages wire the scene programs' sound through the gate (`./main`, `./matchMount`)", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    // The world's hook hands the place it read (SCENE_SOUND_PLACE_READING) on to the gated `sceneSound`, on both pages:
    // `./main` directly, `./matchMount` through `./matchWorld`'s `buildPageWorld`.
    expect(src('main.ts')).toMatch(/sound: \(name, _path, volume, at\) => \{ sound\.sceneSound\(name, at, volume\); \}/);
    expect(src('matchMount.ts')).toMatch(/sound: \(name, at, volume\) => \{ sound\.sceneSound\(name, at, volume\); \}/);
    expect(src('matchWorld.ts')).toMatch(/sound: \(name, _path, volume, at\) => \{ hooks\.sound\(name, at, volume\); \}/);
  });
});

const TAUNT_DATA = {
  defaults: ['A', 'B', 'C', 'D', 'E'], captions: {},
  vocals: { seal: [Array.from({ length: 7 }, (_, n) => ({ sound: `^PS_000${n}`, text: `%s TAUNT ${n}`, character: 'mp_seal1' }))], terrorist: [] },
} as unknown as TauntData;

/** The taunts part on fakes (`matchTaunts.test.ts`'s rig), its page's round screens `up`. */
function tauntRig(up: { v: boolean }) {
  let now = 0;
  const sent: unknown[] = [], streams: string[] = [];
  const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false };
  const net = { client: { id: 2, send: (e: unknown) => { sent.push(e); } }, gate: () => gate, isBot: () => false, screenUp: () => up.v };
  const deps: MatchTauntsDeps = {
    net: () => net as never,
    hud: { postMessage: () => {} },
    audio: { play: () => true as never, playStream: (name) => { streams.push(name); return 'played'; } },
    custom: () => ['ONE', 'TWO', 'THREE', null, null],
    otherMenu: () => false, release: () => {}, clock: () => now,
  };
  const t = mountTaunts(deps);
  t.setData({ taunts: TAUNT_DATA } as unknown as SoundData);
  const frame = (held: PadButton[], dt = 0.05) => { now += dt; return t.pad(new Set(held), noInput()); };
  const tap = (b: PadButton) => { frame([b], 0.25); frame([], 0.05); };
  /** Circle, TAUNTS, CUSTOM TAUNT 03 (`matchTaunts.test.ts`'s path). */
  const sendThree = (): void => { tap('Circle'); tap('Down'); tap('Cross'); for (let i = 0; i < 3; i++) tap('Down'); tap('Cross'); };
  let request = 0;
  const receive = (sender: number): void => {
    t.netDeps().taunt({ type: 'taunt', sender, name: 'kilo', team: 'seal', char: 0, request: ++request, vocal: 1, text: null, at: [10, 0, 0] } as never);
  };
  return { t, sent, streams, sendThree, receive };
}

describe("OBF-31 (the review's F1): the taunts under the round screens", () => {
  it("a taunt received -- another's at its body, the sender's own echo -- plays no vocal under a screen; after it, both play", () => {
    const up = { v: true };
    const r = tauntRig(up);
    r.receive(3); r.receive(2);
    expect(r.streams).toEqual([]);
    up.v = false;                                                           // the next round's start
    r.receive(3); r.receive(2);
    expect(r.streams).toEqual(['^PS_0001', '^PS_0001']);
  });

  it('the menu sends nothing under a screen; after it the same path sends', () => {
    const up = { v: true };
    const r = tauntRig(up);
    r.sendThree();
    expect(r.sent).toEqual([]);
    expect(r.t.isOpen()).toBe(false);
    up.v = false;
    r.sendThree();
    expect(r.sent).toEqual([{ type: 'taunt', kind: 'custom', slot: 2, text: 'THREE', request: 1 }]);
  });
});

describe("OBF-31 (the review's N3): a grenade's pin pulled in the 3 s is let go at the screens' start, no throw", () => {
  it('cancelMenuHold once at the first screen frame, not before', () => {
    const up = { v: false };
    const r = throwRig(up);
    const cancel = vi.spyOn(r.t.grenade, 'cancelMenuHold');
    for (let i = 0; i < 3; i++) r.t.frame(1 / 60);
    expect(cancel).not.toHaveBeenCalled();
    up.v = true;
    for (let i = 0; i < 5; i++) r.t.frame(1 / 60);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

// OBF-31b (research 122 §14; reading, pending review): every latch the hands' trigger holds -- the turret's (`./matchActions`,
// its test there), the firearm's mounted raise feed, the launcher's and a placing's raise feeds -- is let go at the screens'
// start as its own release lets it go: the firearm's and the throwables' trigger swallow the let-go there (OBF-31), so a
// trigger held into the screens heard none. A held grenade keeps N3's rule (`cancelMenuHold` once, no throw).
describe("OBF-31b: a trigger held into the round screens is let go as a release lets it go", () => {
  it('mounted: the raise\'s trigger (the turret\'s, `mountedTrigger`) let go at the first screen frame; nothing held at the next round', () => {
    const up = { v: false };
    const play = new Play();
    const r = firearmRig(up, { trigger: () => true, mounted: () => true }, play);
    const input = (): boolean => (play as unknown as { weaponInput(): { trigger: boolean } }).weaponInput().trigger;
    r.firearm.trigger(true);                                               // the turret's press, mounted
    r.firearm.fireFrame(1 / 60, true);
    expect(input()).toBe(true);
    up.v = true;                                                           // the button still down; no edge heard
    r.firearm.fireFrame(1 / 60, true);
    expect(input()).toBe(false);
    up.v = false;                                                          // the next round, never pressed again
    r.firearm.fireFrame(1 / 60, true);
    expect(input()).toBe(false);
  });

  it("the launcher's held trigger: the raise's feed let go at the first screen frame, no rocket; a new press next round raises and fires", () => {
    const up = { v: false };
    const r = throwRig(up);
    r.hands.trigger(true);
    r.t.frame(1 / 60);
    expect([r.pulls.length, r.raiseTrigger()]).toEqual([1, true]);
    up.v = true;
    r.t.frame(1 / 60);
    expect(r.raiseTrigger()).toBe(false);
    up.v = false;
    for (let i = 0; i < 5; i++) r.t.frame(1 / 60);
    expect([r.pulls.length, r.raiseTrigger()]).toEqual([1, false]);
    r.hands.trigger(false); r.hands.trigger(true);                         // let go and pressed again in the round
    r.t.frame(1 / 60);
    expect([r.pulls.length, r.raiseTrigger()]).toEqual([2, true]);
  });

  it("a placing's held trigger (a Claymore up): the raise's feed let go at the first screen frame, no release asked (N3's rule: the hold cancelled)", () => {
    const up = { v: false };
    const r = throwRig(up);
    (r.t.rocket as unknown as { held_: number | null }).held_ = null;     // no launcher: the hand's item's trigger
    vi.spyOn(r.t.grenade, 'equipped').mockReturnValue(true);
    vi.spyOn(r.t.grenade, 'held').mockReturnValue('Claymore');
    vi.spyOn(r.t.grenade, 'pull').mockImplementation(() => {});
    const release = vi.spyOn(r.t.grenade, 'release').mockImplementation(() => {});
    const cancel = vi.spyOn(r.t.grenade, 'cancelMenuHold');
    r.hands.trigger(true);
    r.t.frame(1 / 60);
    expect(r.raiseTrigger()).toBe(true);
    up.v = true;
    r.t.frame(1 / 60);
    expect(r.raiseTrigger()).toBe(false);
    expect(release).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
