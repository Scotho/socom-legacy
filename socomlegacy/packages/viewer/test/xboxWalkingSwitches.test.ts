import { describe, expect, it, vi } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { EYE_HEIGHT, Walker } from '../src/mover';
import type { GroundData, TraversalHooks, WalkMode } from '../src/walk';
import type { Traversal } from '../src/traversal';
import { noInput } from '../src/gamepad';
import type { ClientEvent, ServerEvent } from '../src/net/protocol';
import { walkingWorld, type WalkingWorldDeps } from '../src/xboxPrototype/walkingWorld';
import { walkingObjectives, type WalkingObjectivesDeps } from '../src/xboxPrototype/walkingObjectives';

const MP72 = fixture('RUN/MP72.ZDB');
/** Actual Crossroads pick/program plus shared input arbitration. The unit fake
 * transport is explicit: server events here do not claim browser acceptance. */
describe.skipIf(!MP72)(`raw Crossroads switch actions${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  function setup(unsupported = false) {
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB'), walker = new Walker(map.grid);
    const index = map.meta!.actions.findIndex(action => action.node === 'seal_callstrike_1');
    const switchRecord = map.meta!.actions[index]!;
    const sounds: string[] = [], sent: ClientEvent[] = [], listeners = new Set<(event: ServerEvent) => void>();
    const feet: [number, number, number] = [1089.5, 90.3, 1851.6]; let looking = true, active = true;
    let traversal: Traversal | null = null, filter: (() => boolean) | null = null;
    const aim = () => {
      if (!looking) return null;
      const eye = [feet[0], feet[1] + EYE_HEIGHT, feet[2]], toward = [1089.5, 100.27, 1831.6].map((value, i) => value - eye[i]!);
      const length = Math.hypot(...toward); return { eye, far: eye.map((value, i) => value + toward[i]! * 200 / length) };
    };
    const walk = {
      gridOfGround: () => map.grid, grid: () => map.grid, feet: () => feet, drawnFeet: () => feet, lookAim: aim, fireAim: aim,
      mode: () => 'walk', isDead: () => false, isLocked: () => false, actionGateShut: () => false,
      posture: () => 'stand', lean: vi.fn(), hold: vi.fn(() => true), cancelAction: () => traversal?.holdAction?.(false),
      useTraversal(factory: ((walker: Walker, ground: GroundData) => TraversalHooks) | null) {
        traversal = factory?.(walker, map.ground) as Traversal | undefined ?? null; walker.driver = traversal;
      },
      setActionFilter: (next: typeof filter) => { filter = next; }, traversal: () => traversal,
      action: () => { if (filter?.()) return true; traversal?.action(); return true; }, setNetTap: () => {},
    } as unknown as WalkMode;
    const client = { id: 7, team: 'seal', role: 'player', state: 'open', lastSeq: () => 41, serverTick: () => 1000,
      acked: () => 41, doors: () => undefined, setWorld: () => {}, send: (event: ClientEvent) => sent.push(event),
      on: (cb: (event: ServerEvent) => void) => { listeners.add(cb); return () => listeners.delete(cb); } };
    // The known switch stands in for an unavailable crane context only in this
    // unit rejection case; no test invents a crane transform or movement rule.
    const world = walkingWorld({ map: { ...map, craneValves: unsupported ? [switchRecord.valve.toUpperCase()] : [] }, walk,
      client: () => client, enabled: () => active,
      sound: () => ({ sceneSound: (name: string) => sounds.push(name) }) } as unknown as WalkingWorldDeps);
    const hud = { setExtraMarks: vi.fn(), setDefuseTimer: vi.fn(), setHoldBar: vi.fn(), setBombCarrier: vi.fn(),
      setAction: vi.fn(), setClimbPrompt: vi.fn(), setNearbyAction: vi.fn(), postMessage: vi.fn() };
    const helper = walkingObjectives({ world, walk, client: () => client, enabled: () => active, respawnInputActive: () => false,
      hands: { start: vi.fn() }, pistol: () => false, sound: () => null, clips: null, hud,
      setGearVisible: () => {}, teamOf: () => 'seal', bodyAt: () => feet } as unknown as WalkingObjectivesDeps);
    helper.follow();
    const emit = (event: ServerEvent) => { for (const cb of listeners) cb(event); };
    const tap = () => { helper.input({ ...noInput(), action: true }, 1 / 60); helper.input(noInput(), 1 / 60); };
    return { helper, world, index, hud, sent, sounds, emit, tap, listeners,
      looking: (value: boolean) => { looking = value; }, active: (value: boolean) => { active = value; },
      dispose: () => { helper.dispose(); world.dispose(); } };
  }
  it('offers the actual lever prompt and sends one release action; the own echo never duplicates the program sound', () => {
    const h = setup(); h.helper.frame(); expect(h.helper.report().context).toBe('switch');
    expect(h.hud.setNearbyAction).toHaveBeenLastCalledWith([{ prompt: 'lever' }]);
    h.tap(); expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'action', seq: 41, action: h.index, surface: { path: 'worldmodel/seal_callstrike_1' } });
    expect(h.sounds).toEqual(['.EXP_1']); h.emit({ type: 'action', action: h.index, by: 7 });
    expect(h.sounds).toEqual(['.EXP_1']); h.dispose(); expect(h.listeners.size).toBe(0);
  });
  it('re-picks at release and cancels blur without sending a switch action', () => {
    const h = setup(); h.helper.frame(); h.helper.input({ ...noInput(), action: true }, 1 / 60);
    h.looking(false); h.helper.input(noInput(), 1 / 60); expect(h.sent).toEqual([]);
    h.looking(true); h.helper.input({ ...noInput(), action: true }, 1 / 60); h.active(false);
    h.helper.input(noInput(), 1 / 60); h.active(true); h.tap(); expect(h.sent).toEqual([]);
    h.tap(); expect(h.sent).toHaveLength(1); h.dispose();
  });
  it('presents another player switch event through the shared scene program', () => {
    const h = setup(); h.emit({ type: 'action', action: h.index, by: 9 });
    expect(h.sounds).toEqual(['.EXP_1']); expect(h.sent).toEqual([]); h.dispose();
  });
  it('does not offer or send a crane switch before crane movement is mounted', () => {
    const h = setup(true); h.helper.frame(); expect(h.helper.report().context).not.toBe('switch');
    expect(h.hud.setNearbyAction).toHaveBeenLastCalledWith(null); h.tap(); expect(h.sent).toEqual([]);
    h.emit({ type: 'action', action: h.index, by: 9 }); expect(h.sounds).toEqual([]); h.dispose();
  });
});
