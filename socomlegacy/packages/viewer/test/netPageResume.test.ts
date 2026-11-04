// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import * as netPage from '../src/netPage';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { decodeCommands, encodeSnapshot } from '../src/net/codec';
import { overall } from '../src/net/damage';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * RECONNECT-GHOST step 1 on the page -- OT.R59 (the owner, 2026-10-16: "Keep it alive"), labelled adaptations:
 * - (D) inside the window the room resumes the seat (`welcome` with `resumed`, then `resume`): the page stands its walk
 *   where it already is -- no respawn, no spawn's refill -- unlocked and alive, its health and live kit the room's, and
 *   its commands numbered on from the resume's `seq`, so the room runs them;
 * - (B) past the window a rejoin seated a ghost in a classic round in play shows `RECONNECT_GHOST_LINE_ADAPTATION`, held
 *   on the message window (`Hud.setNotice`) until the page's next spawn; a first welcome as a late joiner's ghost shows
 *   none (it never played).
 * A fake socket stands in for the server.
 */

type Tap = ((cmd: Record<string, unknown>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null;

function page(o: { refuse?: number } = {}) {
  let refuse = o.refuse ?? 0;                                       // LATER 498: the walk's respawn refuses this many times
  const sockets: (WebSocketLike & { sent: (string | Uint8Array)[] })[] = [];
  const notices: (string | null)[] = [];
  const health: number[] = [];
  const kits: unknown[][] = [];
  const respawnedKits: unknown[] = [];
  const banners: number[] = [];
  const walkCalls: string[] = [];
  let tap: Tap = null;
  let tapFrom = -1;
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  hud.startRound = ((r: { round: number }) => { banners.push(r.round); }) as typeof hud.startRound;
  hud.setHealth = ((h: number) => { health.push(h); }) as typeof hud.setHealth;
  (hud as unknown as { setNotice: (t: string | null) => void }).setNotice = (t) => { notices.push(t); };
  const walk = {
    setNetTap: (t: Tap, sent?: number) => { tap = t; tapFrom = sent ?? -1; walkCalls.push(`tap ${t ? 'on' : 'off'}`); },
    setLocked: (on: boolean) => { walkCalls.push(on ? 'lock' : 'unlock'); },
    respawn: () => { walkCalls.push('respawn'); return refuse-- <= 0; },
    resume: (at: readonly number[], yaw: number, posture: string, weapon: number, held: number | null) => { walkCalls.push(`resume ${at.join(',')} ${yaw} ${posture} ${weapon} ${held}`); return true; },
    nudge: () => undefined, setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined,
    setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined, setDead: (on: boolean) => { walkCalls.push(on ? 'dead' : 'alive'); },
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined, setType: () => undefined, setKit: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: (kit) => { respawnedKits.push(kit); }, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    kitChanged: (loadout, slot, rounds, _filled, resumed) => { kits.push(resumed ? [loadout, slot, rounds, resumed] : [loadout, slot, rounds]); },
    session: { token: () => 'tab-token-0000000000', renew: () => 'tab-token-1111111111' },
    socket: () => {
      const sent: (string | Uint8Array)[] = [];
      const s = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => sent.push(d), close: () => undefined, sent } as unknown as WebSocketLike & { sent: (string | Uint8Array)[] };
      sockets.push(s);
      return s;
    },
  };
  const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const socket = () => sockets.at(-1)!;
  const server = (ev: ServerEvent | Record<string, unknown>): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const camera = new PerspectiveCamera();
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const run = (ms: number): void => { for (let i = 0; i < 20; i++) { t += ms / 20; net.frame(1 / 60, camera, false); } };
  socket().onopen?.({} as Event);
  /** The walk's next tick through the client's tap: the command frame it sent, decoded (null when none went). */
  const tick = (): number[] | null => {
    const s = socket(), before = s.sent.length;
    tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, [0, 0, 0], [0, 0]);
    const frame = s.sent.slice(before).find((d): d is Uint8Array => typeof d !== 'string');
    return frame ? decodeCommands(frame).commands.map((c) => c.seq) : null;
  };
  /** LATER 498: the room's snapshot of this page's own body at `at`. */
  const own = (at: [number, number, number]): void => {
    socket().onmessage?.({ data: encodeSnapshot({ tick: 9, own: { ack: 0, x: at[0], y: at[1], z: at[2], vx: 0, vy: 0, vz: 0, facing: { yaw: 0, pitch: 0 } }, bodies: [] }) } as MessageEvent);
  };
  return { net, socket, server, sockets, run, notices, health, kits, respawnedKits, banners, walkCalls, tick, own, tapFrom: () => tapFrom };
}

const welcome = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'HelloWorld',
  players: [], rules: 'classic', round: 2, rounds: 11, ghost: false, epoch: 2, env: { revision: 0, epoch: 2, states: [] }, startTick: 0, ...over,
});

const LINE = (netPage as unknown as { RECONNECT_GHOST_LINE_ADAPTATION?: string }).RECONNECT_GHOST_LINE_ADAPTATION;

afterEach(() => { vi.restoreAllMocks(); });

describe('RECONNECT-GHOST (B): past the window, the reconnect told (OT.R59)', () => {
  it('the line is the adaptation\'s, in the message window\'s capitals', () => {
    expect(LINE).toBe('RECONNECTED -- OUT UNTIL THE NEXT ROUND');
  });

  it('a rejoin seated a ghost in a classic round in play holds the line until the page\'s next spawn', () => {
    const p = page();
    p.server(welcome());
    p.socket().onclose?.({ code: 1006, reason: '' });               // the owner's close: nothing reached the server
    p.run(1500);                                                    // the 1 s retry
    expect(p.sockets).toHaveLength(2);
    p.socket().onopen?.({} as Event);
    p.server(welcome({ id: 3, ghost: true }));
    expect(p.notices.at(-1)).toBe(LINE);
    p.server({ type: 'roundStart', round: 3, seconds: 360, wins: { seal: 0, terrorist: 1 }, rounds: 11, epoch: 3, startTick: 100 });
    p.server({ type: 'spawn', id: 3, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(p.notices.at(-1)).toBeNull();                            // gone at the spawn
  });

  it('a first welcome as a late joiner\'s ghost shows no reconnect line (it never played)', () => {
    const p = page();
    p.server(welcome({ ghost: true }));
    expect(p.notices.filter((n) => n !== null)).toEqual([]);
  });

  it('the page\'s close lets the line go', () => {
    const p = page();
    p.server(welcome());
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    p.server(welcome({ id: 3, ghost: true }));
    p.net.close();
    expect(p.notices.at(-1)).toBeNull();
  });
});

describe('RECONNECT-GHOST (D) step 1 on the page: a resume stands the walk where it is (OT.R59)', () => {
  const resume = {
    type: 'resume', id: 1, at: [10, 0, 20], yaw: 90, posture: 'prone', seq: 5000, health: [40, 50, 50, 50, 50, 50], armour: [0, 0, 0, 0, 0, 0],
    loadout: [1, 2, 3, 4, 5], rounds: [[30, 30], [12]], pouch: { M67: 1, Smoke: 2 }, weapon: 1, held: null,
  };

  it('MLS-EQ: forwards exact per-slot ammunition beside the legacy aggregate pouch', () => {
    const p = page();
    p.server(welcome({ resumed: true }));
    const equipmentSlots = [
      { slot: 2, kind: 'M67', rounds: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], current: 0 },
      { slot: 3, kind: 'M67', rounds: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], current: 0 },
    ];
    p.server({ ...resume, equipmentSlots });
    expect(p.kits.at(-1)?.[3]).toEqual({ pouch: resume.pouch, held: null, weapon: 1, equipmentSlots });
  });

  it('no respawn and no spawn\'s refill: the walk stood where the body lay, prone, on its sidearm, unlocked and alive; the room\'s health, live kit and pouch laid; no round banner, no line', () => {
    const p = page();
    p.server(welcome());
    p.server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    const banners = p.banners.length, refills = p.respawnedKits.length;
    p.walkCalls.length = 0;
    p.server(welcome({ resumed: true }));
    p.server(resume);
    expect(p.walkCalls).not.toContain('respawn');
    expect(p.walkCalls).toContain('resume 10,0,20 90 prone 1 null');   // the gameplay seat's conditions 3 and 4
    expect(p.walkCalls.indexOf('resume 10,0,20 90 prone 1 null')).toBeLessThan(p.walkCalls.lastIndexOf('tap on'));   // before its first command
    expect(p.walkCalls.at(-1)).toBe('unlock');
    expect(p.respawnedKits).toHaveLength(refills);                  // no spawn's refill
    expect(p.kits.at(-1)).toEqual([resume.loadout, null, resume.rounds, { pouch: resume.pouch, held: null, weapon: 1 }]);   // conditions 2 and 4: the pouch, the firearm
    expect(p.health.at(-1)).toBeCloseTo(overall({ hp: resume.health, armour: resume.armour }), 6);
    expect(p.banners).toHaveLength(banners);                        // no "STARTING ROUND" again
    expect(p.notices.filter((n) => n !== null)).toEqual([]);
  });

  it("OBF-20 (the review's F1): the resume's last taunt and communication requests are the client's floor; an older room's resume leaves it", () => {
    const p = page();
    p.server(welcome());
    expect([p.net.client.requestFloor('taunt'), p.net.client.requestFloor('communication')]).toEqual([0, 0]);
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    p.server(welcome({ resumed: true }));
    p.server({ ...resume, taunt: 4, communication: 6 });
    expect([p.net.client.requestFloor('taunt'), p.net.client.requestFloor('communication')]).toEqual([4, 6]);
    p.server(resume);                                               // an older room's: no fields, the floor kept
    expect([p.net.client.requestFloor('taunt'), p.net.client.requestFloor('communication')]).toEqual([4, 6]);
  });

  it('the commands after it are numbered on from the resume\'s seq (the room runs them; none dropped as old)', () => {
    const p = page();
    p.server(welcome());
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    p.server(welcome({ resumed: true }));
    p.tick();                                                       // a tick between the welcome and the resume: numbered low
    p.server(resume);
    expect(p.tapFrom()).toBe(resume.seq);
    expect(p.tick()).toEqual([resume.seq + 1]);
    expect(p.tick()?.at(-1)).toBe(resume.seq + 2);
  });

  // RESUME-MOUNTED (OT.R59's follow-up): a seat resumed on a turret stays locked -- the turret page's hold stands (the room
  // holds the body; a stick predicted would be dropped and corrected) -- stood and alive all the same.
  it('RESUME-MOUNTED: a seat resumed on a turret (resume.turret) keeps its walk locked -- stood where the body is, alive, its commands on; no unlock', () => {
    const p = page();
    p.server(welcome());
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    p.walkCalls.length = 0;
    p.server(welcome({ resumed: true, turrets: [{ id: 0, occupant: 1, ammo: 750, gunYaw: 90 }] }));
    p.server({ ...resume, posture: 'stand', weapon: 0, turret: 0 });
    expect(p.walkCalls).toContain('resume 10,0,20 90 stand 0 null');
    expect(p.walkCalls).toContain('alive');
    expect(p.walkCalls).not.toContain('unlock');
    expect(p.walkCalls.at(-1)).toBe('lock');                        // the review's finding 2: the last word is the lock
    expect(p.tapFrom()).toBe(resume.seq);
    expect(p.tick()).toEqual([resume.seq + 1]);                     // its commands go on (locked: no stick in them)
  });

  it('RESUME-MOUNTED: a seat resumed unmounted (resume.turret null) is unlocked as step 1\'s', () => {
    const p = page();
    p.server(welcome());
    p.socket().onclose?.({ code: 1006, reason: '' });
    p.run(1500);
    p.socket().onopen?.({} as Event);
    p.walkCalls.length = 0;
    p.server(welcome({ resumed: true }));
    p.server({ ...resume, turret: null });
    expect(p.walkCalls.at(-1)).toBe('unlock');
  });
});

describe('RECONNECT-GHOST (B): the HUD holds a notice on the message window until it is let go (OT.R59)', () => {
  it('setNotice: the line drawn at full alpha past a post\'s 7 s life, newest at the bottom; null lets it go', () => {
    const hud = new Hud() as Hud & { setNotice(text: string | null): void };
    const texts = (): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));
    hud.setVisible(true);
    hud.step(30);                                                   // the round start's own lines long gone
    hud.setNotice('RECONNECTED -- OUT UNTIL THE NEXT ROUND');
    hud.postMessage('A POST');
    hud.step(1);
    expect(texts()).toEqual(['A POST', 'RECONNECTED -- OUT UNTIL THE NEXT ROUND']);
    hud.step(30);
    expect(hud.state().model.banner.map((b) => [b.lines[0]!.text, b.alpha])).toEqual([['RECONNECTED -- OUT UNTIL THE NEXT ROUND', 1]]);
    hud.setNotice(null);
    hud.step(1 / 60);
    expect(texts()).toEqual([]);
  });
});

describe('RECONNECT-GHOST (D) step 1 on the page\'s own parts: the pouch and the walk laid as the room holds them (OT.R59)', () => {
  it('condition 2: one M67 spent in the room -- the page\'s pouch laid to the room\'s count, one fewer, never past full, no refill', async () => {
    const { GrenadeThrower } = await import('../src/grenade');
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => null, view: () => 'third' });
    const full = g.stats().leftByItem['M67']!;
    expect(full).toBeGreaterThan(1);
    (g as unknown as { setLeft(p: Record<string, number>): void }).setLeft({ M67: full - 1, Nothing: 3 });
    expect(g.stats().leftByItem['M67']).toBe(full - 1);
    (g as unknown as { setLeft(p: Record<string, number>): void }).setLeft({ M67: full + 5 });
    expect(g.stats().leftByItem['M67']).toBe(full);
  });

  it('conditions 3 and 4: WalkMode.resume stands its own mover where the body lay, prone, on the sidearm -- no spawn counted, and its next command carries the sidearm with no swap', async () => {
    const { WalkMode, packGround } = await import('../src/walk');
    const { FlyCamera } = await import('../src/camera');
    const { Button } = await import('../src/net/protocol');
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const mode = new WalkMode(new FlyCamera(c), () => undefined);
    const floor = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) };
    mode.setGround(packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [floor], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }]), null);
    expect(mode.respawn([150, 0, 150], 0)).toBe(true);
    const spawns = mode.spawns();
    expect((mode as unknown as { resume(...a: unknown[]): boolean }).resume([100, 0, 120], 90, 'prone', 1, null)).toBe(true);
    const w = (mode as unknown as { walker: { state: { x: number; z: number; yaw: number }; stance: string; posture: string } }).walker;
    expect([Math.round(w.state.x), Math.round(w.state.z)]).toEqual([100, 120]);
    expect(w.posture).toBe('prone');
    expect(mode.hand()).toBe(1);
    expect(mode.spawns()).toBe(spawns);                             // the same body: no spawn counted
    const sent: { weapon: number; buttons: number }[] = [];
    mode.setNetTap((cmd) => { sent.push({ weapon: cmd.weapon, buttons: cmd.buttons }); });
    for (let i = 0; i < 3; i++) mode.frame(1 / 60);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((s) => s.weapon === 1 && (s.buttons & Button.Swap) === 0)).toBe(true);
  });
});

describe('RESUME-MOUNTED on a real WalkMode: the first command after a mounted resume reads no move', () => {
  /** A NetClient over a real WalkMode on a flat floor, resumed by the room (`turret` as given), W held for `frames`. */
  async function resumedWalk(turret: number | null, frames = 6) {
    const { WalkMode, packGround } = await import('../src/walk');
    const { FlyCamera } = await import('../src/camera');
    const { NetClient } = await import('../src/net/client');
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const mode = new WalkMode(new FlyCamera(c), () => undefined);
    const floor = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) };
    mode.setGround(packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [floor], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }]), null);
    const sent: Uint8Array[] = [];
    let sock: { onopen: ((e: unknown) => void) | null; onmessage: ((e: { data: unknown }) => void) | null } | null = null;
    const client = new NetClient({ url: 'ws://x/ws', map: 'MP2', name: 'n', socket: () => {
      const s = { binaryType: '', readyState: 1, send: (d: unknown) => { if (d instanceof Uint8Array) sent.push(d); }, close: () => undefined, onopen: null, onclose: null, onmessage: null, onerror: null };
      sock = s; return s as never;
    } }, mode as never);
    sock!.onopen?.({});
    sock!.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'n', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 1, env: { revision: 0, epoch: 1, states: [] }, resumed: true, ...(turret !== null ? { turrets: [{ id: turret, occupant: 1, ammo: 750, gunYaw: 0 }] } : {}) }) });
    sock!.onmessage?.({ data: JSON.stringify({ type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 40, health: [1, 1, 1, 1, 1, 1], armour: [0, 0, 0, 0, 0, 0], loadout: [], rounds: [[], []], pouch: {}, weapon: 0, held: null, turret }) });
    const key = (down: boolean): void => { globalThis.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: 'KeyW', key: 'w' })); };
    key(true);
    for (let i = 0; i < frames; i++) mode.frame(1 / 60);
    key(false);
    void client;
    return sent.flatMap((f) => decodeCommands(f).commands);
  }

  it('resumed on a turret: W held, every command after the resume carries no stick (the lock WalkMode reads for its wish)', async () => {
    const cmds = await resumedWalk(0);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds[0]!.seq).toBe(41);                                  // numbered on from the resume's seq
    expect(cmds.every((c) => c.forward === 0 && c.right === 0)).toBe(true);
  });

  it('the control: resumed unmounted, the same W reaches the command (forward)', async () => {
    const cmds = await resumedWalk(null);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.some((c) => c.forward !== 0)).toBe(true);
  });
});

describe('the review\'s F3 (OT.R59): a resume the walk cannot stand at once', () => {
  it('the client\'s fallback respawn is followed by the resume again, so the posture and the weapon stand', async () => {
    const { NetClient } = await import('../src/net/client');
    const calls: string[] = [];
    let first = true;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, nudge: () => undefined,
      respawn: () => { calls.push('respawn'); return true; },
      resume: (_at: unknown, _yaw: number, posture: string, weapon: number) => { calls.push(`resume ${posture} ${weapon}`); const ok = !first; first = false; return ok; },
    };
    let sock: { onopen: ((e: unknown) => void) | null; onmessage: ((e: { data: unknown }) => void) | null } | null = null;
    const client = new NetClient({ url: 'ws://x/ws', map: 'MP2', name: 'n', socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined, onopen: null, onclose: null, onmessage: null, onerror: null };
      sock = s; return s as never;
    } }, walk as never);
    sock!.onopen?.({});
    sock!.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'n', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 1, env: { revision: 0, epoch: 1, states: [] }, resumed: true }) });
    sock!.onmessage?.({ data: JSON.stringify({ type: 'resume', id: 1, at: [1, 0, 2], yaw: 5, posture: 'crouch', seq: 40, health: [1, 1, 1, 1, 1, 1], armour: [0, 0, 0, 0, 0, 0], loadout: [], rounds: [[], []], pouch: {}, weapon: 1, held: null }) });
    void client;
    expect(calls).toEqual(['resume crouch 1', 'respawn', 'resume crouch 1']);
  });

  it('WalkMode.resume with no mover yet (never spawned on this page) stands one, in the posture, the weapon in the hand', async () => {
    const { WalkMode, packGround } = await import('../src/walk');
    const { FlyCamera } = await import('../src/camera');
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const mode = new WalkMode(new FlyCamera(c), () => undefined);
    const floor = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) };
    mode.setGround(packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [floor], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }]), null);
    expect((mode as unknown as { resume(...a: unknown[]): boolean }).resume([10, 0, 20], 0, 'crouch', 1, null)).toBe(true);
    const w = (mode as unknown as { walker: { posture: string } | null }).walker;
    expect(w?.posture).toBe('crouch');
    expect(mode.hand()).toBe(1);
  });

  it('WalkMode.resume mid-swap: the walker\'s swap clip is gone (no swap read on the next command)', async () => {
    const { WalkMode, packGround } = await import('../src/walk');
    const { FlyCamera } = await import('../src/camera');
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const mode = new WalkMode(new FlyCamera(c), () => undefined);
    const floor = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) };
    mode.setGround(packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [floor], [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }]), null);
    expect(mode.respawn([150, 0, 150], 0)).toBe(true);
    for (let i = 0; i < 3; i++) mode.frame(1 / 60);
    expect(mode.swapWeapon('pistol')).not.toBeNull();
    expect(mode.swapProgress()).not.toBeNull();
    expect((mode as unknown as { resume(...a: unknown[]): boolean }).resume([100, 0, 120], 0, 'stand', 0, null)).toBe(true);
    expect(mode.swapProgress()).toBeNull();
    expect(mode.hand()).toBe(0);
  });
});

/**
 * OT.R59 (RECONNECT-GHOST step 2, the `bye` change): the page's own leave said before its socket closes -- `NetClient.close`
 * sends `bye` once, before the close; a page going away (`pagehide`) sends it first of all, in the capture phase, before
 * the front end's own pagehide (its logout, NU-16b) closes anything. The room never parks a seat that said it.
 */
describe('RECONNECT-GHOST step 2: the page says bye (OT.R59)', () => {
  it('NetClient.close sends bye once, before the socket\'s close; a second close sends nothing more', async () => {
    const { NetClient } = await import('../src/net/client');
    const log: string[] = [];
    let sock: { onopen: ((e: unknown) => void) | null } | null = null;
    const walk = { setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined };
    const client = new NetClient({ url: 'ws://x/ws', map: 'MP2', name: 'n', socket: () => {
      const s = { binaryType: '', readyState: 1, send: (d: unknown) => { if (typeof d === 'string' && d.includes('"bye"')) log.push('bye'); }, close: () => { log.push('close'); }, onopen: null, onclose: null, onmessage: null, onerror: null };
      sock = s; return s as never;
    } }, walk as never);
    sock!.onopen?.({});
    client.close();
    client.close();
    expect(log).toEqual(['bye', 'close', 'close']);
  });

  it('the front end\'s ABORT (MATCH-02) leaves by the page\'s own close: LobbyMatch\'s end -> the match\'s close -> NetPage.close -> NetClient.close, bye before the 1000', async () => {
    const { LobbyMatch, deferredMatch } = await import('../src/lobbyMatch');
    const { MATCH_ABORT_DIALOG_ID } = await import('../src/matchAbort');
    const p = page();
    p.server(welcome());
    const sent = p.socket().sent;
    p.socket().close = ((code?: number) => { sent.push(`close ${code}`); }) as WebSocketLike['close'];
    let t = 0, ended: number | null = null;
    const backs: { dialog: string | null; why: string }[] = [];
    const roundStart = { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 };
    const hand = { client: p.net.client, held: true, welcome: null, roundStart, mission: 'mp2', mediusWorldId: 7, gameName: 'g', lateJoiner: false };
    // `./matchMount`'s handle as the front end's `deferredMatch` holds it: its `ended` the abort's (`MatchAbort.ended()`),
    // its close `if (net) net.close()` -- the NetPage over the lobby's client.
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => {}, hide: () => {} }, load: () => Promise.resolve(),
      start: (m: { client: Parameters<typeof deferredMatch>[0] }) => deferredMatch(m.client, Promise.resolve({ release: () => p.net.release(), close: () => { p.net.close(); }, ended: () => ended })),
      back: (r: { dialog: string | null; why: string }) => { backs.push({ dialog: r.dialog, why: r.why }); }, holds: () => {},
    } as never);
    match.start(hand as never);
    await Promise.resolve(); await Promise.resolve();
    for (let i = 0; i < 100 && match.phase !== 'match'; i++) { t += 50; match.frame(); }
    expect(match.phase).toBe('match');
    await Promise.resolve();
    const from = sent.length;
    ended = MATCH_ABORT_DIALOG_ID;                                     // the switch 3 s after the confirm (`MatchAbort.frame`)
    t += 16; match.frame();
    expect(backs).toEqual([{ dialog: 'dlgNetAbort.rdr', why: 'aborted' }]);
    const after = sent.slice(from).filter((d): d is string => typeof d === 'string');
    expect(after.filter((d) => d.includes('"bye"'))).toHaveLength(1);
    expect(after.findIndex((d) => d.includes('"bye"'))).toBeLessThan(after.indexOf('close 1000'));   // said before the close
  });

  it('a page going away (pagehide) sends bye before the front end\'s own earlier pagehide listener runs, and once', () => {
    const seen: boolean[] = [];
    let p: ReturnType<typeof page> | null = null;
    const byes = (): number => p ? p.sockets.flatMap((s) => s.sent).filter((d) => typeof d === 'string' && d.includes('"bye"')).length : 0;
    const frontEnd = (): void => { seen.push(byes() > 0); };
    globalThis.addEventListener('pagehide', frontEnd);                // registered first, as the front end's mount is
    try {
      p = page();
      p.server(welcome());
      globalThis.dispatchEvent(new Event('pagehide'));
      expect(seen).toEqual([true]);                                    // the bye already out when the front end's ran
      expect(byes()).toBe(1);                                          // and once: NetPage's own close sent no second
    } finally {
      globalThis.removeEventListener('pagehide', frontEnd);
    }
  });
});

// LATER 498 (LATER 496's review F2): a spawn the walk refused (LATER 496: the client holds it, `pendingSpawn`) keeps the
// page's own spawn handling -- the death pose, the HUD's health, unbench, `respawned` -- until the retried respawn holds,
// so the corpse is not drawn without its death pose nor the HUD read alive while the player is still down. The page's own
// case: the original's spawn rebuild (`FUN_00599b60` D:L455604) has no refusal.
describe('LATER 498: the page holds its spawn handling while the client\'s spawn is pending', () => {
  it('a refused spawn: no health 1, no respawned; the own snapshot that stands it runs them, once', () => {
    const p = page({ refuse: 1 });
    p.server(welcome());
    p.server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: null });
    p.health.length = 0;
    p.server({ type: 'spawn', id: 1, at: [1, 2, 3], yaw: 0, after: 0 });
    expect(p.health, 'held while the spawn is pending').toEqual([]);
    expect(p.respawnedKits).toEqual([]);
    p.own([4, 5, 6]);                                               // the retry stands it
    expect(p.health).toEqual([1]);
    expect(p.respawnedKits).toHaveLength(1);
    p.own([4, 5, 6]);
    expect(p.respawnedKits).toHaveLength(1);
  });

  it("another seat's resume keeps this page's held spawn: the retry still runs the page's handling", () => {
    const p = page({ refuse: 1 });
    p.server(welcome());
    p.server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: null });
    p.health.length = 0;
    p.server({ type: 'spawn', id: 1, at: [1, 2, 3], yaw: 0, after: 0 });
    p.server({ type: 'resume', id: 7, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 0, weapon: 0, held: null, health: [100, 100, 100, 100, 100, 100], armour: [0, 0, 0, 0, 0, 0], loadout: [62, 15, 121, 126, 255], rounds: [[], []] });
    p.own([4, 5, 6]);
    expect(p.respawnedKits).toHaveLength(1);                        // today: the held spawn dropped by another's resume
    expect(p.health).toContain(1);
  });

  it('a spawn that holds at once runs them at the event, as before', () => {
    const p = page();
    p.server(welcome());
    p.server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: null });
    p.health.length = 0;
    p.server({ type: 'spawn', id: 1, at: [1, 2, 3], yaw: 0, after: 0 });
    expect(p.health).toEqual([1]);
    expect(p.respawnedKits).toHaveLength(1);
  });
});
