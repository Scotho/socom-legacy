import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { FOOTFALL_CAP_READING, FOOTFALL_NEAREST_READING, RemotePlayers, remoteFootfall } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayEvent } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * The others' footfalls heard (2026-10-02, ported from Chris's browser-beta-v5, chris/browser-beta-integration
 * d578f347: his `remotePlayers.ts` sound hook and its `main.ts` call site). `FUN_005a3570` (460266-460378) runs in the
 * actor update `FUN_005506a0` (L417909) with no locality test, so a console hears the others' steps:
 * `FUN_005a39b0` (460385-460434) picks the crawl prone, else the step or the stealth step by the stick, at the foot;
 * prone the left foot's call is skipped. REMOTE_STEP_STICK_READING: the stick of another player is its replicated
 * ground motion's. The real `RemotePlayers` runs; its body's view and `Play` are stand-ins whose listener the test drives.
 */
const plays = vi.hoisted(() => ({ listeners: [] as ((e: PlayEvent) => void)[] }));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', () => ({ Play: class {
  // These stand-ins never start a victory; stopping its empty state is inert (Play.stopVictory).
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } frame() {}
  onEvent(l: (e: PlayEvent) => void) { plays.listeners.push(l); return () => undefined; }
} }));

const body = (alive: boolean, stance = 0, forward = 0.3, right = -0.8): BodyState => ({
  id: 2, feet: [10, 0, 20], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance, landing: 0, jumps: 0,
  ground: 1, groundForward: forward, groundRight: right, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});
const step = (foot: 'left' | 'right', position: [number, number, number] | null = [11, 0, 21]): PlayEvent =>
  ({ kind: 'footfall', foot, position }) as PlayEvent;
type Snap = Parameters<typeof remoteFootfall>[1];
const snap = (stance: PlaySnapshot['stance'], forward = 0.3, right = -0.8): Snap =>
  ({ feet: [10, 0, 20], stance, ground: { state: stance, forward, right, cls: -1 } }) as Snap;

describe('a remote footfall\'s sound (remoteFootfall; FUN_005a39b0)', () => {
  it('standing or crouched: at the foot, the stance code and the stick as the larger axis', () => {
    expect(remoteFootfall(step('left'), snap('stand'))).toEqual({ at: [11, 0, 21], stance: 0, stick: 0.8 });
    expect(remoteFootfall(step('right'), snap('crouch', 0.6, 0.1))).toEqual({ at: [11, 0, 21], stance: 1, stick: 0.6 });
  });

  it('prone: the left foot is skipped (FUN_005a3570), the right is the crawl', () => {
    expect(remoteFootfall(step('left'), snap('prone'))).toBeNull();
    expect(remoteFootfall(step('right'), snap('prone'))!.stance).toBe(2);
  });

  it('no foot point: at the feet; any other event: none', () => {
    expect(remoteFootfall(step('left', null), snap('stand'))!.at).toEqual([10, 0, 20]);
    expect(remoteFootfall({ kind: 'callback', name: 'jump_whoosh' } as PlayEvent, snap('stand'))).toBeNull();
  });
});

describe('RemotePlayers hands each living body\'s footfalls to the page', () => {
  it('a living body\'s footfall reaches the hook with its id, its step and its feet; a dead one\'s does not', () => {
    plays.listeners.length = 0;
    const heard: unknown[] = [];
    const remote = new RemotePlayers(new Scene(), (id, s, feet) => { heard.push([id, s, feet]); });
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    const camera = new PerspectiveCamera();
    remote.frame(1 / 60, [body(true)], camera);
    expect(plays.listeners).toHaveLength(1);
    plays.listeners[0]!(step('left'));
    plays.listeners[0]!({ kind: 'callback', name: 'jump_whoosh' } as PlayEvent);   // not a step: not heard here
    expect(heard).toEqual([[2, { at: [11, 0, 21], stance: 0, stick: 0.8 }, [10, 0, 20]]]);
    remote.frame(1 / 60, [body(false)], camera);
    plays.listeners[0]!(step('right'));
    expect(heard).toHaveLength(1);
  });

  it("PAR-8 (research 257 s1): the hook gets the body's facing beside its step -- the yaw its footprint runs along (FUN_005a3280 D:L460188-460212, from FUN_005a3570 beside the step's sound)", () => {
    plays.listeners.length = 0;
    const facing: unknown[] = [];
    const remote = new RemotePlayers(new Scene(), (id, _s, _feet, yaw) => { facing.push([id, yaw]); });
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    remote.frame(1 / 60, [{ ...body(true), yaw: 135 }], new PerspectiveCamera());
    plays.listeners[0]!(step('right'));
    expect(facing).toEqual([[2, 135]]);
  });

  it('without a hook (the map viewer\'s watcher, a test) nothing listens', () => {
    plays.listeners.length = 0;
    const remote = new RemotePlayers(new Scene());
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    remote.frame(1 / 60, [body(true)], new PerspectiveCamera());
    expect(plays.listeners).toHaveLength(0);
  });
});

/**
 * PF-25 (PF.R43; research 179 s11.20, the build in research 219 s4): `FUN_005a3570` sounds a step only with the actor's
 * `+0xe0` bit 2 (D:L460295), which `FUN_00552850` (D:L418748-418861) sets per viewer -- on the viewer's own actor always
 * (L418860), on at most `DAT_0064fc78` = 3 others of its list within 500 units (distance squared under 250000.0, strict).
 * The list's order is owed (FOOTFALL_NEAREST_READING: the nearest). The listener is the page's own feet
 * (`RemotePlayers.setListener`); the choice is made once a frame, before the bodies' play runs.
 */
describe('the footfall cap: the page hears at most three others within 500 u (PF-25)', () => {
  const at = (id: number, x: number, alive = true): BodyState => ({ ...body(alive), id, feet: [x, 0, 0] });
  /** Each body's footfall once, after a frame of `bodies` heard from `listener`: the ids whose step reached the hook. */
  const heardOf = (bodies: BodyState[], listener: [number, number, number] | null, set = true): number[] => {
    plays.listeners.length = 0;
    const heard: number[] = [];
    const remote = new RemotePlayers(new Scene(), (id) => { heard.push(id); });
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    if (set) remote.setListener(listener);
    remote.frame(1 / 60, bodies, new PerspectiveCamera());
    expect(plays.listeners).toHaveLength(bodies.length);
    for (const l of plays.listeners) l(step('right'));
    return heard.sort((a, b) => a - b);
  };

  it("the page hears at most three other living bodies' footfalls, the nearest by distance squared under 250000 (500 u, strict); the fourth and one at 500.0 are silent (FUN_00552850 D:L418748-418861, DAT_0064fc78 = 3; FOOTFALL_NEAREST_READING)", () => {
    expect(FOOTFALL_CAP_READING).toEqual({ others: 3, range2: 250000 });
    expect(FOOTFALL_NEAREST_READING).toBe('nearest');
    // Listed far to near: the three heard are the nearest, not the first three of the list.
    expect(heardOf([at(5, 400), at(4, 300), at(3, -200), at(2, 100)], [0, 0, 0])).toEqual([2, 3, 4]);
    // 500.0 exactly is out (strict); 499.9 is in. The listener's height counts (distance in three axes).
    expect(heardOf([at(6, 500), at(7, 499.9)], [0, 0, 0])).toEqual([7]);
    expect(heardOf([at(8, 0)], [0, 500, 0])).toEqual([]);
  });

  it("a dead body among the nearest three does not take a slot; without a listener every living body is heard (the map viewer's watcher)", () => {
    expect(heardOf([at(2, 50, false), at(3, 100), at(4, 200), at(5, 300), at(6, 400)], [0, 0, 0])).toEqual([3, 4, 5]);
    const far = [at(2, 50), at(3, 100), at(4, 200), at(5, 300), at(6, 10000), at(7, 20000, false)];
    expect(heardOf(far, null)).toEqual([2, 3, 4, 5, 6]);
    expect(heardOf(far, null, false)).toEqual([2, 3, 4, 5, 6]);
  });

  it("a hostage takes no footfall slot: three standing escortees nearer than three players leave the players heard (HX-2; whether FUN_00552850's +0xd8 list counts them is unread, research 238 s7)", () => {
    plays.listeners.length = 0;
    const heard: number[] = [];
    const remote = new RemotePlayers(new Scene(), (id) => { heard.push(id); });
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    remote.setListener([0, 0, 0]);
    for (const id of [240, 241, 242]) remote.setEscortee(id, id - 240);
    // the map carries no escortee bodies here, so only the players are drawn; the hostages are in the snapshot's list
    remote.frame(1 / 60, [at(240, 10), at(241, 20), at(242, 30), at(2, 100), at(3, 200), at(4, 300)], new PerspectiveCamera());
    expect(plays.listeners).toHaveLength(3);
    for (const l of plays.listeners) l(step('right'));
    expect(heard.sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });
});
