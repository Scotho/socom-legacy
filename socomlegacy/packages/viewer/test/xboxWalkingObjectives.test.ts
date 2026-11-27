import { expect, it, vi } from 'vitest';
import { noInput } from '../src/gamepad';
import { Button, type ClientEvent, type Command, type ServerEvent } from '../src/net/protocol';
import { groundGrid, packGround, Walker, type GroundData, type TraversalHooks, type WalkMode } from '../src/walk';
import type { BombWire } from '../src/net/objective';
import type { Traversal } from '../src/traversal';
import { bareMeta, WorldState } from '../src/worldState';
import { walkingObjectives, type WalkingObjectivesDeps } from '../src/xboxPrototype/walkingObjectives';

/** Unit wiring with the real Traversal/Walker. The command tap is the network
 * boundary; this does not claim a browser/server match or inject test-only state
 * into the runtime's public diagnostics. */
function setup() {
  const ground = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], []);
  const walker = new Walker(groundGrid(ground));
  const listeners = new Set<(event: ServerEvent) => void>(), sent: ClientEvent[] = [];
  let moves: Traversal | null = null, filter: (() => boolean) | null = null;
  let tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  let tick = 1000, active = true, dead = false, door = false, pressure: (() => number) | null = null;
  let world: WorldState | null = null;
  const walk = {
    useTraversal(factory: ((walker: Walker, ground: GroundData) => TraversalHooks) | null) { moves = factory?.(walker, ground) as Traversal | undefined ?? null; walker.driver = moves; },
    traversal: () => moves, mode: () => 'walk', isLocked: () => false, isDead: () => dead,
    actionGateShut: () => false, lean: vi.fn(), feet: () => [0, 0, 0], drawnFeet: () => [0, 0, 0], lookAim: () => null,
    posture: () => 'stand', hold: vi.fn(() => true), cancelAction: () => moves?.holdAction?.(false),
    setActionFilter: (next: typeof filter) => { filter = next; }, action: () => { if (filter?.()) return true; moves?.action(); return true; },
    setNetTap(next: typeof tap) { tap = next; },
  } as unknown as WalkMode;
  const client = { id: 7, team: 'seal', role: 'player', state: 'open', serverTick: () => tick, lastSeq: () => 42,
    send: (event: ClientEvent) => sent.push(event), on: (cb: (event: ServerEvent) => void) => { listeners.add(cb); return () => listeners.delete(cb); } };
  const hud = { setExtraMarks: vi.fn(), setDefuseTimer: vi.fn(), setHoldBar: vi.fn(), setBombCarrier: vi.fn(),
    postMessage: vi.fn(), setAction: vi.fn(), setClimbPrompt: vi.fn(), setNearbyAction: vi.fn() };
  const doors = { target: () => door ? {} : null, action: vi.fn(() => true) };
  const cachedGear = [new Map([['Satchel', false]]), new Map([['Satchel', false]])]; let activeBody = 0;
  const gear = vi.fn((id: number, name: string, on: boolean) => { if (id === 7) for (const view of cachedGear) view.set(name, on); });
  const helper = walkingObjectives({ walk, client: () => client, enabled: () => active, respawnInputActive: () => dead,
    world: { world: () => world, doors, gates: { press: () => false }, supportsSwitch: () => true,
      setActionPressure: (read: typeof pressure) => { pressure = read; } },
    hands: { start: vi.fn() }, pistol: () => false, sound: () => null, hud,
    setGearVisible: gear, teamOf: () => 'seal', bodyAt: () => [0, 0, 0], clips: null,
  } as unknown as WalkingObjectivesDeps);
  helper.follow();
  walk.setNetTap(() => {});
  const command = (pitch = 0) => {
    const held = !!moves?.actionHeldNow?.();
    tick++;
    tap?.({ buttons: held ? Button.ActionHeld : 0, forward: 0, right: 0, yaw: 0, pitch } as Omit<Command, 'seq'>, [0, 0, 0]);
    return held;
  };
  const emit = (event: ServerEvent) => { for (const cb of listeners) cb(event); };
  const groundBomb: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
  emit({ type: 'welcome', id: 7, role: 'player', team: 'seal', startTick: 900, objective: groundBomb } as ServerEvent);
  return { helper, command, emit, groundBomb, hud, gear, sent, doors, listeners,
    cachedGear, switchBody: (model: number) => { activeBody = model; }, activeGear: () => cachedGear[activeBody]!, disconnect: () => { client.state = 'closed'; },
    held: () => !!moves?.actionHeldNow?.(), pressure: () => pressure?.(),
    active: (v: boolean) => { active = v; }, dead: (v: boolean) => { dead = v; }, door: (v: boolean) => { door = v; },
    plantSite() {
      const meta = bareMeta();
      meta.actions.push({ node: 'site_0', path: 'forge/site_0', type: 'MPBOMB', typeCode: 4, team: 0, at: [0, 0, 0],
        range: 15, elevation: 15, bitmap: 'action_mp_bomb.tif', points: 0, valve: '', anims: [] });
      world = new WorldState(meta, ground, groundGrid(ground));
    },
    setTick: (v: number) => { tick = v; }, restored: () => pressure === null && moves === null };
}

it('follows the room bomb/carrier, uses the room clock for defuse, and clears all ownership on disposal', () => {
  const h = setup(); expect(h.helper.objects).toHaveLength(1);
  h.emit({ type: 'bomb', ...h.groundBomb, state: 2, carrier: 7 });
  expect(h.helper.objects).toHaveLength(0); expect(h.gear).toHaveBeenCalledWith(7, 'Satchel', true);
  h.emit({ type: 'bomb', ...h.groundBomb, state: 3, plantingTeam: 'terrorist', detonateTick: 4000 });
  h.helper.input({ ...noInput(), action: true }, 1 / 60); expect(h.command()).toBe(true);
  h.setTick(1149); h.command(); h.helper.frame();
  expect(h.helper.report().hold).toBeCloseTo(0.5);
  expect(h.hud.setHoldBar).toHaveBeenLastCalledWith(0.5);
  expect(h.hud.setDefuseTimer).toHaveBeenLastCalledWith((4000 - 1150) / 60);
  h.helper.input(noInput(), 1 / 60); expect(h.command()).toBe(false);
  expect(h.helper.report().hold).toBeNull();
  h.helper.dispose(); expect(h.listeners.size).toBe(0); expect(h.restored()).toBe(true); expect(h.helper.objects).toHaveLength(0);
});

it('takes the own satchel off every cached team body when the socket is lost', () => {
  const h = setup(); h.emit({ type: 'bomb', ...h.groundBomb, state: 2, carrier: 7 });
  expect(h.cachedGear.map(view => view.get('Satchel'))).toEqual([true, true]);
  h.switchBody(1); h.disconnect(); h.helper.frame();
  expect(h.cachedGear.map(view => view.get('Satchel'))).toEqual([false, false]);
  h.switchBody(0); expect(h.activeGear().get('Satchel')).toBe(false); h.helper.dispose();
});

it('starts the shared plant hold from actual commands and advances by room time, never render count (forge unit site)', () => {
  const h = setup(); h.plantSite(); h.emit({ type: 'bomb', ...h.groundBomb, state: 2, carrier: 7 });
  h.helper.input({ ...noInput(), action: true }, 1 / 60); expect(h.command()).toBe(true);
  expect(h.helper.report().context).toBe('bombPlant'); expect(h.helper.report().hold).toBeCloseTo(1 / 300);
  for (let i = 0; i < 50; i++) h.helper.frame();
  expect(h.helper.report().hold).toBeCloseTo(1 / 300);
  h.setTick(1149); expect(h.helper.report().hold).toBeCloseTo(149 / 300);
  h.command(); expect(h.helper.report().hold).toBeCloseTo(0.5);
  h.helper.dispose();
});

it('fires a manual bomb drop only on release through the original context; a door wins and does not hold the bomb', () => {
  const h = setup(); h.emit({ type: 'bomb', ...h.groundBomb, state: 2, carrier: 7 }); h.command(-20);
  h.helper.input({ ...noInput(), action: true }, 1 / 60); expect(h.held()).toBe(false);
  expect(h.sent).toEqual([]); h.helper.input(noInput(), 1 / 60);
  expect(h.sent).toEqual([{ type: 'bombAction', seq: 42, action: 'drop' }]);
  h.door(true); h.helper.input({ ...noInput(), action: true }, 0.3); expect(h.held()).toBe(false);
  h.helper.input(noInput(), 1 / 60); expect(h.doors.action).toHaveBeenCalledOnce(); expect(h.sent).toHaveLength(1);
  expect(h.pressure()).toBeGreaterThan(0.5); h.helper.dispose();
});

it('cancels blur and death without a release action or stale hold, preserving cancellation across inactive polls', () => {
  const h = setup(); h.door(true); h.helper.input({ ...noInput(), action: true }, 0.3);
  h.active(false); h.helper.input(noInput(), 2); h.helper.input(noInput(), 2);
  h.active(true); h.helper.input({ ...noInput(), action: true }, 1 / 60); h.helper.input(noInput(), 1 / 60);
  expect(h.doors.action).not.toHaveBeenCalled();
  h.helper.input({ ...noInput(), action: true }, 1 / 60); h.helper.input(noInput(), 1 / 60);
  expect(h.doors.action).toHaveBeenCalledOnce(); expect(h.pressure()).toBeLessThan(0.2);
  h.dead(true); h.helper.input({ ...noInput(), action: true }, 1 / 60); expect(h.command()).toBe(false);
  h.dead(false); h.helper.input({ ...noInput(), action: true }, 1 / 60); expect(h.command()).toBe(false);
  h.helper.input(noInput(), 1 / 60); expect(h.doors.action).toHaveBeenCalledOnce(); h.helper.dispose();
});

it('keeps a short keyboard tap between frames and never turns the dead route keyup into a living action', () => {
  const h = setup(); h.door(true);
  const key = (type: 'keydown' | 'keyup') => h.helper.key({ type, code: 'KeyX', repeat: false } as KeyboardEvent);
  key('keydown'); key('keyup'); expect(h.doors.action).toHaveBeenCalledOnce();
  h.dead(true); key('keydown'); h.dead(false); key('keyup'); expect(h.doors.action).toHaveBeenCalledOnce();
  key('keydown'); key('keyup'); expect(h.doors.action).toHaveBeenCalledTimes(2); h.helper.dispose();
});
