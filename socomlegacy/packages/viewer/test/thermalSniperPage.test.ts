// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { EMPTY_ITEM, ITEM, itemClass, readKitTable } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type FirearmHands, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { THERMAL_LENS } from '../src/sights';
import { packGround, WalkMode, type GroundData } from '../src/walk';

/**
 * R4P-110 on the page's path (the review of d4a2e8d40c, F2): the lens the page DRAWS (`MatchFirearm.lens()`, the one
 * writer `viewFrame`'s `lensStep`) fed by `mountFirearm`'s own hand slot (`handSlotItem`), not the pure function with ids a
 * test chooses (`thermalSniper.test.ts`). The reading (r0004, the specification; research 94 section C7; reading, pending
 * review): the scope's lens gate 0x547e50 (asked at 0x1f0e90 with no entity) answers 1 only with item 195 in the kit
 * (0x547e70) AND class 0x65, ids 101-120, at the kit's hand slot (0x5cf750 on `kit+0x824`, 0x547e80-0x547e90); the slot
 * index is written at the switch's press (0x5cc314, r0001 `FUN_005c4b10` D:L478842), not at the raise's end.
 *
 * Three states (the review's state table): (a) the hand slot's order -- a turret mounted, a launcher up, an item up, else
 * the selected slot; (b) the press's timing; (c) the IQ-118 case, a picked-up M4A1 in the hand's slot beside 195. The
 * records are the kit table's (`RUN/ZWEAPON.ZAR`, the M40A1 102, the Mark 23 15, the M4A1 54); the hands are fakes, as
 * `matchFirearm.test.ts`'s.
 */

afterEach(() => { vi.restoreAllMocks(); });

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
/** The capture's kit (Q110-PC2): the M40A1, the Mark 23, the thermal scope, an HE grenade, C4. */
const Q110_KIT = [102, 15, ITEM.THERMAL, 126, ITEM.C4];

const hands = (over: Partial<FirearmHands> = {}): FirearmHands => ({
  launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
  putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
  mounted: () => false, ...over,
});

/** A flat floor at y 0 (`matchFirearm.test.ts`'s), for a body that walks and swaps on the page's own mover. */
const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** The page's state the fake hands answer from: what is up, the turret mounted. */
interface Up { launcher: boolean; item: number | null; mounted: boolean; thermalTurret: boolean }

/** The firearm on a walking body, its frame as `main.ts` orders it (`matchFirearm.test.ts` `walking`), on the kit table. */
function walking(kit: readonly number[]) {
  const up: Up = { launcher: false, item: null, mounted: false, thermalTurret: false };
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const loadouts = new PlayerLoadout();
  const deps: MatchFirearmDeps = {
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts, view: () => null,
    map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, network: () => true,
    hands: hands({
      launcherUp: () => up.launcher, itemUp: () => up.item !== null, handItem: () => up.item,
      mounted: () => up.mounted, weapon: () => (up.mounted ? 205 : null), fireMode: () => (up.mounted ? 3 : null),
      trigger: () => up.mounted, thermal: () => up.mounted && up.thermalTurret,
    }),
  };
  const firearm = mountFirearm(deps);
  walk.setGround(FLOOR, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  loadouts.setMap(readKitTable(ZWEAPON!), null);
  firearm.spawnKit('seal', [...kit]);
  const frame = (dt = 1 / 60): void => {
    walk.frame(dt);
    firearm.gunFrame(dt, true);
    firearm.kitFrame(dt, true);
    firearm.aimReticle(dt);
  };
  const until = (done: () => boolean, max = 600): number => {
    let n = 0;
    while (!done()) { frame(); if (++n > max) throw new Error('never'); }
    return n;
  };
  for (let i = 0; i < 60; i++) frame();
  /** The zoom stepped in to `state`, a frame after each step; the drawn lens then. */
  const scopeTo = (state: number): void => {
    for (let i = 0; i < 4 && firearm.zoom.state() !== state; i++) { firearm.stepZoom('in'); frame(); }
    expect(firearm.zoom.state(), 'the zoom reached the scope (the control)').toBe(state);
  };
  /** [the view state, the lens the page draws]. */
  const drawn = (): [number, string | null] => [firearm.zoom.state(), firearm.lens()];
  return { up, firearm, walk, loadouts, frame, until, scopeTo, drawn };
}

describe.skipIf(ZWEAPON === null)(`R4P-110 on the page: the drawn lens follows the hand slot (handSlotItem)${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('the control: the capture\'s kit, the M40A1 scoped at 6.0 draws the thermal lens', () => {
    const w = walking(Q110_KIT);
    expect([w.firearm.item(), itemClass(102)]).toEqual(['rifle', 'sniper']);
    w.scopeTo(5);
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);
  });

  // (a) The order: mounted, the turret's id; a LAW or RPG-7 up, the launcher's; an item up, the item; else the slot's.
  it('(a) a launcher up over the scoped M40A1: the hand slot is the launcher\'s (class 0x91), the plain lens, though 195 is in the kit', () => {
    const w = walking(Q110_KIT);
    w.scopeTo(5);
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);
    w.up.launcher = true;
    w.frame();
    expect(w.drawn()).toEqual([5, 'to_scope_lens_fx']);       // the kit-only reading would keep the thermal lens here
    w.up.item = 121;                                            // an item up beside it: still the launcher's slot, no sniper
    w.frame();
    expect(w.drawn()[1]).not.toBe(THERMAL_LENS);
    w.up.launcher = false;
    w.up.item = null;
    w.frame();
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);              // back to the slot: the M40A1's
  });

  it('(a) an item up (an M67 in the hand slot): no lens drawn at all (`viewLens` none with an item up); put away, the slot\'s thermal again', () => {
    const w = walking(Q110_KIT);
    w.scopeTo(5);
    w.up.item = 121;
    w.frame();
    expect(w.drawn()[1]).toBeNull();
    w.up.item = null;
    w.frame();
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);
  });

  it('(a) a turret mounted over the M40A1 scoped, launcher up too: the turret\'s view, never the scope\'s thermal -- 1 and none on a plain turret, 2 and its own lens on a THERMAL one', () => {
    for (const thermalTurret of [false, true]) {
      const w = walking(Q110_KIT);
      w.scopeTo(5);
      w.up.mounted = true;
      w.up.launcher = true;                                     // the turret first (`mountedId() ?? ...`)
      w.up.thermalTurret = thermalTurret;
      w.frame();
      expect([thermalTurret, ...w.drawn()]).toEqual(thermalTurret ? [true, 2, THERMAL_LENS] : [false, 1, null]);
      for (let i = 0; i < 3; i++) { w.firearm.stepZoom('in'); w.frame(); }
      expect([thermalTurret, w.firearm.zoom.state() < 5]).toEqual([thermalTurret, true]);   // no scope state mounted
    }
  });

  // (b) The press: the switch writes `kit+0x824` at once (0x5cc314; D:L478842) -- the lens follows the slot from the press.
  // The page's mover refuses a swap from a scope the sent command carries (`WalkMode.swapGate` on `sentScope`, research
  // 211); this rig sends no command, so the press from the held scope goes through -- the Mark 23 has no scope, and its
  // record drops the view to first person at the press (`Zoom.setWeapon`), so the lens is off there whichever hand is read.
  it('(b) the M40A1 scoped to the Mark 23: the thermal lens off at the swap\'s press, mid-clip, not at the raise\'s end', () => {
    const w = walking(Q110_KIT);
    w.scopeTo(5);
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.frame();
    expect(w.firearm.kit.swapping()).toBe(true);
    expect(w.drawn()[1]).toBeNull();                            // off at the press
    w.until(() => !w.firearm.kit.swapping());
    w.frame();
    expect(w.drawn()[1]).toBeNull();
  });

  it('(b) the M40A1 to the Mark 23 pressed in the same tick as the step into the scope: no thermal from the press, mid-clip', () => {
    const w = walking(Q110_KIT);
    w.firearm.stepZoom('in');
    w.frame();
    expect(w.drawn()).toEqual([1, null]);
    w.firearm.stepZoom('in');                                   // the M40A1 into its scope...
    expect(w.firearm.selectFirearm('pistol')).toBe(true);       // ...and the swap pressed in the same tick (research 211)
    w.frame();
    expect(w.firearm.kit.swapping()).toBe(true);
    expect(w.drawn()[1]).not.toBe(THERMAL_LENS);                // the Mark 23's slot from the press: no thermal
    w.until(() => !w.firearm.kit.swapping());
    w.frame();
    expect(w.drawn()[1]).not.toBe(THERMAL_LENS);
  });

  it('(b) the Mark 23 to the M40A1, the step in pressed in the same tick: the scope and the thermal lens from the press, while the pistol is still in the hand (m_item)', () => {
    const w = walking(Q110_KIT);
    expect(w.firearm.selectFirearm('pistol')).toBe(true);
    w.until(() => !w.firearm.kit.swapping());
    w.frame();
    w.firearm.stepZoom('in');
    w.frame();
    expect(w.drawn()).toEqual([1, null]);                       // the Mark 23 at first person
    w.firearm.stepZoom('in');                                   // the binoculars on the pistol...
    expect(w.firearm.selectFirearm('rifle')).toBe(true);        // ...replayed against the M40A1 at the press: its scope
    w.frame();
    expect(w.firearm.kit.swapping()).toBe(true);
    expect(w.firearm.item()).toBe('pistol');                    // m_item: the pistol until the clip's end
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);               // RED with the hand read at m_item (`kitRecord(kitItem)`)
  });

  // (c) IQ-118: a picked-up M4A1 into the hand's slot, 195 still in the kit (r0004 as read predicts the plain lens).
  it('(c) the M4A1 picked up into the M40A1\'s slot, 195 kept: scoped, the plain lens (the kit-only reading draws the thermal)', () => {
    const w = walking(Q110_KIT);
    w.scopeTo(5);
    expect(w.drawn()).toEqual([5, THERMAL_LENS]);               // the control: the M40A1's
    w.firearm.stepZoom('out');
    w.frame();
    const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    w.firearm.takeKit([54, 15, ITEM.THERMAL, 126, ITEM.C4], 0, [ring(30), ring(12)]);
    w.frame();
    expect([w.loadouts.loadout().includes(ITEM.THERMAL), w.firearm.records()[0].id, itemClass(54)]).toEqual([true, 54, 'rifle']);
    w.scopeTo(5);
    expect(w.drawn()).toEqual([5, 'to_scope_lens_fx']);        // RED under the kit-only gate (`thermalFitted(loadout)`)
  });
});
