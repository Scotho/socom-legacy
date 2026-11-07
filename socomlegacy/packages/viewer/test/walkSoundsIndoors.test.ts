import { describe, expect, it, vi } from 'vitest';
import type { Grid } from '@s2u/scene';
import type { GameAudio } from '../src/audio';

/**
 * INV-RAIN, the sound's side (research 81 §9-§10, research 89 §21): `WalkSounds.frame` feeds `GameAudio.setEnvironment`
 * (the reverb's depth and the beds) from the bytes the camera's floor probe writes -- `FUN_00295b00`'s one probe
 * (D:L140037-140038) writes the camera's `+0x2b8` (`m_inside`, `FUN_002dc180`, D:L140054-140055) and `+0x2bc` (the
 * reverb zone, `FUN_002dc150`, D:L140056-140057), which the reverb reads (`FUN_00341a60` D:L241520-241521) and
 * `CAMERA_INDOORS` (66) answers. So the sound takes the effects' pick (`cameraFloor`, `FUN_002d4c20`: the highest hit at
 * or below the camera), not the actor's (`probeFloor`: up to 6 over), and keeps its last answer with no floor at or
 * below (D:L140039).
 *
 * The ground probe is stubbed with `effectsIndoors.test.ts`'s column shapes: one floor at y 0 ("inside" where x < 0), a
 * roof's walkable top at y 13 (outdoors) over an `m_inside` floor at y 0 (`ROOF_X`), and a floor 0.5 over the camera's y
 * 10 with none under it (`ABOVE_X`). The dev-disc case (MP12's (563, 1554)) is `rainDisc.test.ts`'s.
 */
const ROOF_X = -50;
const ABOVE_X = -60;
function column(x: number): { y: number; poly: { inside: number; reverbZone: number } }[] {
  if (x === ROOF_X) return [{ y: 13, poly: { inside: 0, reverbZone: 0 } }, { y: 0, poly: { inside: 1, reverbZone: 0 } }];
  if (x === ABOVE_X) return [{ y: 10.5, poly: { inside: 0, reverbZone: 0 } }];
  return [{ y: 0, poly: { inside: x < 0 ? 1 : 0, reverbZone: 0 } }];
}
vi.mock('@s2u/scene', async (original) => {
  const real = await original<typeof import('@s2u/scene')>();
  return {
    ...real,
    probeGround: (_grid: Grid, x: number) => column(x),
    probeFloor: (_grid: Grid, x: number, y: number) =>
      real.selectFloor(column(x) as unknown as Parameters<typeof real.selectFloor>[0], y + real.PROBE_LIFT, y),
  };
});

const { WalkSounds } = await import('../src/walkSounds');

const GRID = {} as Grid;

/** A `WalkSounds` over a recording audio: each `setEnvironment` call, in order. */
function sounds(): { ws: InstanceType<typeof WalkSounds>; env: [boolean, number][] } {
  const env: [boolean, number][] = [];
  const audio = { setAmbience: () => {}, setEnvironment: (inside: boolean, zone: number) => { env.push([inside, zone]); } } as unknown as GameAudio;
  const ws = new WalkSounds(audio, {
    walking: () => true, feet: () => [0, 0, 0], stance: () => 'stand', wish: () => ({ forward: 0, right: 0 }), grid: () => GRID,
  });
  return { ws, env };
}

describe("WalkSounds.frame: the camera's own floor pick (FUN_00295b00 -> FUN_002d4c20), as the effects' 66", () => {
  it('a camera 3 under a roof top over an m_inside floor is indoors (the actor pick took the roof: outdoors)', () => {
    const { ws, env } = sounds();
    ws.frame([ROOF_X, 10, 0]);
    expect(env).toEqual([[true, 0]]);
  });

  it('in the open, outdoors; over an inside floor, indoors', () => {
    const { ws, env } = sounds();
    ws.frame([10, 20, 0]);
    ws.frame([-10, 20, 0]);
    expect(env).toEqual([[false, 0], [true, 0]]);
  });

  it('no floor at or below the camera (one 0.5 over it) writes nothing: the last answer stands', () => {
    const { ws, env } = sounds();
    ws.frame([-10, 20, 0]);                    // indoors
    ws.frame([ABOVE_X, 10, 0]);                // the over floor is not taken: nothing written
    expect(env).toEqual([[true, 0]]);
    ws.frame([10, 20, 0]);                     // outdoors
    ws.frame([ABOVE_X, 10, 0]);
    expect(env).toEqual([[true, 0], [false, 0]]);
  });
});
