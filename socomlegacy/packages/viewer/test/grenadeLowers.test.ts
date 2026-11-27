// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGrid, type GridParams } from '@s2u/scene';
import { GAME_FRAME_DT } from '@s2u/scene';
import { GRENADE_LOWERS_OWNER, RAISE_TIMES, ZERO_RAISE_TIMES, RaiseFeed, WeaponRaise } from '../src/weaponRaise';
import { packGround, Walker, WalkMode } from '../src/walk';
import { FlyCamera } from '../src/camera';
import { weaponLineLengthOf } from '../src/weaponLine';

/**
 * GRENADE-LOWERS part 1 (the owner's highest priority for v0.4.32; simulation track; reading, pending review): a hand
 * grenade selected puts the rifle down.
 *
 * - PC 2's GRENADE-LOWER-r0004 select legs (a capture of r0004): on the frame the grenade is selected the weapon state
 *   +0xf74 goes 1 -> 2 (down) and the raise envelope +0x1160..+0x116c goes to (0, 0, 0, 0) on that same frame, while the
 *   held item is still the rifle; no envelope follows while the grenade is held (0 to 4.5 s) and no lower clip plays.
 *   The muzzle probe is refused from the select frame on and the weapon line never fires with the grenade up.
 * - PC 2's L1578-PROBE-WEAPONS (r0004): held hand grenades (items 121 / 126) cannot be raised (+0x1160 is 0), their
 *   muzzle probe is refused, no weapon-line push. L1526's reading: SetWeaponState `FUN_005e7600` zeroes the raise when a
 *   grenade is selected.
 * - Where the original is not settled (a trigger held through the take-up, `HELD_TRIGGER_ITEM_RAISE_READING`'s edge 1),
 *   the owner's rule `GRENADE_LOWERS_OWNER`.
 */

const DT = GAME_FRAME_DT;
const IDLE = { trigger: false, aiming: false };
const FIRING = { trigger: true, aiming: false };
/** The page's own hand grenade selected, one left, as `RaiseFeed` hands it on. */
const SELECTED = { ...IDLE, grenade: true, grenadeSelected: true, lowered: true };

function frames(r: WeaponRaise, n: number, input: Parameters<WeaponRaise['frame']>[1]): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r.frame(DT, input));
  return out;
}

/** A rifle raised by a held trigger, at 1. */
function raised(): WeaponRaise {
  const r = new WeaponRaise();
  frames(r, 12, FIRING);
  expect(r.weight()).toBe(1);
  return r;
}

describe("GRENADE-LOWERS: a hand grenade selected holds the rifle's raise down (GRENADE-LOWER-r0004; FUN_005e7600)", () => {
  it("the select frame: state down and the envelope at 0 on that frame, under the rifle's own times (the held item still the rifle)", () => {
    const r = raised();
    r.setTimes(RAISE_TIMES);
    expect(r.frame(DT, SELECTED)).toBe(0);
    expect(r.stats()).toMatchObject({ state: 'down', moving: false, weight: 0 });
    expect(r.envelope.remaining).toBe(0);
  });

  it("held 4.5 s: no envelope follows, the state stays down", () => {
    const r = raised();
    r.setTimes(ZERO_RAISE_TIMES);
    const w = frames(r, Math.round(4.5 / DT), SELECTED);
    expect(w.every((x) => x === 0)).toBe(true);
    expect(r.stats().state).toBe('down');
  });

  it("GRENADE_LOWERS_OWNER: a trigger held through the take-up (edge 1) does not raise it -- the command's raised stays false", () => {
    const r = raised();
    r.setTimes(ZERO_RAISE_TIMES);
    const w = frames(r, Math.round(2 / DT), { ...SELECTED, trigger: true });
    expect(w.every((x) => x === 0)).toBe(true);
    expect(r.stats().state).toBe('down');                               // `Play.raisedUp` -> `Command.raised` false
  });

  it("a lowered rifle with the grenade up and the trigger held: never raised", () => {
    const r = new WeaponRaise();
    r.frame(DT, FIRING);
    const w = frames(r, 20, { ...SELECTED, trigger: true });
    expect(w.every((x) => x === 0)).toBe(true);
    expect(r.stats().state).toBe('down');
  });

  it("the throw's release keeps its measured chain (NU-8a, research 326 s7.2): the release still asks up", () => {
    const r = new WeaponRaise();
    frames(r, 30, SELECTED);
    expect(r.frame(DT, { ...SELECTED, release: 'gated' })).toBeGreaterThan(0);
  });

  it("RaiseFeed: the page's own hand grenade held (a round in the slot) is fed as lowered; an empty slot or a firearm hand is not", () => {
    const snap = { hold: null, holdSerial: undefined };
    const feed = new RaiseFeed();
    expect(feed.input(snap, false, IDLE, { grenade: true, grenadeSelected: true, windUp: false, trigger: false }).lowered).toBe(true);
    expect(feed.input(snap, false, IDLE, { grenade: false, grenadeSelected: true, windUp: false, trigger: false }).lowered).toBe(false);
    expect(feed.input(snap, false, IDLE, { grenade: false, grenadeSelected: false, windUp: false, trigger: false }).lowered).toBe(false);
    expect(new RaiseFeed().input(snap, false, IDLE, null).lowered).toBeUndefined();   // a copy: its owner's state
  });

  it("the review's F2: an EMPTY M67 slot's fire press still raises the rifle (B-01 D1, r0004 0x59bc40-0x59bc50), through the feed", () => {
    const snap = { hold: null, holdSerial: undefined };
    const feed = new RaiseFeed();
    const r = new WeaponRaise();
    const empty = { grenade: false, grenadeSelected: true, windUp: false, trigger: false };
    for (let i = 0; i < 30; i++) r.frame(DT, feed.input(snap, false, IDLE, empty));
    expect(r.weight()).toBe(0);
    const w: number[] = [];
    for (let i = 0; i < 4; i++) w.push(r.frame(DT, feed.input(snap, false, FIRING, empty)));
    expect(w.at(-1)).toBe(1);                                            // up, as the firearm's press
    expect(r.stats().state).toBe('up');
  });

  it("names the owner's rule", () => {
    expect(GRENADE_LOWERS_OWNER).toBe('a hand grenade selected holds the rifle down, the trigger held or not');
  });
});

describe("GRENADE-LOWERS: no weapon line with a hand grenade up (L1578-PROBE-WEAPONS; GRENADE-LOWER-r0004)", () => {
  const walker = (): Walker => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const w = new Walker(buildGrid(params, [], [], [], []));
    w.hand = 0;
    w.heldModels = { rifle: 'm4Acarbine_sd', pistol: 'M9', launcher: null };
    return w;
  };

  it("a hand grenade up: weaponLineLength() is null", () => {
    const w = walker();
    w.handGrenadeUp = () => true;
    expect(w.weaponLineLength()).toBeNull();
  });

  it("the firearm up: the firearm's line, as before", () => {
    const w = walker();
    w.handGrenadeUp = () => false;
    expect(w.weaponLineLength()).toBe(weaponLineLengthOf('m4Acarbine_sd'));
    w.handGrenadeUp = null;
    expect(w.weaponLineLength()).toBe(weaponLineLengthOf('m4Acarbine_sd'));
  });
});

describe("GRENADE-LOWERS: the page's walk hands every mover it makes the hand grenade (the hook wired)", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    return c;
  };
  const GROUND = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]),
    }],
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
  );

  it("setHandGrenadeUp: the page's walker answers it, and its weapon line is null while a hand grenade is up", () => {
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    let up = false;
    walk.setHandGrenadeUp(() => up);
    walk.frame(1 / 60);
    const w = walk.ephWalker() as Walker;
    w.hand = 0;
    w.heldModels = { rifle: 'm4Acarbine_sd', pistol: 'M9', launcher: null };
    expect(w.handGrenadeUp?.()).toBe(false);
    expect(w.weaponLineLength()).not.toBeNull();
    up = true;
    expect(w.handGrenadeUp?.()).toBe(true);
    expect(w.weaponLineLength()).toBeNull();
    walk.setHandGrenadeUp(null);
    expect(w.handGrenadeUp?.()).toBe(false);
    walk.unbindKey();
  });
});
