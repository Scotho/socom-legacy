// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import {
  mountFirearm, ROUND_END_GOGGLES_READING, type MatchFirearmDeps,
} from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import type { LoadedMap } from '../src/loadMap';

/**
 * R4P-234 (reading held by forced captures: Q-234 / IQ-121 3/3 and Q234C 4/4 for the colour, Q234B for the goggles): at a round's end the original puts
 * the fog's own colour back over the goggles' tint. r0004 `FUN_002ac270` (= r0001 `FUN_002aa910`, research 397: it runs at an
 * online round's end; the port's moment is ROUND_END_EFFECTS', the engine's read) copies the saved colour `0x4b82f0` into
 * the fog object (`*(DAT_0045f750 + 0x128)`, D4:L159790-159797; the review's F2 on research 456) -- with the goggles on, the tint (0, 0.02, 0, 0) gives way to the saved
 * (0.2902, 0.2902, 0.2824, 0), 3/3; with them off, nothing changes, 3/3. The goggles stay on (Q234B:
 * `ROUND_END_GOGGLES_READING`), and the camera's field of view is not reset here (R4P-234b's `roundEndView`, `ROUND_END_CAMERA_FOV_READING`).
 */

afterEach(() => { vi.restoreAllMocks(); });

/** A flat floor at y 0 (`./matchFirearm.test.ts`'s). */
const FLOOR: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

/** A night mission's map (the disc's LensFX_NVG, 0..1; research 84 s14), as the firearm reads it. */
const LENS = [0.2, 0.898, 0.2, 0.24] as const;
const NIGHT = { night: { mission: true, lens: [...LENS] }, camera: null } as unknown as LoadedMap;

/** The firearm on a walking body on a night map; every `refreshFog` lens it asks, in order. */
function goggleRig(extra: Partial<MatchFirearmDeps> = {}) {
  const fogs: (readonly number[] | null)[] = [];
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => NIGHT, body: () => null, net: () => null, blocked: () => false,
    refreshFog: (lens) => { fogs.push(lens ? [...lens] : null); }, ...extra,
  });
  firearm.setView(NIGHT);
  walk.setGround(FLOOR, [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  const frame = (dt = 1 / 60): void => { walk.frame(dt); firearm.gunFrame(dt, true); firearm.kitFrame(dt, true); firearm.aimReticle(dt); };
  for (let i = 0; i < 60; i++) frame();
  return { firearm, fogs, frame };
}

/** The goggles put on: first person, then the night vision (zoom state 3 on a night map, `./zoom`). */
function gogglesOn(r: ReturnType<typeof goggleRig>): void {
  r.firearm.stepZoom('in');
  r.frame();
  r.firearm.stepZoom('in');
  r.frame();
}

describe('R4P-234: the round\'s end puts the fog\'s own colour back over the goggles\' tint (FUN_002ac270)', () => {
  it('the goggles on: the fog carries the lens; at the round\'s end it is the fog\'s own again, once, and the goggles stay on', () => {
    const r = goggleRig();
    gogglesOn(r);
    expect(r.firearm.zoom.view()).toBe('nightvision');
    expect(r.fogs.at(-1)).toEqual([...LENS]);
    const before = r.fogs.length;
    r.firearm.roundEndFog();
    expect(r.fogs.slice(before)).toEqual([null]);
    // ROUND_END_GOGGLES_READING: the goggles are not dropped -- the view stays in the night vision, and the frames after
    // do not put the tint back over the fog (the lens is re-applied only on the next change of the view).
    for (let i = 0; i < 30; i++) r.frame();
    expect(r.firearm.zoom.view()).toBe('nightvision');
    expect(r.fogs.slice(before)).toEqual([null]);
  });

  // The review's F3: the page calls both at a result, the fog's then the view's (`netPage.ts` roundEndEffects, roundEndZoom):
  // the view held at 1.0 does not put the lens back over the fog.
  it('with the view held too (R4P-234b, in the page\'s order): the fog stays its own and the goggles stay on', () => {
    const r = goggleRig();
    gogglesOn(r);
    const before = r.fogs.length;
    r.firearm.roundEndFog();
    r.firearm.roundEndView();
    for (let i = 0; i < 30; i++) r.frame();
    expect(r.fogs.slice(before)).toEqual([null]);
    expect(r.firearm.zoom.view()).toBe('nightvision');
  });

  it('the goggles off: the round\'s end changes nothing (3/3 in the capture)', () => {
    const r = goggleRig();
    const before = r.fogs.length;
    r.firearm.roundEndFog();
    expect(r.fogs.slice(before)).toEqual([]);
    expect(r.firearm.zoom.view()).not.toBe('nightvision');
  });

  it('after the round\'s end the goggles taken off and put on again tint the fog as before', () => {
    const r = goggleRig();
    gogglesOn(r);
    r.firearm.roundEndFog();
    r.firearm.stepZoom('out');
    r.frame();
    r.firearm.stepZoom('in');
    r.frame();
    expect(r.firearm.zoom.view()).toBe('nightvision');
    expect(r.fogs.at(-1)).toEqual([...LENS]);
  });

  it('names what the capture holds and what it does not', () => {
    expect(ROUND_END_GOGGLES_READING).toBe('the goggles stay on');
  });
});
