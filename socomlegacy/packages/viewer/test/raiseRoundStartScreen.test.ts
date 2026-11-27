// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { pinnedMatchSocket } from '../src/connectHost';
import { FlyCamera } from '../src/camera';
import { Fire } from '../src/fire';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type MatchFirearmDeps } from '../src/matchFirearm';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { ROUND_SCREENS_AFTER_S, type RoundScreen } from '../src/roundScreens';
import { WalkMode } from '../src/walk';

/**
 * RAISE-1577 part 2 (LATER 1577; IQ-RAISEGATE-r0004, IQ-R1RAISE-PC2 -- captures of r0004, agent-mail
 * `planning/mega-2026-11-21/pilot/movement/FINDING-L1577-raisegate.md` item 2): under the ROUND-START screen
 * ("STARTING ROUND n OF m", the HUD's round banner) R1 held from the body's first frame raises the rifle the next frame
 * and fires -- the original gates neither the raise nor the trigger there. The round-END screens (ROUND COMPLETE,
 * FINAL ROUND, GAME COMPLETE: `NetPage.screenUp`'s three kinds) were not covered by the capture, so their gate stays
 * the port's named reading (`RAISE_GATE_READING`).
 */

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };

function sock(list: Sock[]): Sock {
  const sent: string[] = [];
  const s = { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => undefined } as unknown as Sock;
  list.push(s);
  return s;
}

/** A game's `NetPage` on a fake socket (`test/netPageHeldScreen.test.ts`'s rig): its round screens and banners recorded. */
function roomPage() {
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const screens: (RoundScreen | null)[] = [], banners: number[] = [];
  const sockets: Sock[] = [];
  const hud: NetPageDeps['hud'] = {
    postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: (s) => { screens.push(s); }, startRound: (r) => { banners.push(r.round); },
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
    socket: () => sock(sockets),
    game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => undefined, ended: () => undefined },
  };
  const net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
  sockets.at(-1)!.onopen?.({});
  const camera = new PerspectiveCamera();
  const server = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
  const at = (ms: number): void => {
    t = ms;
    if (net.client.state === 'open') server({ type: 'pong', t, tick: 0 } as ServerEvent);
    net.frame(1 / 60, camera, false);
  };
  return { net, server, at, time: () => t, last: (): RoundScreen | null => screens.at(-1) ?? null, banners };
}

const welcome: ServerEvent = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as ServerEvent;
const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });
const roundOver: ServerEvent = {
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false,
  screens: [{ screen: 'roundComplete', seconds: 5 }],
} as ServerEvent;
const READ_MS = ROUND_SCREENS_AFTER_S * 1000;

/** The match page's firearm (`test/heldTriggerGate.test.ts`'s rig), its round screens the given page's `screenUp`. */
function firearmOn(screenUp: () => boolean) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const net = {
    client: { id: 3, role: 'player', team: 'seal', healthOf: () => null },
    nameOf: (id: number) => `Player${id}`, rows: [], hostages: () => new Map(), gameType: () => null, screenUp,
  };
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud: new Hud(), loadouts: new PlayerLoadout(), view: () => null, map: () => null, body: () => null,
    net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, blocked: () => false, refreshFog: () => {},
  });
  const input = (): { trigger: boolean; gated?: boolean } =>
    (play as unknown as { weaponInput: () => { trigger: boolean; gated?: boolean } }).weaponInput();
  return { firearm, input };
}

describe('RAISE-1577 part 2: the round-start screen gates neither the raise nor the trigger (IQ-RAISEGATE-r0004 item 2)', () => {
  it('the round-start screen ("STARTING ROUND n", the HUD banner) is not one of `screenUp`\'s kinds; the round-end screens are', () => {
    const p = roomPage();
    p.server(welcome); p.server(roundStart(1));
    p.at(p.time() + 16);
    expect(p.banners.at(-1)).toBe(1);                     // "STARTING ROUND 1 OF 11" up
    expect(p.net.screenUp()).toBe(false);                 // ungated, as the original (item 2)
    const t0 = p.time();
    p.server(roundOver);
    p.at(t0 + READ_MS + 1000);
    expect(p.last()).toMatchObject({ kind: 'roundComplete' });
    expect(p.net.screenUp()).toBe(true);                  // a round-end screen: gated (RAISE_GATE_READING, uncaptured)
    p.server(roundStart(2));
    p.at(p.time() + 16);
    expect(p.banners.at(-1)).toBe(2);                     // "STARTING ROUND 2 OF 11"
    expect(p.net.screenUp()).toBe(false);                 // the round-start screen of round 2: ungated
  });

  it('R1 held from the body\'s first frame under the round-start screen: the raise asked up at once and the round fires', () => {
    const p = roomPage();
    p.server(welcome); p.server(roundStart(1));
    p.at(p.time() + 16);
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, input } = firearmOn(() => p.net.screenUp());
    firearm.trigger(true);                                // R1 down on the body's first frame, the banner up
    expect(pull).toHaveBeenCalledTimes(1);                // the trigger not refused
    firearm.kitFrame(GAME_FRAME_DT, true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(firearm.fire.triggerHeld()).toBe(true);
    expect(input().gated).toBe(false);                    // the raise not gated
    expect(input().trigger).toBe(true);
  });

  it('under a round-END screen (ROUND COMPLETE) the gate still holds: the press refused, the raise gated (a named reading)', () => {
    const p = roomPage();
    p.server(welcome); p.server(roundStart(1));
    const t0 = p.time();
    p.server(roundOver);
    p.at(t0 + READ_MS + 1000);
    expect(p.last()).toMatchObject({ kind: 'roundComplete' });
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, input } = firearmOn(() => p.net.screenUp());
    firearm.trigger(true);
    firearm.kitFrame(GAME_FRAME_DT, true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(pull).not.toHaveBeenCalled();
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(input().gated).toBe(true);
    expect(input().trigger).toBe(false);
  });
});
