// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode, type PlaySnapshot } from '../src/walk';
import type { LoadedMap } from '../src/loadMap';

/**
 * R4P-234b (`ROUND_END_CAMERA_FOV_READING`, research 84 §7.3; r0004 the specification; a reading held by FORCED captures
 * of the original, Q234C and Q234D): at the round's end -- the page's `ROUND_END_EFFECTS` moment, `NetPage.sweepDrops`,
 * `ENGINE_READ_S` after the `roundOver` -- the view drawn goes to magnification 1.0 while the zoom state (the goggles'
 * 3, a scope's 5) is kept; it stays at 1.0, no zoom input changes it, and the next set-up (`spawnKit`'s `Zoom.respawn`)
 * ends it. Asserted on what the page draws: the camera's vertical FOV and the render view's magnification.
 */

afterEach(() => { vi.restoreAllMocks(); });

const DT = 1 / 60;
const STILL = { stance: 'stand', vx: 0, vy: 0, vz: 0, airborne: false } as unknown as PlaySnapshot;

function rig(extra: Partial<MatchFirearmDeps> = {}) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const firearm = mountFirearm({
    scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, ...extra,
  });
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  vi.spyOn(walk, 'snapshot').mockReturnValue(STILL);
  /** `seconds` of the page's frames (`gunFrame`: the zoom's run and the FOV it writes). */
  const run = (seconds: number): void => { for (let t = 0; t < seconds; t += DT) firearm.gunFrame(DT, true); };
  /** The vertical FOV the camera draws with, degrees. */
  const fov = (): number => fly.camera.fov;
  return { fly, walk, firearm, run, fov };
}

/** tan(half the base FOV) / tan(half the drawn FOV): the magnification on screen, as the camera draws it. */
const drawnMag = (base: number, drawn: number): number => Math.tan((base * Math.PI) / 360) / Math.tan((drawn * Math.PI) / 360);

describe('ROUND_END_CAMERA_FOV_READING: the round end unzooms the view, the zoom state kept, till the next set-up', () => {
  it('the goggles (state 3, 1.01): the view to 1.0 at the round end, the state kept; d-pad presses change nothing', () => {
    const { firearm, run, fov } = rig();
    firearm.setView({ night: { mission: true, lens: null } } as unknown as LoadedMap);   // NightMission: Up steps into the goggles
    const base = firearm.baseFov();
    expect(firearm.stepZoom('in')).toBe(1);
    expect(firearm.stepZoom('in')).toBe(3);
    run(1);
    expect(firearm.zoom.magnification()).toBeCloseTo(1.01, 6);
    expect(drawnMag(base, fov())).toBeCloseTo(1.01, 6);                    // the control: the goggles drawn at 1.01

    firearm.roundEndView();
    run(DT);
    expect(fov()).toBeCloseTo(base, 6);                                    // drawn at zoom 1.0 (Q234C: +0x470/+0x474 -> 1)
    expect(firearm.renderView().magnification).toBe(1);
    expect(firearm.zoom.state()).toBe(3);                                  // the goggles stay on (Q234B/C: +0x200 kept)
    expect(firearm.zoom.target()).toBeCloseTo(1.01, 6);                    // the target kept (DAT_004074c0 1.01)
    run(3);
    expect(fov()).toBeCloseTo(base, 6);                                    // no later frame re-applies it (frames 1-5, 3 s)

    for (const how of ['in', 'out', 'cycle'] as const) expect(firearm.stepZoom(how)).toBe(3);   // Q234D: presses refused
    run(1);
    expect(firearm.zoom.state()).toBe(3);
    expect(fov()).toBeCloseTo(base, 6);
    expect(firearm.renderView().magnification).toBe(1);
  });

  it('a scope (state 5, 3.0): the view to 1.0, the scope state and its 3.0 kept; the next set-up ends the hold', () => {
    const { firearm, run, fov } = rig();
    const base = firearm.baseFov();
    expect(firearm.stepZoom('in')).toBe(1);
    expect(firearm.stepZoom('in')).toBe(5);                                // the baked M4's ZoomMode1 3.0
    run(1);
    expect(drawnMag(base, fov())).toBeCloseTo(3, 6);

    firearm.roundEndView();
    run(DT);
    expect(fov()).toBeCloseTo(base, 6);
    expect(firearm.zoom.state()).toBe(5);
    expect(firearm.zoom.target()).toBeCloseTo(3, 6);
    expect(firearm.stepZoom('out')).toBe(5);
    expect(firearm.stepZoom('in')).toBe(5);
    run(2);
    expect(fov()).toBeCloseTo(base, 6);

    // The next set-up (the round's spawn: `FUN_00599b60` -> `FUN_00553ea0`, `Zoom.respawn`): third person at 1.0, and
    // the zoom steps and draws again.
    firearm.spawnKit('seal', null);
    run(DT);
    expect(firearm.zoom.state()).toBe(0);
    expect(fov()).toBeCloseTo(base, 6);
    expect(firearm.stepZoom('in')).toBe(1);
    expect(firearm.stepZoom('in')).toBe(5);
    run(1);
    expect(drawnMag(base, fov())).toBeCloseTo(3, 6);                       // the normal zoom back
  });

  it('a zoom still running at the call: the view restarts at 1.0 and eases on to the kept target (F1)', () => {
    // r0004: neither 0x2ac270 nor 0x29c7f0 writes the rate `DAT_00435608`; only the step 0x1f0490 zeroes it, on arrival
    // (0x1f05b0, 0x1f05e0). So a run not yet settled resumes from the camera's `S+0x470` (now 1.0) toward the kept
    // target `DAT_004074c0` (research 84 §7.3; a reading from the bytes, unmeasured: Q234C/Q234D ran settled zooms).
    const { firearm, run, fov } = rig();
    const base = firearm.baseFov();
    expect(firearm.stepZoom('in')).toBe(1);
    expect(firearm.stepZoom('in')).toBe(5);                                // the run toward 3.0 starts (9 a second)
    run(3 * DT);
    const before = drawnMag(base, fov());
    expect(before).toBeGreaterThan(1.01);
    expect(before).toBeLessThan(3);                                        // the control: still running

    firearm.roundEndView();
    expect(firearm.zoom.magnification()).toBe(1);                          // the call: the view to 1.0
    run(DT);
    const first = drawnMag(base, fov());
    expect(first).toBeGreaterThan(1);                                      // the run goes on from 1.0 ...
    expect(first).toBeLessThan(before);                                    // ... restarted, not where it was
    run(1);
    expect(drawnMag(base, fov())).toBeCloseTo(3, 6);                       // ... and arrives at the kept 3.0
    expect(firearm.zoom.state()).toBe(5);
    expect(firearm.stepZoom('out')).toBe(5);                               // presses still refused
    run(1);
    expect(drawnMag(base, fov())).toBeCloseTo(3, 6);                       // arrived: the rate 0, it stays
  });

  it('a new map ends the hold too (`setView`, the zoom reset)', () => {
    const { firearm, run, fov } = rig();
    firearm.stepZoom('in');
    firearm.roundEndView();
    run(DT);
    expect(firearm.stepZoom('in')).toBe(1);                                // refused: still first person
    firearm.setView({} as unknown as LoadedMap);
    const base = firearm.baseFov();
    expect(firearm.stepZoom('in')).toBe(1);
    expect(firearm.stepZoom('in')).toBe(5);
    run(1);
    expect(drawnMag(base, fov())).toBeCloseTo(3, 6);
  });
});
