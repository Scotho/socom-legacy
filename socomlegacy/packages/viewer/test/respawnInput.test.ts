// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { noInput, type Input } from '../src/gamepad';
import { Hud } from '../src/hud';
import { mountActions } from '../src/matchActions';
import { Button, type Rules, type ServerEvent } from '../src/net/protocol';
import type { WebSocketLike } from '../src/net/client';
import { NetPage } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { TraversalPage } from '../src/traversalPage';
import { packGround, TICK, WalkMode } from '../src/walk';

const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
};
const ground = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor], [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }],
);
const cross = (action: boolean): Input => ({ ...noInput(), action });
const cleanup: (() => void)[] = [];

/** Real page + traversal + walk command collection. The mutable expiry is the existing renderer dependency. */
function page(o: { rules?: Rules; role?: 'player' | 'spectator'; ghost?: boolean; waiting?: boolean } = {}) {
  const rules = o.rules ?? 'respawn', role = o.role ?? 'player';
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly, () => {});
  walk.setGround(ground, [150, 0, 150]); walk.setMode('walk');
  const traversal = new TraversalPage(walk);
  const hud = new Hud();
  let socket: WebSocketLike | null = null, expired = false, menu = false, inventory = false;
  const remote = { setTeam: () => {}, forget: () => {}, died: () => {}, clear: () => {} } as unknown as RemotePlayers;
  const net = new NetPage({
    walk, remote, hud, clips: () => null, remoteGrenade: () => {}, spectate: () => {}, respawned: () => {},
    roundEffects: () => {}, weapons: () => [HELD_RIFLE, HELD_SIDEARM], ownCorpseExpired: () => expired,
    menuOpen: () => menu,
    respawnInputBlocked: () => inventory,
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => {}, close: () => {} } as unknown as WebSocketLike;
      return socket;
    },
  }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role, team: role === 'player' ? 'seal' : null,
    queue: 0, name: 'Tester', players: [], rules, round: 1, rounds: 1, ghost: o.ghost ?? false,
    waiting: o.waiting, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  });
  if (role === 'player' && !o.ghost) server({ type: 'spawn', id: 1, at: [150, 0, 150], yaw: 0, after: 0 });
  const acts = mountActions({
    walk, traversal, fly, doors: { target: () => null, action: () => false },
    grenade: { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => {} },
    play: { startVictory: () => false, stopVictory: () => {}, resetVictory: () => {}, victoryActive: () => false, victoryState: () => null },
    firearm: { held: () => {}, fire: { subscribe: () => () => {} } },
    net: () => net, map: () => null, view: () => null, world: () => null,
    remote: { teamOf: () => null, feet: () => null }, bombView: {},
  });
  const commands: number[] = [];
  walk.setNetTap((cmd) => { commands.push(cmd.buttons); });
  const tick = (): number => { commands.length = 0; walk.frame(TICK); return commands.reduce((bits, next) => bits | next, 0); };
  const pad = (before: boolean, after: boolean): number => { acts.lanes(cross(before), cross(after), TICK); return tick(); };
  const die = (): void => {
    server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null });
    acts.cancel('death');
  };
  const spawn = (): void => { expired = false; server({ type: 'spawn', id: 1, at: [150, 0, 150], yaw: 0, after: 0 }); };
  cleanup.push(() => { acts.dispose(); net.close(); fly.dispose(); });
  return { net, walk, traversal, acts, pad, tick, die, spawn, server,
    expire: (on = true) => { expired = on; }, menu: (on: boolean) => { menu = on; }, inventory: (on: boolean) => { inventory = on; },
    now: (ms: number) => { vi.mocked(performance.now).mockReturnValue(ms); },
  };
}

beforeEach(() => { vi.spyOn(performance, 'now').mockReturnValue(0); });
afterEach(() => { for (const done of cleanup.splice(0)) done(); vi.restoreAllMocks(); });

describe('RSP-8: the original respawn dead controller takes a fresh press (research 354)', () => {
  it('VRJ-1: a load death takes only fresh eligible Action, bypassing no-corpse expiry until the first respawn', () => {
    const p = page();
    p.server({ type: 'deadAtLoad', id: 1 });
    p.now(4000);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    p.now(5001);
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
    expect(p.pad(true, true) & Button.Action).toBe(0);
    p.spawn(); p.die(); p.now(11002);
    expect(p.pad(false, true) & Button.Action, 'ordinary death again waits for rendered corpse expiry').toBe(0);
  });

  it('an early press, held through readiness and released, queues no Action; only a fresh eligible press queues one', () => {
    const p = page(); p.die(); p.now(4000);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    p.now(11000); p.expire();
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
  });

  it('a press cannot bypass current body expiry or the strict greater-than-five-second minimum', () => {
    const p = page(); p.die(); p.now(30000);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    p.expire(); p.now(5000);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    p.now(5001);
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
  });

  it('menu ownership refuses a press without removing ready help, and unlocking while held manufactures no press', () => {
    const p = page(); p.die(); p.now(11000); p.expire(); p.menu(true);
    expect(p.net.prompt()).toMatchObject({ respawnReady: true });
    expect(p.pad(false, true) & Button.Action).toBe(0);
    p.menu(false);
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
  });

  it('a loading cancel and its held baseline require release then a new press', () => {
    const p = page(); p.die(); p.now(4000);
    p.pad(false, true); p.acts.cancel('loading');
    p.now(11000); p.expire();
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(0);
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
  });

  it('the respawn route never starts the living ActionLifecycle or feeds a dead context hold', () => {
    const p = page(); p.die(); p.now(11000); p.expire();
    const press = vi.spyOn(p.acts.wiring, 'press'), release = vi.spyOn(p.acts.wiring, 'release');
    p.pad(false, true); p.pad(true, true); p.pad(true, false);
    expect(press).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
    expect(p.acts.wiring.lifecycle.down()).toBe(false);
  });

  it('once the actor becomes alive, the existing pad release path is retained; native post-spawn input flush is unverified', () => {
    const p = page(); p.die(); p.now(11000); p.expire();
    expect(p.pad(false, true) & Button.Action).toBe(Button.Action);
    p.spawn();
    expect(p.pad(true, false) & Button.Action).toBe(Button.Action);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(Button.Action);
  });

  it('development KeyX is a nonrepeat fresh keydown while dead, never a release or a repeat after readiness', () => {
    const p = page(), target = new EventTarget(); p.traversal.bindKeys(target); p.die(); p.now(4000);
    const key = (type: string, repeat = false): number => { target.dispatchEvent(new KeyboardEvent(type, { code: 'KeyX', repeat })); return p.tick(); };
    expect(key('keydown') & Button.Action).toBe(0);
    p.now(11000); p.expire();
    expect(key('keydown', true) & Button.Action).toBe(0);
    expect(key('keyup') & Button.Action).toBe(0);
    expect(key('keydown') & Button.Action).toBe(Button.Action);
    expect(key('keydown', true) & Button.Action).toBe(0);
    expect(key('keyup') & Button.Action).toBe(0);
  });

  // Codex's P2 on #421 (traversalPage.ts:187; OT.R69 takeover): the window's blur cancels the hold (XR-06) and swallows
  // the keyup, so the dead-key ownership it set must end with it -- else every fresh KeyX after refocus reads as held and
  // never presses respawn, until a keyup happens to arrive.
  it('a blur while dead with KeyX down (its keyup swallowed) leaves no ownership: the next fresh press after refocus respawns', () => {
    const p = page(), target = new EventTarget(); p.traversal.bindKeys(target); p.die(); p.now(4000);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(0);   // too early
    target.dispatchEvent(new Event('blur'));                           // the keyup never comes
    p.now(11000); p.expire();
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(Button.Action);
  });

  it('a KeyX held through a blocked screen cannot become a press when the screen unlocks', () => {
    const p = page(), target = new EventTarget(); p.traversal.bindKeys(target); p.die(); p.now(11000); p.expire();
    let open = false; p.traversal.keysOpen = () => open;
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(0);
    open = true;
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', repeat: true })); expect(p.tick() & Button.Action).toBe(0);
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(0);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(Button.Action);
  });

  it('the development capture-phase lifecycle can see dead-key ownership through spawn until keyup', () => {
    const p = page(), target = new EventTarget(); p.traversal.bindKeys(target); p.die(); p.now(11000); p.expire();
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(Button.Action);
    p.spawn();
    expect(p.traversal.respawnKeyInputActive()).toBe(true);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', repeat: true })); expect(p.tick() & Button.Action).toBe(0);
    target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' })); expect(p.tick() & Button.Action).toBe(0);
    expect(p.traversal.respawnKeyInputActive()).toBe(false);
  });

  it('the page input method refuses a missing body, a menu and a closed connection', () => {
    const p = page(); p.die(); p.now(11000);
    expect(p.net.pressRespawn()).toBe(false); expect(p.tick() & Button.Action).toBe(0);
    p.expire(); p.menu(true);
    expect(p.net.pressRespawn()).toBe(false); expect(p.tick() & Button.Action).toBe(0);
    p.menu(false); p.inventory(true);
    expect(p.net.prompt()).toMatchObject({ respawnReady: true });
    expect(p.net.pressRespawn()).toBe(false); expect(p.tick() & Button.Action).toBe(0);
    p.inventory(false); p.net.close();
    expect(p.net.pressRespawn()).toBe(false);
  });

  it.each([{ role: 'spectator' as const }, { ghost: true }, { rules: 'classic' as const }])('refuses the non-respawn-player path %j', (o) => {
    const p = page(o); p.die(); p.now(11000); p.expire();
    expect(p.net.pressRespawn()).toBe(false);
    expect(p.tick() & Button.Action).toBe(0);
  });

  it.each([false, true])('classic waiting=%s retains its existing release-based Action adaptation', (waiting) => {
    const p = page({ rules: 'classic', waiting }); p.die(); p.now(11000); p.expire();
    expect(p.net.respawnInputActive()).toBe(false);
    expect(p.pad(false, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(Button.Action);
  });

  it('living Action keeps its release edge', () => {
    const p = page();
    expect(p.pad(false, true) & Button.Action).toBe(0);
    expect(p.pad(true, true) & Button.Action).toBe(0);
    expect(p.pad(true, false) & Button.Action).toBe(Button.Action);
  });
});
