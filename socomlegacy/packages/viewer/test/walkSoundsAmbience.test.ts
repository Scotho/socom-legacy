import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { Grid } from '@s2u/scene';
import { GameAudio } from '../src/audio';

/**
 * AMB-1 (the owner's report, 2026-11-07 17:20Z, v0.4.12: the ambience heard in one dead spectator view and silent in
 * the other, the footsteps heard in both). The original (research 81 §10, "The beds"; reading): the common
 * `check_camera_inside_state1` is an activation-1 script -- it starts with the mission -- and loops for the whole
 * mission, swapping `outside_noise` / `inside_noise` on `PLAYER_INDOORS` (72) / `CAMERA_INDOORS` (66); the emitters are
 * activation-1 animations too. No source read stops them on a death or on a change of view. So in a match the beds play
 * from the first frame to the teardown in every view -- alive, dead on the own body, spectating a teammate (the walk in
 * fly mode: `NetPage`'s `leaveSelf` -> `setMode('fly')`), a ghost -- and the camera of that view still picks the side
 * (`setEnvironment`, `FUN_00295b00` -> `cameraFloor`). The port's former gate, `setAmbience(walk.mode() === 'walk')`,
 * has no original; the test room's free-fly map viewer, outside a match, keeps the beds off
 * (`TESTROOM_FLY_AMBIENCE_ADAPTATION`). `audio.test.ts` "ramps the reverb ... crosses the beds" pins
 * `setAmbience(false)` stopping every loop (the adaptation's off; a match's teardown stops them through
 * `MatchSound.dispose` -> `setData(null)`). Unit tests only; no browser is run.
 */

/** The camera's floor: "inside" where x < 0 (the pick itself is `walkSoundsIndoors.test.ts`'s). */
vi.mock('../src/floorPick', async (original) => ({
  ...(await original<typeof import('../src/floorPick')>()),
  cameraFloor: (_grid: Grid, x: number) => ({ y: 0, poly: { inside: x < 0 ? 1 : 0, reverbZone: 0 } }),
}));

const { WalkSounds, TESTROOM_FLY_AMBIENCE_ADAPTATION } = await import('../src/walkSounds');
const { mountSound, silentOut } = await import('../src/matchSound');

const GRID = {} as Grid;

function recording() {
  const ambience: boolean[] = [], env: [boolean, number][] = [];
  const audio = {
    setAmbience: (on: boolean) => { ambience.push(on); },
    setEnvironment: (inside: boolean, zone: number) => { env.push([inside, zone]); },
  } as unknown as GameAudio;
  return { audio, ambience, env };
}

describe('WalkSounds.frame: the beds through the whole match (research 81 §10)', () => {
  it('not walking (a spectator view: fly mode) with a camera: the ambience on and the side set by the camera', () => {
    const { audio, ambience, env } = recording();
    const ws = new WalkSounds(audio, {
      walking: () => false, feet: () => null, stance: () => 'stand', wish: () => ({ forward: 0, right: 0 }),
      grid: () => null, sceneGrid: () => GRID,
    });
    ws.frame([-10, 5, 0]);
    ws.frame([10, 5, 0]);
    expect(ambience).toEqual([true, true]);
    expect(env).toEqual([[true, 0], [false, 0]]);
  });

  it('TESTROOM_FLY_AMBIENCE_ADAPTATION: the test room free-fly viewer, outside a match, keeps the beds off', () => {
    expect(TESTROOM_FLY_AMBIENCE_ADAPTATION).toBe('off');
    const { audio, ambience, env } = recording();
    const ws = new WalkSounds(audio, {
      walking: () => false, feet: () => null, stance: () => 'stand', wish: () => ({ forward: 0, right: 0 }),
      grid: () => null, sceneGrid: () => GRID, ambienceOff: () => true,
    });
    ws.frame([-10, 5, 0]);
    expect(ambience).toEqual([false]);
    expect(env).toEqual([]);
  });
});

describe('mountSound: the dead cycle keeps the beds (leaveSelf -> fly, resumeBody -> walk)', () => {
  /** A walk as `WalkMode` answers: `grid()` only while walking, `gridOfGround()` always (`walk.ts`). */
  function match(ambienceOff?: () => boolean) {
    let mode: 'walk' | 'fly' = 'walk';
    const audio = new GameAudio(silentOut(), () => 0.5, { inline: false });
    const on = vi.spyOn(audio, 'setAmbience'), env = vi.spyOn(audio, 'setEnvironment');
    const walk = {
      mode: () => mode, drawnFeet: (): [number, number, number] => [0, 0, 0], posture: () => 'stand' as const,
      grid: () => (mode === 'walk' ? GRID : null), gridOfGround: () => GRID,
    };
    const sound = mountSound({
      audio, walk, fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) }, loadouts: { type: () => 1 },
      side: () => 'seal', ...(ambienceOff ? { ambienceOff } : {}),
    });
    const camera = new PerspectiveCamera();
    const frame = (x: number): void => { camera.position.set(x, 5, 0); camera.updateMatrixWorld(); sound.frame(camera, null); };
    return { setMode: (m: 'walk' | 'fly') => { mode = m; }, frame, on, env };
  }

  it('own body, a teammate (fly), the own body again: the ambience never off, the side by each view\'s camera', () => {
    const m = match();
    m.frame(10);                       // alive / dead on the own body: outdoors
    m.setMode('fly');                  // DEAD-CYCLE: leaveSelf -> setMode('fly'), the teammate's camera
    m.frame(-10);                      // the teammate indoors: the inside bed
    m.frame(-10);
    m.setMode('walk');                 // resumeBody: the own body again
    m.frame(10);
    expect(m.on.mock.calls.map((c) => c[0])).toEqual([true, true, true, true]);
    expect(m.env.mock.calls).toEqual([[false, 0], [true, 0], [true, 0], [false, 0]]);
  });

  it('the test room free-fly viewer (its adaptation asked): off in fly, on walking', () => {
    let off = false;
    const m = match(() => off);
    m.frame(10);
    off = true;
    m.setMode('fly');
    m.frame(10);
    expect(m.on.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});
