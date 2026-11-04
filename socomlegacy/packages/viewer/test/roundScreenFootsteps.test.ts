// test/roundScreenFootsteps.test.ts -- OBF-7 (research 115 §8.1, research 114 §1.4): no local footfall, clip callback or
// landing, and no other player's footfall, heard while the round screens are up -- ROUND COMPLETE, FINAL ROUND, GAME
// COMPLETE (the MVP's) and the last screen held until the next round's start (the next round's load). A real `NetPage`
// on a fake socket and the match's sound (`mountSound`) on a silent output; no server is contacted (R293), no browser
// is run.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { GameAudio } from '../src/audio';
import { mountSound, silentOut } from '../src/matchSound';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { PlayEvent } from '../src/play';
import type { RemotePlayers } from '../src/remotePlayers';
import { ROUND_SCREENS_AFTER_S, type RoundScreen } from '../src/roundScreens';
import type { WalkMode } from '../src/walk';

afterEach(() => { vi.restoreAllMocks(); });

const READ_MS = ROUND_SCREENS_AFTER_S * 1000;   // the engine's read before the screens (netPage.ts' ENGINE_READ_S, pinned equal)

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
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  const at = (ms: number): void => {
    t = ms;
    server({ type: 'pong', t, tick: 0 } as ServerEvent);
    net.frame(1 / 60, camera, false);
  };

  const audio = new GameAudio(silentOut(), () => 0.5, { inline: false });
  const sound = mountSound({
    audio,
    walk: { mode: () => 'walk', drawnFeet: () => [1, 2, 3], posture: () => 'stand', grid: () => null },
    fly: { groundWish: () => ({ forward: 1, right: 0, boost: false }) },
    loadouts: { type: () => 1 }, side: () => 'seal',
    screenUp: () => net.screenUp(),                   // as `./main` and `./matchMount` wire it
  });
  const step = vi.spyOn(audio, 'onFootstep'), callback = vi.spyOn(audio, 'onAnimCallback'), land = vi.spyOn(audio, 'onLand');
  /** The body's three kinds of event, as `Play.onEvent` sends them; how many reached the audio. */
  const walkEvents = (): number => {
    const before = step.mock.calls.length + callback.mock.calls.length + land.mock.calls.length;
    for (const e of [
      { kind: 'footfall', foot: 'right', position: [1, 2, 3] },
      { kind: 'callback', name: 'jump_whoosh' },
      { kind: 'land', speed: 4 },
    ] as unknown as PlayEvent[]) sound.playEvent(e);
    return step.mock.calls.length + callback.mock.calls.length + land.mock.calls.length - before;
  };
  /** Another player's footfall (`RemotePlayers`' step hook); whether it reached the audio. */
  const remoteStep = (): boolean => {
    const before = step.mock.calls.length;
    sound.remoteStep(4, { at: [5, 6, 7], stance: 0, stick: 1 } as never, [5, 6, 7]);
    return step.mock.calls.length > before;
  };
  const slide = vi.spyOn(audio, 'setLadderSlide');
  /**
   * The ladder's slide (`TraversalPage`'s sounds, as both pages lend them): a frame of the slide at a place, then its
   * landing. What the audio was told: the slide's last place (null, let go) and whether the landing reached it.
   */
  const ladder = (): { slide: unknown; landed: boolean } => {
    const before = land.mock.calls.length;
    sound.ladderSlide([1, 2, 3]);
    const at = slide.mock.calls.at(-1)?.[0] ?? null;
    sound.ladderLand(6, [1, 2, 3]);
    return { slide: at, landed: land.mock.calls.length > before };
  };
  const welcome = (extra: Record<string, unknown> = {}): void => server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...extra,
  } as ServerEvent);
  welcome();
  return { net, server, at, welcome, time: () => t, last: (): RoundScreen | null => screens.at(-1) ?? null, walkEvents, remoteStep, ladder };
}

const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });
const roundOver = (matchOver: boolean): ServerEvent => ({
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver,
  screens: matchOver ? [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }] : [{ screen: 'roundComplete', seconds: 5 }],
} as ServerEvent);

describe('OBF-7: the local walk silent under the round screens (MPExitState pushed over CoreState)', () => {
  it('ROUND COMPLETE and the next round\'s load: none heard; the round in play and the engine\'s read unchanged; the next round heard again', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    expect(r.walkEvents()).toBe(3);                                       // in the round: the footfall, the callback, the landing
    const t0 = r.time();
    r.server(roundOver(false));
    r.at(t0 + READ_MS - 500);                                             // the engine's 3 s: CoreState still ticks (FUN_002aa490)
    expect(r.net.screenUp()).toBe(false);
    expect(r.walkEvents()).toBe(3);
    r.at(t0 + READ_MS + 1_000);
    expect(r.last()).toMatchObject({ kind: 'roundComplete' });
    expect(r.walkEvents()).toBe(0);                                       // ROUND COMPLETE: nothing
    r.at(t0 + READ_MS + 30_000);                                          // its 5 s run out, held until the room's next round (the load)
    expect(r.last()).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
    expect(r.walkEvents()).toBe(0);
    r.server(roundStart(2));
    r.at(r.time() + 16);
    expect(r.net.screenUp()).toBe(false);
    expect(r.walkEvents()).toBe(3);                                       // the next round: heard as before
  });

  it('FINAL ROUND and GAME COMPLETE (the MVP\'s screen), and GAME COMPLETE held: none heard', () => {
    const r = rig();
    r.server(roundStart(1));
    const t0 = r.time();
    r.server(roundOver(true));
    r.at(t0 + READ_MS + 5_000);
    expect(r.last()).toMatchObject({ kind: 'finalRound' });
    expect(r.walkEvents()).toBe(0);
    r.at(t0 + READ_MS + 15_000);
    expect(r.last()).toMatchObject({ kind: 'gameComplete' });
    expect(r.walkEvents()).toBe(0);
    r.at(t0 + READ_MS + 60_000);
    expect(r.last()).toMatchObject({ kind: 'gameComplete', secondsLeft: 0 });
    expect(r.walkEvents()).toBe(0);
  });

  it("another player's footfall: heard in the round and through the engine's 3 s, none under the screens, heard again next round", () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    expect(r.remoteStep()).toBe(true);
    const t0 = r.time();
    r.server(roundOver(true));
    r.at(t0 + READ_MS - 500);                                             // the engine's 3 s: CoreState still ticks
    expect(r.remoteStep()).toBe(true);
    for (const ms of [1_000, 15_000, 60_000]) {                           // FINAL ROUND, GAME COMPLETE, GAME COMPLETE held
      r.at(t0 + READ_MS + ms);
      expect(r.net.screenUp()).toBe(true);
      expect(r.remoteStep()).toBe(false);
    }
    r.server(roundStart(2));
    r.at(r.time() + 16);
    expect(r.remoteStep()).toBe(true);
  });

  it('the ladder\'s slide and its landing: heard in the round and the engine\'s 3 s, let go and silent under ROUND COMPLETE', () => {
    const r = rig();
    r.server(roundStart(1));
    r.at(r.time() + 16);
    expect(r.ladder()).toEqual({ slide: [1, 2, 3], landed: true });
    const t0 = r.time();
    r.server(roundOver(false));
    r.at(t0 + READ_MS - 500);
    expect(r.ladder()).toEqual({ slide: [1, 2, 3], landed: true });
    r.at(t0 + READ_MS + 1_000);
    expect(r.last()).toMatchObject({ kind: 'roundComplete' });
    expect(r.ladder()).toEqual({ slide: null, landed: false });        // the loop let go, no landing
    r.server(roundStart(2));
    r.at(r.time() + 16);
    expect(r.ladder()).toEqual({ slide: [1, 2, 3], landed: true });
  });

  it('a rejoin\'s welcome with no standing result clears the old round\'s screens: the footfalls heard again', () => {
    const r = rig();
    r.server(roundStart(1));
    const t0 = r.time();
    r.server(roundOver(false));
    r.at(t0 + READ_MS + 1_000);
    expect(r.net.screenUp()).toBe(true);                                 // dropped under ROUND COMPLETE ...
    r.welcome({ round: 2, tick: 60 * 30, join: { v: 1, projectiles: [], corpses: [], ghosts: [] } });   // ... back in round 2: no result
    r.at(r.time() + 16);
    expect(r.net.screenUp()).toBe(false);
    expect(r.walkEvents()).toBe(3);
    expect(r.remoteStep()).toBe(true);
  });

  it('a rejoin\'s welcome with a standing result keeps the screens (the room\'s, as before)', () => {
    const r = rig();
    r.server(roundStart(1));
    r.welcome({ tick: 30 * 5, join: { v: 1, result: { ...(roundOver(false) as object), at: 0 }, projectiles: [], corpses: [], ghosts: [] } });
    r.at(r.time() + READ_MS + 1_000);
    expect(r.net.screenUp()).toBe(true);
    expect(r.walkEvents()).toBe(0);
  });

  it("both pages wire the page's round screens into the match's sound (`./main`, `./matchMount`)", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f)).toContain('screenUp: () => net?.screenUp() ?? false,');
      expect(src(f)).toMatch(/slide: \(at\) => \{ sound\.ladderSlide\(at\); \}/);   // the ladder's slide and landing through the gate
      expect(src(f)).toMatch(/land: \(speed, at\) => \{ sound\.ladderLand\(speed, at\); \}/);
    }
  });
});
