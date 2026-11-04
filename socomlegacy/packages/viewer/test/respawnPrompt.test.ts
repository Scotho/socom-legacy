// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { controllerConfigs } from '../src/controllerConfigs';
import { Hud, spectatorHudView } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountExchange } from '../src/matchExchange';
import { mountTouch, TOUCH_LAYER_MARKUP } from '../src/matchTouch';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import { RESPAWN_FADE_S, RESPAWN_PROMPT_S } from '../src/net/deaths';
import { RESPAWN_FADE_S as ROOM_FADE_S, RESPAWN_PRESS_S as ROOM_PRESS_S } from '../../match/src/room';
import type { Rules, ServerEvent } from '../src/net/protocol';
import { TICK_HZ } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { respawnPrompt } from '../src/respawnPrompt';
import type { InputDevice } from '../src/weaponSelect';

/** RSP-6: socket event -> shared page state -> shared spectator view -> real HUD, without a browser or room. */
function page(rules: Rules = 'respawn', extra: Partial<NetPageDeps> = {}) {
  let socket: WebSocketLike | null = null, dead = false, corpseExpired = false, device: InputDevice = 'pad', last = 0;
  const hud = new Hud();
  hud.setVisible(true);
  const deathPoses: unknown[] = [], killers: unknown[] = [];
  let queued = 0;
  const walk = {
    setNetTap: () => {}, setLocked: () => {}, respawn: () => true, nudge: () => {},
    setTrigger: () => {}, setDead: (on: boolean) => { dead = on; },
    setDeathPose: (pose: unknown) => { deathPoses.push(pose); if (pose !== null) dead = true; },
    setDeathKiller: (killer: unknown) => { killers.push(killer); }, mode: () => 'walk', isDead: () => dead,
    queueRespawnAction: () => { queued++; return true; },
  } as unknown as WalkMode;
  const remote = {
    setTeam: () => {}, forget: () => {}, died: () => {}, clear: () => {}, frame: () => {},
  } as unknown as RemotePlayers;
  const net = new NetPage({
    walk, remote, hud, clips: () => null, remoteGrenade: () => {}, spectate: () => {}, respawned: () => {},
    ownCorpseExpired: () => corpseExpired,
    roundEffects: () => {}, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => {}, close: () => {} } as unknown as WebSocketLike;
      return socket;
    },
    ...extra,
  }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules, round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  });
  const die = (): void => {
    corpseExpired = false;
    server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' });
  };
  const spawn = (): void => { corpseExpired = false; server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 }); };
  const frame = (at: number): void => {
    vi.mocked(performance.now).mockReturnValue(at);
    // NET-RES-2d (NET-RES.R9): a live room speaks every tick (a snapshot each 33 ms, a pong each 2 s), so the fake
    // one speaks before each frame -- the link watch's 10 s bound kept.
    if (net.client.state === 'open') server({ type: 'pong', t: at, tick: 0 } as ServerEvent);
    net.frame(0, {} as never, false);
    hud.setSpectator(spectatorHudView(net, walk, undefined, device));
    hud.step((at - last) / 1000);
    last = at;
  };
  const prompts = (): string[] => hud.postsForDev().map((p) => p.text).filter((text) => text.includes('respawn'));
  const view = () => hud.state().model.spectator;
  /** The room's snapshot at its tick `tick` (no bodies): the room's clock as this page hears it. */
  const snapshot = (tick: number): void => { socket!.onmessage?.({ data: encodeSnapshot({ tick, own: null, bodies: [] }) } as unknown as MessageEvent); };
  return { net, walk, hud, server, die, spawn, frame, snapshot, prompts, view, deathPoses, killers, queued: () => queued,
    expireCorpse: () => { corpseExpired = true; }, device: (value: InputDevice) => { device = value; } };
}

beforeEach(() => {
  controllerConfigs.reset();
  vi.spyOn(performance, 'now').mockReturnValue(0);
});
afterEach(() => { vi.restoreAllMocks(); controllerConfigs.reset(); document.body.replaceChildren(); });

describe('respawn help (research 351)', () => {
  const CROSS = String.fromCharCode(166), CIRCLE = String.fromCharCode(183);
  const R2 = String.fromCharCode(190), R1 = String.fromCharCode(189);

  it('a late respawn load enters dead with no corpse pose or killer, then gets help and Action after five seconds (research 322 §5.3)', () => {
    const p = page();
    try {
      p.frame(20000); // The round was already running before this console loaded.
      p.server({ type: 'deadAtLoad', id: 1 } as ServerEvent);
      p.frame(20000);
      expect(p.walk.isDead()).toBe(true);
      expect(p.net.gate()).toMatchObject({ alive: false });
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 0, respawnReady: false });
      expect(p.net.respawnInputActive()).toBe(true);
      expect(p.net.ghost(), 'the existing render seam hides its zero-alpha body').toBe(true);
      expect(p.net.pressRespawn()).toBe(false);
      expect(p.deathPoses.every((pose) => pose === null), 'no corpse death pose').toBe(true);
      expect(p.killers.every((killer) => killer === null), 'no killer camera').toBe(true);
      p.frame(25000);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      expect(p.net.pressRespawn()).toBe(false);
      p.frame(25001);
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 5.001, respawnReady: true });
      expect(p.view()?.help?.[1]).toBe(`Press the ${CROSS} button to respawn.`);
      expect(p.net.pressRespawn()).toBe(true);
      expect(p.queued()).toBe(1);
      expect(p.hud.postsForDev().some((post) => /fragged|suicide|falls to/.test(post.text))).toBe(false);
      p.spawn(); p.frame(25016);
      expect(p.walk.isDead()).toBe(false);
      expect(p.net.ghost()).toBe(false);
      expect(p.net.prompt()).toBeNull();
      p.die(); p.frame(31017); // Ordinary death still needs its actual corpse expiry.
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
    } finally { p.net.close(); }
  });

  // B138 (BTL.R8's run 1: ready, one Cross, no spawn for 15 s): the room takes the press by its own ticks since the death
  // (`room.ts` `respawnReady`) and its loop drops a stall's ticks (`server.ts` `loop`), so a loaded room's 5 s outlast the
  // page's. The original's prompt and press are one controller on one clock (`FUN_00592560` D:L451699-451724): the page's
  // ready also waits for the room's ticks as heard (`NetClient.roomSecondsDead`), never ahead of the room.
  it('B138: a load death on a lagging room -- the page\'s 5 s alone never show ready before the room\'s 5 s as heard', () => {
    const p = page();
    try {
      p.snapshot(1000);
      p.server({ type: 'deadAtLoad', id: 1 } as ServerEvent);
      p.frame(6000);                                                   // six of the page's seconds ...
      p.snapshot(1000 + 3 * TICK_HZ);                                  // ... three of the room's (its loop dropped a stall's ticks)
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      expect(p.net.pressRespawn()).toBe(false);
      p.snapshot(1000 + RESPAWN_PROMPT_S * TICK_HZ);                   // the room's own gate is strict (> 5 s)
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      p.snapshot(1000 + RESPAWN_PROMPT_S * TICK_HZ + 1);
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
      expect(p.net.pressRespawn()).toBe(true);
    } finally { p.net.close(); }
  });

  it('B138: an ordinary death on a lagging room -- the corpse gone on the page, still unready until the room\'s 10 s as heard', () => {
    const p = page();
    try {
      p.snapshot(500);
      p.die();
      p.expireCorpse();
      p.frame(12000);
      p.snapshot(500 + 6 * TICK_HZ);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      p.snapshot(500 + RESPAWN_FADE_S * TICK_HZ);                      // the room's: max(5, 10) s, not strict
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
    } finally { p.net.close(); }
  });

  it("B138: the page's two gates are the room's numbers (`room.ts` RESPAWN_PRESS_S, RESPAWN_FADE_S)", () => {
    expect([RESPAWN_PROMPT_S, RESPAWN_FADE_S]).toEqual([ROOM_PRESS_S, ROOM_FADE_S]);
  });

  it('the launch hold round-start retells the same load death age, without restarting its prompt/input wait', () => {
    const p = page();
    try {
      p.server({ type: 'deadAtLoad', id: 1 });
      p.frame(4000);
      p.server({ type: 'roundStart', round: 1, rounds: 1, seconds: 120, wins: { seal: 0, terrorist: 0 }, epoch: 1, startTick: 0 });
      p.server({ type: 'deadAtLoad', id: 1, age: 4 * TICK_HZ });
      p.frame(5001);
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 5.001, respawnReady: true });
      expect(p.net.pressRespawn()).toBe(true);
    } finally { p.net.close(); }
  });

  it.each(['Default', 'Reverse', 'Config4'] as const)('%s draws the Action Cross from the original special font', (config) => {
    controllerConfigs.select(config);
    expect(respawnPrompt()).toBe(`Press the ${CROSS} button to respawn.`);
  });

  it('Goldeneye draws Circle as Action; keyboard and touch retain their explicit browser controls', () => {
    controllerConfigs.select('Goldeneye');
    expect(respawnPrompt()).toBe(`Press the ${CIRCLE} button to respawn.`);
    expect(respawnPrompt('keyboard')).toBe('Press the [X] button to respawn.');
    expect(respawnPrompt('touch')).toBe('Press the Circle button to respawn.');
    controllerConfigs.select('Default');
    expect(respawnPrompt('touch')).toBe('Press the X button to respawn.');
  });

  it('death writes only its Inventory line and blanks the other five widgets before eligibility', () => {
    const p = page();
    try {
      p.die(); p.frame(0);
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 0, respawnReady: false });
      expect(p.view()?.help).toEqual([`You have died.  ${R2} Select new weapons.`, ' ', ' ', ' ', ' ', ' ']);
      p.frame(5000);
      expect(p.view()?.help?.[1]).toBe(' ');
      expect(p.prompts()).toEqual([]);
    } finally { p.net.close(); }
  });

  it('the ready help waits for the rendered own-corpse expiry, then stays on the help widget every frame', () => {
    const p = page();
    try {
      p.die(); p.frame(0); p.frame(9999);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      expect(p.view()?.help?.[1]).toBe(' ');
      p.expireCorpse();
      p.frame(10000);
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 10, respawnReady: true });
      expect(p.view()?.help).toEqual([`You have died.  ${R2} Select new weapons.`, `Press the ${CROSS} button to respawn.`, ' ', ' ', ' ', ' ']);
      p.frame(20000);
      expect(p.view()?.help?.[1]).toBe(`Press the ${CROSS} button to respawn.`);
      expect(p.prompts()).toEqual([]);             // no message-window post, including beyond its old five-second delay
    } finally { p.net.close(); }
  });

  it('a death older than ten seconds stays unready while the renderer still shows the corpse, then follows its expiry', () => {
    const p = page();
    try {
      p.die(); p.frame(0); p.frame(30000);
      expect(p.net.prompt()).toMatchObject({ sinceDeath: 30, respawnReady: false });
      expect(p.view()?.help?.[1]).toBe(' ');
      p.expireCorpse(); p.frame(30016);
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
      expect(p.view()?.help?.[1]).toBe(`Press the ${CROSS} button to respawn.`);
      p.spawn(); p.frame(30032);
      expect(p.net.prompt()).toBeNull(); expect(p.view()).toBeNull();
      p.die(); p.frame(50000);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
    } finally { p.net.close(); }
  });

  it('corpse expiry cannot skip the original strict greater-than-five-second minimum', () => {
    const p = page();
    try {
      p.die(); p.frame(0); p.expireCorpse(); p.frame(5000);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      p.frame(5001);
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
    } finally { p.net.close(); }
  });

  it('a non-rendering stand-in with no expiry reader stays unready instead of falling back to another body timer', () => {
    const p = page('respawn', { ownCorpseExpired: undefined });
    try {
      p.die(); p.frame(0); p.expireCorpse(); p.frame(30000);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      expect(p.view()?.help?.[1]).toBe(' ');
    } finally { p.net.close(); }
  });

  it('preset and input-device changes update both help lines after readiness on the next frame', () => {
    const p = page();
    try {
      p.die(); p.frame(0); p.expireCorpse(); p.frame(10000);
      controllerConfigs.select('Goldeneye'); p.frame(10016);
      expect(p.view()?.help?.slice(0, 2)).toEqual([`You have died.  ${R1} Select new weapons.`, `Press the ${CIRCLE} button to respawn.`]);
      p.device('keyboard'); p.frame(10032);
      expect(p.view()?.help?.slice(0, 2)).toEqual(['You have died.  [I] Select new weapons.', 'Press the [X] button to respawn.']);
      p.device('touch'); p.frame(10048);
      expect(p.view()?.help?.slice(0, 2)).toEqual(['You have died.  [INV] Select new weapons.', 'Press the Circle button to respawn.']);
      expect(p.prompts()).toEqual([]);
    } finally { p.net.close(); }
  });

  it('spawn and the next round clear the help; a later death starts a new eligibility schedule', () => {
    const p = page();
    try {
      p.die(); p.frame(0); p.expireCorpse(); p.frame(10000);
      p.spawn(); p.frame(10016);
      expect(p.net.prompt()).toBeNull(); expect(p.view()).toBeNull();
      p.die(); p.frame(10016); p.frame(20015);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      p.expireCorpse();
      p.frame(20016);
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
      p.server({ type: 'roundStart', round: 2, rounds: 2, seconds: 1200, wins: { seal: 0, terrorist: 1 }, epoch: 2, startTick: 0 });
      p.frame(20032);
      expect(p.net.prompt()).toBeNull(); expect(p.view()?.help).toBeUndefined();
      expect(p.net.gate().alive).toBe(false);      // a round's UI reset never substitutes for the server's spawn
    } finally { p.net.close(); }
  });

  it('closing clears an eligible help state rather than leaving it available to a later mount', () => {
    const p = page();
    p.die(); p.frame(0); p.expireCorpse(); p.frame(10000);
    p.net.close();
    expect(p.net.prompt()).toBeNull();
    expect(p.hud.state().model.spectator).toBeNull();
  });

  it('classic retains its three teammate-cycle lines and never acquires respawn help', () => {
    const p = page('classic');
    try {
      p.die(); p.frame(0); p.frame(20000);
      expect(p.view()?.help).toHaveLength(6);
      expect(p.view()?.help?.[1]).toContain('directional buttons');
      expect(p.net.prompt()).toEqual({ ghost: false, sinceDeath: 20 });
      expect(p.prompts()).toEqual([]);
    } finally { p.net.close(); }
  });

  it('the existing touch INV button follows the real respawn prompt through the shared exchange, before readiness too', () => {
    const p = page();
    const ex = mountExchange({ net: () => p.net, map: () => null, side: () => 'seal', loadouts: new PlayerLoadout(), walking: () => true, device: () => 'touch' });
    const root = document.createElement('div'); root.innerHTML = TOUCH_LAYER_MARKUP; document.body.append(root);
    let covered = false;
    const touch = mountTouch(root, { stance: () => {}, fire: () => {}, cancelAction: () => {}, exchange: ex, covered: () => covered });
    try {
      touch.weaponsFrame(); expect(touch.weaponsShown()).toBe(false);
      p.die(); p.frame(0); touch.weaponsFrame();
      expect(ex.prompt()).toMatchObject({ respawnReady: false, device: 'touch' });
      expect(touch.weaponsShown()).toBe(true);
      covered = true; touch.weaponsFrame(); expect(touch.weaponsShown()).toBe(false);
      covered = false; p.expireCorpse(); p.frame(10000); touch.weaponsFrame(); expect(touch.weaponsShown()).toBe(true);
      p.spawn(); touch.weaponsFrame(); expect(touch.weaponsShown()).toBe(false);
    } finally { touch.dispose(); ex.dispose(); p.net.close(); }
  });
});
