// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { GAME_ENDED_DIALOG_READING, GAME_KICKED_DIALOG_READING, GAME_SOCKET_CLOSED_DIALOG_READING, NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { GAME_HELLO_WAIT_MS_ADAPTATION, pinnedMatchSocket } from '../src/connectHost';
import { JOIN_FAILED_CLOSE, SERVER_CLOSING_REFUSAL, SERVER_CLOSING_RETRY_MS } from '../src/net/protocol';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * HARD-SEAT (research 169 measure 1 and the bridge review's N-1; research 157 §6): a game's socket on the page. Its
 * hello carries the game and the login's ticket; connect's lobby is told the socket holds the session at the accepted
 * hello (`socketHolds(true)`) and no longer at every close; a close that ends the game's seat for good -- the account's
 * other tab taking it (4006), the game ended (4007), the seat freed (4008), the room failed (1011) -- is the end, never
 * a retry (two tabs of one account would take the seat from each other for ever), and the front end shows the
 * original's disconnect path. A fake socket stands in for the server.
 */

const PINNED = pinnedMatchSocket('?mp&server=wss://evil.example/ws', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);

function page(game: boolean, extra: Partial<NetPageDeps> = {}) {
  const sockets: (WebSocketLike & { sent: string[] })[] = [];
  const holds: boolean[] = [];
  const ended: number[] = [];
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    session: { token: () => 'tab-token-0000000000', renew: () => 'tab-token-1111111111' },
    ...(game ? { game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: (h: boolean) => holds.push(h), ended: (d: number) => ended.push(d) } } : {}),
    socket: () => {
      const sent: string[] = [];
      const s = { binaryType: '', readyState: 1, send: (d: string) => sent.push(d), close: () => undefined, sent } as unknown as WebSocketLike & { sent: string[] };
      sockets.push(s);
      return s;
    },
    ...extra,
  };
  const urls: string[] = [];
  const factory = deps.socket!;
  deps.socket = (url) => { urls.push(url); return factory(url); };
  const net = new NetPage(deps, 'wss://evil.example/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const socket = () => sockets.at(-1)!;
  const server = (ev: ServerEvent): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  /** Frames over `ms` of the page's clock: the retry's wait runs out within it. */
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); } };
  socket().onopen?.({} as Event);
  return { net, socket, server, sockets, holds, ended, run, urls };
}

const welcome: ServerEvent = {
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as ServerEvent;

afterEach(() => { vi.restoreAllMocks(); });

describe('NET-DRAIN: a game page refused while the server drains', () => {
  it('retries on the backoff while SERVER_CLOSING_RETRY_MS lasts, then ends its seat on the disconnect dialog (365 -> dlgNetError)', () => {
    const p = page(true);
    p.server(welcome);
    const refused = (): void => {
      p.server({ type: 'refused', reason: SERVER_CLOSING_REFUSAL.reason } as ServerEvent);
      p.socket().onclose?.({ code: SERVER_CLOSING_REFUSAL.code, reason: SERVER_CLOSING_REFUSAL.reason });
    };
    p.socket().onclose?.({ code: 1001, reason: 'server stopping' });   // the drained room's close
    // SA-57: each retry's socket is answered inside the hello's wait (`GAME_HELLO_WAIT_MS_ADAPTATION`), a socket left
    // unanswered past it being a drop of its own; was a 60 s step, through which each retry's socket hung `connecting`
    // (the step that paced one socket a step). The step stays past the reached backoff's 10 s cap: one socket a step.
    const step = GAME_HELLO_WAIT_MS_ADAPTATION - 5_000;
    p.run(step);
    refused();
    let opened = p.sockets.length;
    for (let i = 0; i < Math.floor(SERVER_CLOSING_RETRY_MS / step); i++) {
      p.run(step);
      expect(p.sockets.length).toBe(++opened);
      p.socket().onopen?.({} as Event);
      refused();
    }
    expect(p.ended).toEqual([]);
    p.run(step);
    p.socket().onopen?.({} as Event);
    refused();
    p.run(step);
    expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    expect(p.net.status().state).toBe('refused');
  });
});

describe('HARD-SEAT: a game\'s socket on the page', () => {
  it('the hello names the game and carries the ticket; the accepted hello holds the session (socketHolds(true))', () => {
    const p = page(true);
    const hello = JSON.parse(p.socket().sent[0]!) as Record<string, unknown>;
    expect([hello['type'], hello['game'], hello['ticket']]).toEqual(['hello', 7, 'tkt']);
    expect(p.holds).toEqual([]);
    p.server(welcome);
    expect(p.holds).toEqual([true]);
  });

  it('two tabs of one account (N-1): replaced in its game (kicked, 4006) the page stops -- no retry, the disconnect dialog', () => {
    const p = page(true);
    p.server(welcome);
    p.server({ type: 'kicked', reason: 'replaced' } as ServerEvent);
    p.socket().onclose?.({ code: 4006, reason: 'replaced by a newer connection of this page' });
    p.run(30_000);
    expect(p.sockets).toHaveLength(1);
    expect(p.net.status().state).toBe('refused');
    expect(p.holds).toEqual([true, false]);
    expect(p.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
  });

  for (const [code, dialog] of [[4006, 365], [4007, 528], [4008, 365], [1011, 365]] as const) {
    it(`a close ${code} with no event before it: the session released, no retry, dialog #${dialog} once (card C7)`, () => {
      const p = page(true);
      p.server(welcome);
      p.socket().onclose?.({ code, reason: '' });
      p.run(30_000);
      expect(p.sockets).toHaveLength(1);
      expect(p.holds).toEqual([true, false]);
      expect(p.ended).toEqual([dialog]);
    });
  }

  it('a network close (1006) releases the session and retries the game\'s seat, as any drop', () => {
    const p = page(true);
    p.server(welcome);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(30_000);
    expect(p.holds).toEqual([true, false]);
    expect(p.sockets.length).toBeGreaterThan(1);
    expect(p.ended).toEqual([]);
    p.socket().onopen?.({} as Event);
    expect(JSON.parse(p.socket().sent[0]!)).toMatchObject({ game: 7, ticket: 'tkt' });
    p.server(welcome);
    expect(p.holds).toEqual([true, false, true]);
  });

  it('a vote kick in a game: #539 (the original\'s only kick); any other kick: #365; the page\'s own close releases the session too', () => {
    const p = page(true);
    p.server(welcome);
    p.server({ type: 'kicked', reason: 'vote' } as ServerEvent);
    p.socket().onclose?.({ code: 4001, reason: 'kicked' });
    p.run(1000);
    expect(p.ended).toEqual([GAME_KICKED_DIALOG_READING]);
    expect(p.holds).toEqual([true, false]);
    const idle = page(true);
    idle.server(welcome);
    idle.server({ type: 'kicked', reason: 'idle' } as ServerEvent);
    idle.socket().onclose?.({ code: 4001, reason: 'kicked' });
    idle.run(1000);
    expect(idle.ended).toEqual([GAME_SOCKET_CLOSED_DIALOG_READING]);
    const q = page(true);
    q.server(welcome);
    q.net.close();
    expect(q.holds).toEqual([true, false]);
  });

  it('a maps\' room (no game) keeps today\'s rejoin after 4006 replaced: a new joiner, no dialog', () => {
    const p = page(false);
    p.server(welcome);
    p.server({ type: 'kicked', reason: 'replaced' } as ServerEvent);
    p.socket().onclose?.({ code: 4006, reason: '' });
    p.run(30_000);
    expect(p.sockets.length).toBeGreaterThan(1);
    expect(p.ended).toEqual([]);
    expect(GAME_SOCKET_CLOSED_DIALOG_READING).toBe(365);
    expect(GAME_ENDED_DIALOG_READING).toBe(528);
    expect(GAME_KICKED_DIALOG_READING).toBe(539);
  });

  it('(3) JOIN_FAILED_CLOSE (4010, the server failed to answer the hello; the game may live) is retried, no dialog', () => {
    const p = page(true);
    p.socket().onclose?.({ code: JOIN_FAILED_CLOSE.code, reason: JOIN_FAILED_CLOSE.reason });
    p.run(30_000);
    expect(p.sockets.length).toBeGreaterThan(1);
    expect(p.ended).toEqual([]);
  });

  it('(4) a game socket connects only to the pinned URL (pinnedMatchSocket), never the URL handed to NetPage', () => {
    const p = page(true);
    expect(p.urls).toEqual(['wss://site.test/ws']);
    expect(PINNED.url).toBe('wss://site.test/ws');
  });

  it('(4) NetPage refuses a game whose URL did not come from the pinned builder', () => {
    const hud = new Hud();
    const deps = {
      walk: { setNetTap: () => undefined, setLocked: () => undefined } as unknown as WalkMode, remote: {} as RemotePlayers, hud,
      clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined, newRound: () => undefined,
      roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      game: { id: 7, ticket: 'tkt', pinned: { url: 'wss://evil.example/ws' } },
      socket: () => ({ binaryType: '', readyState: 1, send: () => undefined, close: () => undefined }) as unknown as WebSocketLike,
    } as unknown as NetPageDeps;
    expect(() => new NetPage(deps, 'wss://evil.example/ws', 'MP2', 'Tester', undefined, false, 'classic')).toThrow(/pinned/);
  });
});

/**
 * PF-18 (ruling PF.R37; research 218 §2.1): the reload the page sent before it learnt of its own flinch. The room drops
 * a reload named inside the flinch's window `'flinch'`; the own `flinch` event carries the window (`from`, `until` on the
 * commands' seqs), and the page undoes the reload it sent inside it (`deps.undoReload`, main.ts's `fire.undoReload()`).
 */
describe('PF-18: the own flinch undoes a reload the room dropped', () => {
  const reloadSent = (p: ReturnType<typeof page>): number => {
    const r = p.socket().sent.map((d) => JSON.parse(d) as { type: string; seq?: number }).filter((m) => m.type === 'reload').at(-1);
    expect(r).toBeDefined();
    return r!.seq!;
  };
  const reload = { type: 'reloadStart', weapon: { name: 'M4A1', id: 0 }, seconds: 1.6 } as never;

  it('a reload sent at seq N, then the own flinch with a window covering N: undoReload once; a window past N: none', () => {
    let undone = 0;
    const p = page(false, { undoReload: () => { undone++; } } as Partial<NetPageDeps>);
    p.server(welcome);
    p.net.fireEvent(reload);
    const n = reloadSent(p);
    p.server({ type: 'flinch', id: 1, clip: 'seal_flinch_rarm', from: n, until: n + 3 } as ServerEvent);
    expect(undone).toBe(1);
    p.server({ type: 'flinch', id: 1, clip: 'seal_flinch_rarm', from: n + 1, until: n + 4 } as ServerEvent);
    expect(undone).toBe(1);                                    // outside the window: the room took that reload
    p.server({ type: 'flinch', id: 2, clip: 'seal_flinch_rarm', from: n, until: n + 3 } as ServerEvent);
    expect(undone).toBe(1);                                    // another player's flinch: never the page's reload
  });

  // PF-19 (research 218 §3): a nonlethal blast lays `Prone cover` on a prone SEAL's mover after command `after`; the room
  // drops a reload named past it 'proneCover' (room.ts `reload`). One sent before the blast event arrived is undone.
  it('PF-19: a reload sent past the blast\'s `after`, then the own blast with knock proneCover: undoReload once; at or before it: none', () => {
    let undone = 0;
    const p = page(false, { undoReload: () => { undone++; } } as Partial<NetPageDeps>);
    p.server(welcome);
    p.net.fireEvent(reload);
    const n = reloadSent(p);
    const blast = (after: number, fall: 'proneCover' | 'fallForward'): ServerEvent =>
      ({ type: 'blast', ring: null, knock: { velocity: [0, 0, 0], fall }, after }) as ServerEvent;
    p.server(blast(n, 'proneCover'));
    expect(undone).toBe(0);                                    // the reload's command ran before the knock: the room took it
    p.server(blast(n - 1, 'fallForward'));
    expect(undone).toBe(0);                                    // a standing knock refuses no reload (the room's neither)
    p.server(blast(n - 1, 'proneCover'));
    expect(undone).toBe(1);                                    // past the knock: dropped 'proneCover', undone here
  });

  // P2 (the online-parity sweep's TB-1; research 85 s9.5, s12): online the white-out is the room's -- the level its gated
  // blast resolved (`blast.flash`; `FUN_005a5250`'s slot 0 is reached only inside `FUN_005a0e70`, D:L459228). A blast
  // with none (a frag's, an older room's) starts nothing.
  it('P2: the own blast\'s flash starts the white-out at its level; a blast with none, or null, starts nothing', () => {
    const levels: number[] = [];
    const p = page(false, { whiteOut: (level) => { levels.push(level); } } as Partial<NetPageDeps>);
    p.server(welcome);
    p.server({ type: 'blast', ring: { seconds: 5, volume: 0.35 }, knock: null, after: 0, flash: 3 } as ServerEvent);
    p.server({ type: 'blast', ring: { seconds: 5, volume: 0.35 }, knock: null, after: 0, flash: 1 } as ServerEvent);
    p.server({ type: 'blast', ring: { seconds: 5, volume: 0.35 }, knock: null, after: 0, flash: null } as ServerEvent);
    p.server({ type: 'blast', ring: null, knock: null, after: 0 } as ServerEvent);
    expect(levels).toEqual([3, 1]);
  });
});

describe('PF-31: the spectator wiring (wave 4)', () => {
  it("NetPage hands its spectator keys and pad to SpectatorView and places the camera from its pose; a player who is not benched is untouched", () => {
    const poses: unknown[] = [];
    const views = [{ name: 'SEAL Start', at: [979, 236, 689] as [number, number, number], pitch: -26, yaw: 53, roll: 0 }];
    const bodies = [{ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 }, { id: 3, flags: 64, feet: [300, 0, 0], yaw: 0 }];
    const p = page(false, { spectate: (pose) => { poses.push(pose); }, scenicViews: () => views });
    p.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
    p.net.client.bodies = (() => bodies) as never;
    const idle = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, prone: false, stance: false, boost: false, fire: false, zoom: false, zoomOut: false, fireMode: false, action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false };
    p.net.spectatorPad(idle);
    p.net.spectatorPad({ ...idle, zoom: true });
    expect(p.net.spectator.mode).toBe('free');                 // the start (SPECTATOR_START_READING; PT-19b's fix round)
    p.net.spectatorPad(idle);                                   // Up released: the scenic view
    expect(poses.at(-1)).toEqual({ x: 979, y: 236, z: 689, yaw: 53, pitch: -26 });
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(p.net.spectator.mode).toBe('scenic');
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    p.run(20);
    expect([p.net.spectator.mode, p.net.spectator.target]).toEqual(['follow', 2]);
    expect(poses.at(-1)).toMatchObject({ x: 100, y: 25.709, z: 24.906, pitch: -9.167 });
    p.net.close();
    // A player alive in the round: no key or pad edge moves the camera.
    const shots: unknown[] = [];
    const q = page(false, { spectate: (pose) => { shots.push(pose); } });
    q.server(welcome);
    q.net.client.bodies = (() => bodies) as never;
    q.net.spectatorPad({ ...idle, leanRight: true });
    q.net.spectatorPad(idle);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    q.run(20);
    expect([shots, q.net.spectator.watching, q.net.spectator.benched]).toEqual([[], null, false]);
    q.net.close();
  });

  it("SPECTATOR-VIEW W6: the frame's real seconds turn and zoom a scenic view, the projection told through spectateMagnify; promoted and spawned, the page's camera is back at 1 and a scope's projection is unchanged", () => {
    const fly = new FlyCamera(document.createElement('canvas'));
    fly.setFov(49);
    fly.setFov(49 / 4);                                         // a scope's FOV, as `./matchFirearm` sets it
    const scoped = [...fly.camera.projectionMatrix.elements];
    fly.setFov(49);
    const told: number[] = [];
    const poses: ({ yaw: number } | null)[] = [];
    const views = [{ name: 'SEAL Start', at: [979, 236, 689] as [number, number, number], pitch: -26, yaw: 53, roll: 0 }];
    const p = page(false, {
      spectate: (pose) => { poses.push(pose); if (pose) fly.setPose(pose); }, scenicViews: () => views,
      spectateMagnify: (m) => { told.push(m); fly.setMagnification(m); },
    });
    p.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
    const idle = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, prone: false, stance: false, boost: false, fire: false, zoom: false, zoomOut: false, fireMode: false, action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false };
    p.net.spectatorPad({ ...idle, zoom: true });
    p.net.spectatorPad(idle);                                   // Up released: the scenic view
    expect(p.net.spectator.mode).toBe('scenic');
    p.net.spectatorPad({ ...idle, moveY: 1, lookX: 1 });
    const camera = new PerspectiveCamera();
    for (let i = 0; i < 600 && !(p.net.spectator.magnification >= 4); i++) p.net.frame(1 / 60, camera, false, 1 / 60);
    expect(told.at(-1)).toBe(p.net.spectator.magnification);
    expect(fly.camera.zoom).toBeGreaterThanOrEqual(4);
    expect(poses.at(-1)!.yaw).not.toBe(53);                     // the stick right turned it from the view's start (wrapped)
    // Promoted (the port's queue) and spawned: the page's camera back at 1, the scope's projection what it was.
    p.server({ type: 'promoted', team: 'seal', ghost: false } as ServerEvent);
    expect([told.at(-1), fly.camera.zoom]).toEqual([1, 1]);
    p.server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 } as ServerEvent);
    p.net.frame(1 / 60, camera, false, 1 / 60);
    expect(fly.camera.zoom).toBe(1);
    fly.setFov(49 / 4);
    expect([...fly.camera.projectionMatrix.elements]).toEqual(scoped);
    p.net.close();
  });

  it("SPECTATOR-VIEW review B1: NetPage hands SpectatorView the INVERT PITCH sign (spectatePitchSign, DAT_003df198 D:L140426): the stick up looks down inverted, up with +1 or the dep absent", () => {
    const views = [{ name: 'SEAL Start', at: [979, 236, 689] as [number, number, number], pitch: -26, yaw: 53, roll: 0 }];
    const idle = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, prone: false, stance: false, boost: false, fire: false, zoom: false, zoomOut: false, fireMode: false, action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false };
    const camera = new PerspectiveCamera();
    const pitchAfter = (sign: (() => number) | undefined): number => {
      const poses: ({ pitch: number } | null)[] = [];
      const p = page(false, { spectate: (pose) => { poses.push(pose); }, scenicViews: () => views, ...(sign ? { spectatePitchSign: sign } : {}) });
      p.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
      p.net.spectatorPad({ ...idle, zoom: true });
      p.net.spectatorPad({ ...idle, lookY: 1 });                // Up released: scenic; the look stick up
      p.net.frame(1 / 60, camera, false, 1 / 60);
      const pitch = poses.at(-1)!.pitch;
      p.net.close();
      return pitch;
    };
    expect(pitchAfter(() => -1)).toBeLessThan(-26);
    expect(pitchAfter(() => 1)).toBeGreaterThan(-26);
    expect(pitchAfter(undefined)).toBeGreaterThan(-26);
  });

  it("SPECTATOR-VIEW W6: the match's end -- the page closed, or released to the lobby -- tells the page's camera 1 (the view's end)", () => {
    const views = [{ name: 'SEAL Start', at: [979, 236, 689] as [number, number, number], pitch: -26, yaw: 53, roll: 0 }];
    const idle = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, prone: false, stance: false, boost: false, fire: false, zoom: false, zoomOut: false, fireMode: false, action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false };
    const camera = new PerspectiveCamera();
    for (const end of ['close', 'release'] as const) {
      const told: number[] = [];
      const p = page(false, { scenicViews: () => views, spectateMagnify: (m) => { told.push(m); } });
      p.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
      p.net.spectatorPad({ ...idle, zoom: true });
      p.net.spectatorPad({ ...idle, moveY: 1 });                // Up released: scenic; the zoom stick held
      for (let i = 0; i < 30; i++) p.net.frame(1 / 60, camera, false, 1 / 60);
      expect(told.at(-1)!).toBeGreaterThan(1);
      if (end === 'close') p.net.close(); else p.net.release();
      expect([end, told.at(-1)]).toEqual([end, 1]);
    }
  });

  // The PF-31 review's gate: Triangle is the spectator's jump to the visible player (`./spectatorView`), and also the fly
  // camera's "down" (`fly.setLift`, main.ts and matchMount.ts); while the pad is the spectator's the lift leaves it out,
  // else Triangle in the free camera sinks it and the release snaps to follow.
  it('spectatorCamera(): true for a spectator and a benched player (the pad\'s Triangle is the spectator\'s, not the fly camera\'s lift), false for a player in play', () => {
    const s = page(false);
    s.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
    expect(s.net.spectatorCamera()).toBe(true);
    s.net.close();
    const q = page(false);
    q.server(welcome);
    expect(q.net.spectatorCamera()).toBe(false);
    q.server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null } as unknown as ServerEvent);
    expect([q.net.spectator.benched, q.net.spectatorCamera()]).toEqual([true, true]);   // classic's dead: benched
    q.server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 } as ServerEvent);
    expect(q.net.spectatorCamera()).toBe(false);
    q.net.close();
  });
});

// HX-1 (web sprint 31; research 237 s4; ruling HX.R7): the page's three cases for EXTRACTION's wire -- a hostage's
// `kill`, the minute's `roundTime`, the AI's `hostageState` -- every page's, no part of its own (the bodies ride the
// shared `remote`). The `hostageState` dep is optional; its `PART_DEPS` line is the wave-4 batch's (HX-4a).
describe('HX-1: the hostage cases', () => {
  it("a kill with victimKind 'hostage' posts no line (HOSTAGE_KILL_LINE_READING) and plays the death at the body; roundTime resets the HUD's clock to the new total less the elapsed; hostageState reaches the optional dep and the page's hostage map", () => {
    const lines: unknown[] = [], timers: number[] = [], died: [number, string | null][] = [], states: unknown[] = [];
    const escortees: [number, number | string][] = [], opacities: [number, number, boolean][] = [];
    const hud = new Hud();
    hud.postMessage = ((text: unknown) => { lines.push(text); }) as typeof hud.postMessage;
    hud.setTimer = (s: number) => { timers.push(s); };
    const remote = {
      setTeam: () => undefined, forget: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined,
      died: (id: number, clip: string | null) => { died.push([id, clip]); }, feet: () => null, playerType: () => null,
      setEscortee: (id: number, which: number | string) => { escortees.push([id, which]); },
      setOpacity: (id: number, o: number, fading = false) => { opacities.push([id, o, fading]); },
    } as unknown as RemotePlayers;
    const voices: unknown[] = [];
    const p = page(false, { hud, remote, hostageState: (ev) => { states.push(ev); }, deathVoice: (...a) => { voices.push(a); } });
    const hostage = { id: 240, name: 'Hostage', character: 'mp_fem1', at: [1750.26, 50.99, 1179.72] as [number, number, number], yaw: 0, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 };
    p.server({ ...welcome, hostages: [hostage] } as ServerEvent);
    expect(p.net.hostages().get(240)).toMatchObject({ name: 'Hostage', ai: 0x17, alive: true });
    // The review of 288f2752, finding 1: the body is named an escortee (HX-2's body, out of the footfall cap) at its opacity.
    expect(escortees).toEqual([[240, 'mp_fem1']]);
    expect(opacities).toEqual([[240, 1, false]]);
    p.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    lines.length = 0;
    // A hostage's death: no kill line, its body plays the clip; a player's still posts its line.
    p.server({ type: 'kill', killer: 2, victim: 240, weapon: 'M4A1', how: 'weapon', clip: 'die_fwd', cause: 5, voiced: true, victimKind: 'hostage' } as ServerEvent);
    expect(lines).toEqual([]);
    expect(died).toEqual([[240, 'die_fwd']]);
    expect(voices).toEqual([]);                                                 // the escortee's voice is HX-2's (.FEMALE_DEATH)
    expect(p.net.hostages().get(240)!.alive).toBe(false);
    p.server({ type: 'kill', killer: 2, victim: 3, weapon: 'M4A1', how: 'weapon', clip: null } as ServerEvent);
    expect(lines).toHaveLength(1);
    // The minute: 100 s into a 360 s round the total becomes 300 -- 200 s left.
    p.run(100_000);
    timers.length = 0;
    p.server({ type: 'roundTime', seconds: 300 } as ServerEvent);
    expect(timers.at(-1)).toBeCloseTo(200, 3);
    p.run(1000);
    expect(timers.at(-1)).toBeCloseTo(199, 3);
    // The AI's state: the dep and the map.
    const ev = { type: 'hostageState', id: 240, alive: true, ai: 9, leader: 2, rescuer: null, opacity: 1, unit: 2 } as ServerEvent;
    p.server(ev);
    expect(states).toEqual([ev]);
    expect(p.net.hostages().get(240)).toMatchObject({ name: 'Hostage', ai: 9, leader: 2, unit: 2, alive: true });
    // A rescued state's opacity reaches HX-2's fade, fading (0x11); any other state's is set, not run down.
    expect(opacities.at(-1)).toEqual([240, 1, false]);
    p.server({ ...ev, ai: 0x11, rescuer: 2, opacity: 0.8 } as ServerEvent);
    expect(opacities.at(-1)).toEqual([240, 0.8, true]);
    // A page without the dep takes the event all the same (an older page ignores the type entirely).
    const q = page(false);
    q.server(welcome);
    expect(() => q.server(ev)).not.toThrow();
    expect(q.net.hostages().get(240)).toMatchObject({ ai: 9 });
    p.net.close(); q.net.close();
  });
});

// HX-4a (web sprint 31; research 239 s3; ruling HX.R7): the page's order to a hostage and the YES it hears. The send is
// `NetPage`'s own (open); its button is the `hostages` part's (`../src/hostagePage`, wired in the wave-4 batch).
describe('HX-4a: the hostage order on the page', () => {
  it('hostageOrder(id, cmd) sends the client event with the aim and the last seq; a hostageState whose unit changes into or out of 17 plays the YES at the body through escorteeVoice (HOSTAGE_YES_AUDIENCE_PLACEHOLDER)', () => {
    const voices: [number, string, [number, number, number] | null][] = [];
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk', setFlinchPose: () => undefined,
      fireAim: () => ({ eye: [10, 60, 20] as [number, number, number], far: [10, 60, 320] as [number, number, number] }),
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined,
      feet: (id: number) => (id === 240 ? [1750.26, 50.99, 1179.72] as [number, number, number] : null),
      setEscortee: () => undefined, setOpacity: () => undefined, hydrateCorpse: () => undefined,
    } as unknown as RemotePlayers;
    const states: unknown[] = [];
    const p = page(false, { walk, remote, escorteeVoice: (id, cue, at) => { voices.push([id, cue, at]); }, hostageState: (ev) => { states.push(ev); } });
    p.server(welcome);
    // The send: the aim as `fire` carries it (the eye, the unit direction to the far point), the last command's seq.
    expect(p.net.hostageOrder(240, 4)).toBe(true);
    const sent = JSON.parse(p.socket().sent.at(-1)!) as Record<string, unknown>;
    expect(sent).toEqual({ type: 'hostageOrder', seq: p.net.client.lastSeq(), hostage: 240, cmd: 4, eye: [10, 60, 20], dir: [0, 0, 1], viewTick: p.net.client.viewTick() });
    // The YES: a unit change into or out of 17 -- not the first state seen, not a change that keeps the unit.
    const state = (unit: number, ai = 0x17): ServerEvent => ({ type: 'hostageState', id: 240, alive: true, ai, leader: unit === 17 ? null : 1, rescuer: null, opacity: 1, unit } as ServerEvent);
    p.server(state(17));
    expect(voices).toEqual([]);
    p.server(state(0x21, 9));                                                  // FOLLOW: into the leader's unit
    expect(voices).toEqual([[240, 'yes', [1750.26, 50.99, 1179.72]]]);
    // One arm (HX-1's, the YES folded in): the map, the dep once per state, the YES once.
    expect(states).toHaveLength(2);
    expect(p.net.hostages().get(240)).toMatchObject({ ai: 9, unit: 0x21 });
    p.server(state(0x21, 0x11));                                               // the rescue: the unit kept, no YES
    expect(voices).toHaveLength(1);
    p.server(state(17));                                                       // HOLD (or the UnitTick's): back to 17
    expect(voices).toHaveLength(2);
    // A round's start forgets the units: the reset's states say nothing (no order was given).
    p.server(state(0x21, 9));
    expect(voices).toHaveLength(3);
    p.server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    p.server(state(17));
    expect(voices).toHaveLength(3);
    // A joiner is seeded by the welcome's list: the first unit change it hears says YES.
    const j = page(false, { walk, remote, escorteeVoice: (id, cue, at) => { voices.push([id, cue, at]); } });
    j.server({ ...welcome, hostages: [{ id: 240, name: 'Hostage', character: 'mp_fem1', at: [1750.26, 50.99, 1179.72], yaw: 0, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 }] } as ServerEvent);
    const heard = voices.length;
    j.server(state(0x21, 9));
    expect(voices.length).toBe(heard + 1);
    j.net.close();
    // A spectator sends no order; nor does a page with no aim.
    const q = page(false, { walk: { ...walk, fireAim: () => null } as unknown as WalkMode });
    q.server(welcome);
    const before = q.socket().sent.length;
    expect(q.net.hostageOrder(240, 5)).toBe(false);
    q.server({ ...welcome, role: 'spectator', team: null } as ServerEvent);
    expect(q.net.hostageOrder(240, 5)).toBe(false);
    expect(q.socket().sent.length).toBe(before);
    p.net.close(); q.net.close();
  });
});

describe("LATER 72: the reload's press reaches the room", () => {
  it("a reloadPress is sent at the last command with its seq, and the page's window set to seq + the delay's commands", () => {
    const windows: number[] = [];
    const p = page(false, { pressWindow: (until: number) => { windows.push(until); } } as Partial<NetPageDeps>);
    p.server(welcome);
    p.net.fireEvent({ type: 'reloadPress', weapon: { name: 'M870', id: 0 }, seconds: 1 } as never);
    const m = p.socket().sent.map((d) => JSON.parse(d) as { type: string; seq?: number }).filter((x) => x.type === 'reloadPress').at(-1);
    expect(m).toBeDefined();
    expect(windows).toEqual([m!.seq! + 60]);
  });
});
