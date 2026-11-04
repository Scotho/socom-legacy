// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { Button, type Command } from '../src/net/protocol';

/**
 * LATER 249's page premise (`roomTurretMountAtCommand.test.ts`' `pageFrames`, its `sends`): the walk runs the engine's
 * 60 Hz ticks off the frame's time, and sends one command a tick (`setNetTap`) -- so a page drawing above 60 Hz runs
 * frames that send no command. At 120 Hz every other frame sends (0, 1, 0, 1, ...); at 144 Hz two frames in a row can
 * send none. Such a frame's lanes and its `fireFrame` name `NetClient.lastSeq()`, the command an earlier frame sent.
 */

/** A flat ground polygon (`m_ditype` 3: bits 0 and 1), world space (`walk.test.ts`' own). */
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(-200, -200, 200, 200, 0)],
  [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }],
);

describe('LATER 249: the walk sends one command a 60 Hz tick, so a frame above 60 Hz may send none', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

  it('lays the native initial secondary on the mover and outgoing commands without a shoulder press', () => {
    const fly = new FlyCamera(canvas());
    const mode = new WalkMode(fly);
    made.push(mode);
    mode.setGround(GROUND, [150, 0, 150]);
    expect(mode.respawn([150, 1, 150], 0)).toBe(true);
    const sent: Omit<Command, 'seq'>[] = [];
    mode.setNetTap((cmd) => { sent.push(cmd); });
    mode.placeFirearm(1);
    mode.frame(1 / 60);
    expect(sent.at(-1)!.weapon).toBe(1);
    expect(sent.at(-1)!.buttons & Button.Swap).toBe(0);
    expect(mode.swapProgress()).toBeNull();
    mode.placeFirearm(0);
    mode.frame(1 / 60);
    expect(sent.at(-1)!.weapon).toBe(0);
  });

  /** The commands each of `frames` frames of `dt` sent, on a walking mode with a net tap. */
  const sendsPerFrame = (dt: number, frames: number): number[] => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined);
    mode.setGround(GROUND, [150, 0, 150]);
    mode.bindKey();
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    expect(mode.setMode('walk')).toBe(true);
    let sent = 0;
    mode.setNetTap(() => { sent++; });
    const out: number[] = [];
    for (let i = 0; i < frames; i++) {
      const before = sent;
      fly.update(dt);
      mode.frame(dt);
      out.push(sent - before);
    }
    return out;
  };

  it('WalkMode.frame(1/120): 0, 1, 0, 1, ... -- every other frame sends no command', () => {
    expect(sendsPerFrame(1 / 120, 8)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('WalkMode.frame(1/144): at most one a frame, 60 over 144 frames give or take one, and two frames in a row with none', () => {
    const s = sendsPerFrame(1 / 144, 144);
    expect(Math.max(...s)).toBe(1);
    expect(Math.abs(s.reduce((a, b) => a + b, 0) - 60)).toBeLessThanOrEqual(1);
    expect(s.join('')).toContain('100');
  });
});
