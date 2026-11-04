// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { BodyView } from '../src/bodyView';
import { Play } from '../src/play';
import { corpseShownS } from '../src/net/deaths';
import type { WorldPoly } from '@s2u/scene';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { followPose } from '../src/spectatorView';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';

/**
 * NU-11b F1 (research 314 §4.3; NU-11's review F1): the original puts the ghost's actor in the death state at its spawn
 * (`FUN_002b7d60` D:L158634-158638 -> `FUN_00543d50` D:L410437, state 8), so it neither walks nor fires; the port's ghost
 * stood its walker in walk mode, locked by its client until a spawn (no stick, no jump) but with the look, the fire, the
 * reload, the throw and the actions live -- they read `WalkMode.isDead` alone. F1: the walker in the dead state from the
 * seat (`NetPage.seatGhost`), as a classic dead player's (`NetClient`'s `kill`), given back alive at its spawn
 * (`NetClient.spawned`) and at the page's close (`deathOff`). The camera's mode for it is `GHOST_DEATH_CAMERA_READING`.
 * The real `NetPage`, `NetClient` and `WalkMode` run on a fake socket over a flat floor; the mount's stand is
 * `setGround` + `setMode('walk')` (`./matchMount` `show`), the spectate dep `./matchNet`'s (`fly.setPose`).
 */

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(-200, -200, 200, 200, 0)],
  [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }],
);
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const pages: NetPage[] = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); });

/** The match's page on a real walk stood at the opening stand, a fake socket, a classic room. */
function page() {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  const walk = new WalkMode(fly, () => undefined);
  walk.setGround(GROUND, [0, 0, 0]);
  expect(walk.setMode('walk')).toBe(true);                      // the mount's stand: walk mode at the opening stand
  let socket: WebSocketLike | null = null;
  let opened = 0;
  const bodies: { id: number; flags: number; feet: [number, number, number]; yaw: number }[] = [];
  const respawns: number[] = [];
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
    setKit: () => undefined, setType: () => undefined, feet: () => null, playerType: () => 0, setRules: () => undefined,
  } as unknown as RemotePlayers;
  const hud = new Hud();
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined,
    spectate: (pose) => { if (pose) fly.setPose(pose); },     // `./matchNet`'s
    respawned: () => { respawns.push(respawns.length + 1); },
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      opened++;
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  pages.push(net);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  (net.client as unknown as { bodies: () => unknown[] }).bodies = () => bodies;
  const welcome = (over: Partial<Extract<ServerEvent, { type: 'welcome' }>> = {}): void => server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 2, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...over,
  });
  const spawn = (): void => server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 } as ServerEvent);
  const kill = (): void => server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null } as ServerEvent);
  const state = () => ({ mode: walk.mode(), locked: walk.isLocked(), dead: walk.isDead() });
  /** The network drops the socket (not the page's close): the client's `onclose`. */
  const drop = (): void => { socket!.onclose?.({ code: 1006 } as CloseEvent); };
  /** The page's newest socket opens (the retry's, after a drop). */
  const open = (): void => { socket!.onopen?.({} as Event); };
  /** The HUD's message window, each post's lines joined by '/'. */
  const banner = (): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));
  return { fly, walk, net, hud, server, welcome, spawn, kill, bodies, respawns, state, drop, open, banner, sockets: () => opened };
}

describe('NU-11b F1: the ghost\'s walker in the dead state from its seat (netPage.ts seatGhost)', () => {
  it('a ghost seated at the welcome: locked and dead before any cycle -- no stick, no jump, no look, no fire -- the death camera on; alive at its spawn', () => {
    const p = page();
    p.welcome({ ghost: true });
    expect(p.state()).toEqual({ mode: 'walk', locked: true, dead: true });
    expect(p.net.ghost()).toBe(true);
    expect(p.walk.jump()).toBe(false);                           // the lock (walk.ts `jump`); the fire, the reload and the
    // actions read `isDead` (`./matchFirearm` trigger and `ready`, the reload lanes, `./actionWiring` `canAct`): dead above
    expect((p.walk as unknown as { player: { death: unknown } | null }).player?.death ?? null).not.toBeNull();   // FUN_00297410: state 8's camera
    p.spawn();                                                   // the next round's spawn
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
    expect(p.net.ghost()).toBe(false);
    expect(p.respawns).toEqual([1]);
  });

  it('a ghost promoted from the line into a classic round in play: the same dead walk', () => {
    const p = page();
    p.welcome({ role: 'spectator', team: undefined, queue: 1 });
    p.server({ type: 'promoted', team: 'seal', ghost: true } as ServerEvent);
    expect(p.walk.isDead()).toBe(true);
    expect(p.net.ghost()).toBe(true);
  });

  // LATER 90 (research 314 §4.3 item 4): the original has no queue, so no promotion (research 179 §6.17); the port
  // seats the promoted ghost as the late joiner's, whose console's camera is bound to its own actor
  // (`FUN_00599b60` D:L455701; `FUN_001ea720` D:L49732), that actor in state 8 (`FUN_002b7d60` D:L158633-158638 ->
  // `FUN_00543d50`), so the death camera (`FUN_00297410` D:L140893-140913). The spectator's free camera
  // (`FUN_00295260`) acts for a spectator only (D:L139465): none of it is left to the ghost.
  it('LATER 90: a ghost promoted from the line stands on its own body -- the walk (not the free fly camera), the walker\'s feet unchanged, the camera the death camera\'s orbit of the own body', () => {
    const p = page();
    for (let i = 0; i < 10; i++) p.walk.frame(1 / 60);
    const feet = p.walk.feet();
    expect(feet).not.toBeNull();
    p.welcome({ role: 'spectator', team: undefined, queue: 1 });
    expect(p.walk.mode()).toBe('fly');                           // the spectator's welcome: the free camera
    p.fly.setPose({ x: 150, y: 40, z: -120 });                   // the watcher's free camera flown away (scouting)
    for (let i = 0; i < 5; i++) p.walk.frame(1 / 60);
    p.server({ type: 'promoted', team: 'seal', ghost: true } as ServerEvent);
    expect(p.net.ghost()).toBe(true);
    expect(p.state()).toEqual({ mode: 'walk', locked: true, dead: true });   // the seated ghost's walk, as a welcome's
    expect(p.walk.feet()).toEqual(feet);                        // on its body: not re-placed at the fly camera's pose
    const camera = new PerspectiveCamera();
    for (let i = 0; i < 30; i++) { p.walk.frame(1 / 60); p.net.frame(1 / 60, camera, false); }
    const death = (p.walk as unknown as { player: { death: unknown } | null }).player?.death ?? null;
    expect(death).not.toBeNull();                                // state 8's camera (FUN_00297410)
    const now = p.fly.pose(), eye = p.walk.fireAim()!.eye;
    expect([now.x, now.y, now.z]).toEqual(eye);                  // the view is the walk's, not the free camera's
    expect(Math.hypot(now.x - 150, now.z + 120)).toBeGreaterThan(50);                    // off the scouted pose
    expect(Math.hypot(now.x - feet![0], now.z - feet![2])).toBeLessThan(80);            // about the own body
  });

  it('the page closed (or dropped) under a ghost: its walk given back alive and unlocked, as a dead player\'s is', () => {
    const p = page();
    p.welcome({ ghost: true });
    p.net.close();
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
  });

  it('the review\'s F1: a ghost\'s socket dropped -- the walk given back alive (`retry` -> `deathOff`) is no ghost: ghost() false, its own body drawn through the backoff', () => {
    const p = page();
    p.welcome({ ghost: true });
    expect(p.net.ghost()).toBe(true);
    p.drop();
    p.net.frame(1 / 60, new PerspectiveCamera(), false);         // the page's frame: `retry` sees the close
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
    expect(p.net.ghost()).toBe(false);
    // The mounts' own body (`Play.frame`'s `ghost` from `net.ghost()`, H2): drawn while the walk moves.
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, null);
    const walk = { snapshot: () => p.walk.snapshot(), view: () => 'third' as const, isDead: () => p.walk.isDead() };
    play.frame(0.1, walk, new PerspectiveCamera(), 0.1, corpseShownS('classic', 'own', false), p.net.ghost());
    expect(view.group.visible).toBe(true);
  });

  it('a classic dead player\'s walker as before: dead and locked at its kill, no ghost; alive at the close', () => {
    const p = page();
    p.welcome();
    p.spawn();
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
    p.kill();
    expect(p.state()).toEqual({ mode: 'walk', locked: true, dead: true });
    expect(p.net.ghost()).toBe(false);                           // condition 3: no ghost, its own corpse drawn (PAR-91)
    expect(p.net.prompt()).toMatchObject({ ghost: false });
    p.net.close();
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
  });
});

describe('GHOST-BANNER (LATER 81) condition 1: a ghost rejoin\'s welcome posts the round\'s banner (research 322 section 5.2)', () => {
  it('a played seat dropped mid-match and seated again as a ghost: the round\'s banner beside the reconnect notice, a ghost', () => {
    // The original has no rejoin in place -- the game has no reconnect, a departure is a leave (`KEPT_RECONNECT_READING`,
    // research 95 and 179; `FUN_002bc530` D:L161130-161140; research 315 section 3.3) -- so its way back is JOIN GAME, a
    // late join that loads the level (research 314 section 4.2-4.3), whose level init posts the banner with no seat
    // tested (`FUN_001ec480` D:L50946 -> `FUN_002a7d40` D:L149758 -> `FUN_001fb420` D:L57632-57649), after the load
    // state made the ghost (`FUN_002b7d60` D:L158633-158638).
    // The page's rejoin (OT.R59) takes the late ghost's banner; its notice is the adaptation's.
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      const p = page();
      p.hud.setVisible(true);
      p.welcome();                                               // a played seat, round 2
      p.spawn();
      p.hud.step(20);                                            // round 2's banner long gone
      p.drop();
      const camera = new PerspectiveCamera();
      for (let i = 0; i < 20; i++) { t += 100; p.net.frame(1 / 60, camera, false); }   // the 1 s retry
      expect(p.sockets()).toBe(2);                               // a new socket: the rejoin, not the old one's welcome
      p.open();
      p.welcome({ ghost: true, round: 3 });                      // seated again, a ghost of round 3
      p.hud.step(1);
      expect(p.banner()).toContain('STARTING ROUND 3 OF 11');
      expect(p.banner()).toContain('RECONNECTED -- OUT UNTIL THE NEXT ROUND');
      expect(p.net.ghost()).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('NU-11b F1 with NU-11\'s merged spectating (the S6 path): the dead walk enters and leaves the teammate view', () => {
  it('Right on the dead ghost follows a living teammate (fly mode, the follow pose); the death camera does not fight the view; the next round gives the walk back', () => {
    const p = page();
    p.welcome({ ghost: true });
    p.server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' } as ServerEvent);
    p.bodies.push({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 });
    const camera = new PerspectiveCamera();
    // Before the cycle: the walker's camera on the ghost's stand is the death camera (state 8's, FUN_00297410).
    const death = (): unknown => (p.walk as unknown as { player: { death: unknown } | null }).player?.death ?? null;
    for (let i = 0; i < 30; i++) p.walk.frame(1 / 60);
    expect(death()).not.toBeNull();
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));   // the ghost cycles (deadCycleRuns)
    expect(p.net.spectator.watching).toBe(2);
    expect(p.state()).toEqual({ mode: 'fly', locked: true, dead: true });
    expect(p.net.prompt()).toBeNull();                           // S6: the teammate's lines, not the own
    expect(p.net.ghost()).toBe(true);                            // still a ghost (H2's argument)
    const at = followPose({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 } as never);
    for (let i = 0; i < 60; i++) {
      p.walk.frame(1 / 60);                                      // the mount's walk frame first, then the page's
      p.net.frame(1 / 60, camera, false);
      const now = p.fly.pose();
      expect([now.x, now.y, now.z]).toEqual([at.x, at.y, at.z]); // the follow pose each frame: no death orbit over it
    }
    expect(death()).not.toBeNull();                              // the death camera kept, idle off the walk (fly mode)
    // The next round: the bench left, then the room's spawn stands the walker again, alive.
    p.server({ type: 'roundStart', round: 3, seconds: 360, wins: { seal: 0, terrorist: 1 }, rounds: 11, epoch: 3, startTick: 0 } as ServerEvent);
    expect(p.net.spectator.watching).toBeNull();
    p.spawn();
    expect(p.state()).toEqual({ mode: 'walk', locked: false, dead: false });
  });
});

describe('LATER 69 (research 314 §5.6): the watched teammate\'s death on the page -- the view kept on its body', () => {
  it('the ghost watching teammate 2: 2 dies, the fly camera stays at 2\'s follow pose, 3 alive is not taken; Right then takes 3', () => {
    const p = page();
    p.welcome({ ghost: true });
    p.server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' } as ServerEvent);
    p.server({ type: 'joined', id: 3, name: 'Other', team: 'seal' } as ServerEvent);
    p.bodies.push({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 }, { id: 3, flags: 64, feet: [-80, 0, 20], yaw: 0 });
    const camera = new PerspectiveCamera();
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(p.net.spectator.watching).toBe(2);
    p.bodies[0]!.flags = 0;                                      // 2 dies where it stands
    const at = followPose({ id: 2, flags: 0, feet: [100, 0, 50], yaw: 30 } as never);
    for (let i = 0; i < 30; i++) {
      p.walk.frame(1 / 60);
      p.net.frame(1 / 60, camera, false);
      const now = p.fly.pose();
      expect([now.x, now.y, now.z]).toEqual([at.x, at.y, at.z]);
    }
    expect(p.net.spectator.watching).toBe(2);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));   // from 2's slot: the next living, 3
    expect(p.net.spectator.watching).toBe(3);
  });
});

describe('DEAD-CYCLE (LATER 78, research 314 §5.6): the own body a stop of the ghost\'s cycle on the page', () => {
  it('the ghost (seat 1) watching 2, then 3: the next Right wraps to its own body -- watching null, its own prompt and WEAPON EXCHANGE\'s gate back', () => {
    const p = page();
    p.welcome({ ghost: true });
    p.server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' } as ServerEvent);
    p.server({ type: 'joined', id: 3, name: 'Other', team: 'seal' } as ServerEvent);
    p.bodies.push({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 }, { id: 3, flags: 64, feet: [-80, 0, 20], yaw: 0 });
    const space = (): void => { globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); };
    space();
    space();
    expect(p.net.spectator.watching).toBe(3);
    expect(p.net.prompt()).toBeNull();                           // S6: on a teammate
    space();                                                     // past 3, the walk's next stop is the own actor (D:L412658)
    expect(p.net.spectator.watching).toBeNull();
    expect(p.net.prompt()).toMatchObject({ ghost: true });       // the ghost's own lines (S1g), the camera on itself
    expect(p.net.gate().cameraOnSelf).toBe(true);
    space();                                                     // and on again from the own slot: 2
    expect(p.net.spectator.watching).toBe(2);
  });

  // The review's F1 (medium) and the gameplay seat's condition: the cycle back to the own seat gives the walk back where
  // the walker stands (`WalkMode.resumeBody`, through the page's `returnSelf`) -- no fly camera left free at the last
  // teammate's pose (scouting the original has no counterpart: its camera binds the own actor, D:L412618, D:L412675).
  it('the cycle back to the own body: the walk again (not fly), the walker\'s feet unchanged, the camera the death camera\'s orbit of the own body -- not the teammate\'s pose (WalkMode.resumeBody via the page\'s returnSelf)', () => {
    const p = page();
    p.welcome({ ghost: true });
    p.server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' } as ServerEvent);
    p.bodies.push({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 });
    const host = (p.net.spectator as unknown as { host: { returnSelf?: unknown } }).host;
    expect(typeof host.returnSelf).toBe('function');             // the page's wiring: the landing cannot miss it
    const camera = new PerspectiveCamera();
    for (let i = 0; i < 10; i++) p.walk.frame(1 / 60);
    const feet = p.walk.feet();
    expect(feet).not.toBeNull();
    const space = (): void => { globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); };
    space();                                                     // to teammate 2: the walk to the fly camera
    for (let i = 0; i < 5; i++) { p.walk.frame(1 / 60); p.net.frame(1 / 60, camera, false); }
    const mate = followPose({ id: 2, flags: 64, feet: [100, 0, 50], yaw: 30 } as never);
    expect([p.walk.mode(), p.fly.pose().x, p.fly.pose().z]).toEqual(['fly', mate.x, mate.z]);
    space();                                                     // past 2: the own seat (D:L412658)
    expect(p.net.spectator.watching).toBeNull();
    expect(p.state()).toEqual({ mode: 'walk', locked: true, dead: true });   // (b): the walk, still locked and dead
    expect(p.walk.feet()).toEqual(feet);                        // (a): not re-placed at the fly camera's pose
    p.walk.frame(1 / 60);
    p.net.frame(1 / 60, camera, false);
    // (c): the camera on the own body's death camera (PlayerCamera.death: deathEye / deathFar), placed as the walk's view.
    const death = (p.walk as unknown as { player: { death: unknown } | null }).player?.death ?? null;
    expect(death).not.toBeNull();
    const now = p.fly.pose(), eye = p.walk.fireAim()!.eye;
    expect([now.x, now.y, now.z]).toEqual(eye);
    expect(Math.hypot(now.x - mate.x, now.z - mate.z)).toBeGreaterThan(50);              // off the teammate's pose
    expect(Math.hypot(now.x - feet![0], now.z - feet![2])).toBeLessThan(80);            // about the own body
  });
});

describe('NU-11b F1 (the gameplay seat\'s note 1): a ghost cannot start a throw (./matchThrow on the same walk)', () => {
  /** The throwables part on the page's real walk, its net recording each release request and throw. */
  function throwables(walk: WalkMode) {
    const asked: string[] = [], thrown: string[] = [];
    const net = {
      throwEvent: (kind: string) => { thrown.push(kind); }, throwStartEvent: (kind: string) => { asked.push(kind); return asked.length; },
      client: { bodies: () => [] },
    };
    const firearm = {
      shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
      fire: { release: () => undefined, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
      zoom: { state: () => 1 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
      setZoom: () => undefined, showFireMode: () => undefined, item: () => 'rifle', record: () => ({ name: 'M4A1' }),
      records: () => [{}, {}], icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    };
    const deps: MatchThrowDeps = {
      scene: new Scene(), walk, fly: { shakeScreen: () => undefined },
      play: {
        partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
        setRifleStowed: () => undefined, addPoseLayer: () => undefined,
      } as never,
      loadouts: new PlayerLoadout(), view: () => null, map: () => null, net: () => net as never, firearm: () => firearm as never,
      audio: { onAnimCallback: () => null, play: () => undefined } as never,
    };
    const t = mountThrowables(deps);
    const cuts: unknown[] = [];
    t.grenade.on('cut', (e) => { cuts.push(e); });
    const frames = (n: number): void => { for (let k = 0; k < n; k++) t.grenade.update(1 / 60); };
    return { t, asked, thrown, cuts, frames };
  }

  it.each([
    ['a ghost (dead from its seat)', true],
    ['a living classic seat (the control)', false],
  ] as const)('%s: the R2 inventory and the trigger', (_name, ghost) => {
    const p = page();
    if (ghost) p.welcome({ ghost: true });
    else { p.welcome(); p.spawn(); }
    const h = throwables(p.walk);
    const left = h.t.grenade.stats().leftByItem.M67;
    // matchThrow.ts's inventory `alive` (walk mode and not dead): R2 refused for the ghost, opened for the living.
    expect(h.t.inventory.press(new Set(['r2']), 1 / 60)).toEqual([{ kind: ghost ? 'refused' : 'opened' }]);
    h.t.inventory.close();
    expect(h.t.grenade.equip(true, 'M67')).toBe(true);
    h.t.grenade.pull();
    h.frames(30);
    h.t.grenade.release();
    h.frames(120);
    if (ghost) {
      // The trigger takes nothing (`GrenadeThrower.pull`'s dead gate); the death cut (`update` -> `die`, matchThrow.ts's
      // `dead`) never fires for a fresh ghost holding no throw; nothing asked, sent or spent.
      expect([h.asked, h.thrown, h.cuts, h.t.grenade.phase()]).toEqual([[], [], [], 'ready']);
      expect(h.t.grenade.stats().leftByItem.M67).toBe(left);
    } else {
      expect(h.asked).toEqual(['M67']);
      expect(h.cuts).toEqual([]);
    }
  });
});
