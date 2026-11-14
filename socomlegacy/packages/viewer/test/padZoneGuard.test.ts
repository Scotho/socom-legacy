// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ControllerInput, calibrateStick } from '../src/controllerInput';
import { mergeInput, noInput, padInput, padRaw, padStick, PAD_DEAD_ZONE } from '../src/gamepad';
import { feedCamera, type CameraLanes } from '../src/matchCore';
import { moveStick } from '../src/moveStick';
import { FlyCamera } from '../src/camera';

/**
 * PZG (V21, simulation track; 67's brief 2026-11-13 from the reporting player's drift, finding 14): the browser's "Pad
 * dead zone (this browser)" is a pure drift guard. Inside the zone the game receives zero; past it the game receives the
 * push unchanged -- no floor, no rescale of ours -- at every setting, 0 and the default included. The stages, raw axes to
 * what the original's pad reader takes (`FUN_002da930`, D:L179580-179633, its own per-axis zone `moveStick`/`deadZone`):
 *   S0 the pad's raw axes -> S1 `ControllerInput.poll` (`calibrateStick`) -> S2 `padInput` (the shaped pair, `padStick`)
 *   -> S3 `padRaw` with the pair's zone (the push the game reads) -> S4 the original's zone and circle (`moveStick`).
 * Before PZG, a zone under the default floored every push past it at 0.15 (0.15 + 0.85 (d - z) / (1 - z)): at zone 0 a
 * 0.086-an-axis drift reached the game as 0.179 an axis and crept past SEAL's 0.16.
 */
const device = (): { index: number; id: string; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] } => ({
  index: 0, id: 'Pad 0', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});

/** S0 -> S3: the raw left stick (x right, y down) through the reader at `zone`; the stages the test pins. */
function stages(rawX: number, rawY: number, zone: number) {
  const a = device(), input = new ControllerInput();
  input.poll({ getGamepads: () => [a] });              // the first poll loads the pad's profile (its saved zone)
  input.config.deadZone = zone;
  a.axes = [rawX, rawY, 0, 0];
  const polled = input.poll({ getGamepads: () => [a] })!;
  const s1 = [polled.axes[0]!, polled.axes[1]!] as const;
  const s2 = padInput(polled);
  const s3 = padRaw(s2.moveX, s2.moveY, s2.moveZone);
  return { s1, s2, s3 };
}

const SEAL_ZONE = 0.16;   // SEAL's (and SAILOR's) per-axis zone, `./look` `deadZone` (finding 14: he turns at SEAL's rate)
const close = (got: readonly number[], want: readonly number[], digits = 12): void => {
  expect(got.length).toBe(want.length);
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, digits));
};

describe('PZG: the browser pad dead zone is a pure drift guard', () => {
  const pairs: [number, number][] = [[0.05, 0], [0.1, -0.12], [0.2, 0.1], [0.086, 0.086], [0.5, 0.2], [-0.8, 0.4], [0, -1], [1, 0], [1, 1], [-1, 1]];

  it('the default (15 %) is unchanged at every stage: S1 identity, S2 the 0.15 adapter, S3 its inverse', () => {
    expect(PAD_DEAD_ZONE).toBe(0.15);
    for (const [x, y] of pairs) {
      const { s1, s2, s3 } = stages(x, y, PAD_DEAD_ZONE);
      expect(s1).toEqual([x, y]);
      const shaped = padStick(x, y);
      expect([s2.moveX, s2.moveY]).toEqual([shaped.x, shaped.y]);
      expect(s3).toEqual(padRaw(shaped.x, shaped.y));     // byte for byte what the game read before PZG
    }
  });

  for (const zone of [0, 0.08, 0.3]) {
    it(`zone ${zone}: inside it the game receives zero, past it the push unchanged (no floor, no rescale)`, () => {
      for (const [x, y] of pairs) {
        const d = Math.hypot(x, y);
        const { s1, s2, s3 } = stages(x, y, zone);
        if (d <= zone) {
          expect(s1).toEqual([0, 0]);
          expect(s3).toEqual([0, 0]);
        } else {
          expect(s1).toEqual([x, y]);                       // S1: what the menus' own readers take, the push itself
          close(s3, [x, -y]);                               // S3: what the game's pad reader takes, y up
          // S2: the shaped pair the fly camera, the spectator and the replays read -- what it was before PZG at this zone.
          close([Math.hypot(s2.moveX, s2.moveY)], [(d - zone) / (1 - zone)]);
        }
      }
    });
  }

  it('the full push is unchanged at every zone, the corners included', () => {
    for (const zone of [0, 0.08, PAD_DEAD_ZONE, 0.3, 0.4]) {
      for (const [x, y] of [[1, 0], [0, -1], [1, 1], [-1, 1], [1, -1]] as [number, number][]) close(stages(x, y, zone).s3, [x, -y]);
    }
  });

  it('finding 14\'s fixture: a resting drift of 0.086 an axis at zone 0 gives SEAL\'s ground stick nothing (it crept before)', () => {
    const { s3 } = stages(0.086, 0.086, 0);
    close(s3, [0.086, -0.086]);
    expect(moveStick(s3[0], s3[1], SEAL_ZONE)).toEqual([0, 0]);
    // The default guards it too, as it did before.
    const def = stages(0.086, 0.086, PAD_DEAD_ZONE).s3;
    expect(moveStick(def[0], def[1], SEAL_ZONE)).toEqual([0, 0]);
  });

  it('a push between the zone and 0.15 reaches the game as itself (zone 0.08, push 0.1): the old floor gave 0.15', () => {
    close(stages(0.1, 0, 0.08).s3, [0.1, 0]);
  });

  it('calibrateStick: identity at the default; elsewhere zero inside the zone and the pair itself past it', () => {
    expect(calibrateStick(0.1, -0.12, PAD_DEAD_ZONE)).toEqual([0.1, -0.12]);
    expect(calibrateStick(0.05, 0, 0.08)).toEqual([0, 0]);
    expect(calibrateStick(0.08, 0, 0.08)).toEqual([0, 0]);
    expect(calibrateStick(0.1, 0, 0.08)).toEqual([0.1, 0]);
    expect(calibrateStick(0.01, 0, 0)).toEqual([0.01, 0]);
    expect(calibrateStick(0, 0, 0)).toEqual([0, 0]);
  });

  it('the look stick carries its zone the same way', () => {
    const a = device(), input = new ControllerInput();
    input.poll({ getGamepads: () => [a] });
    input.config.deadZone = 0;
    a.axes = [0, 0, 0.1, -0.05];
    const s2 = padInput(input.poll({ getGamepads: () => [a] })!);
    expect(s2.lookZone).toBe(0);
    close(padRaw(s2.lookX, s2.lookY, s2.lookZone), [0.1, 0.05]);
  });

  it('mergeInput keeps the zone of the source whose pair is the larger; a source without one is the default', () => {
    const pad = { ...noInput(), moveX: 0.3, moveY: 0, moveZone: 0, lookX: 0.1, lookY: 0, lookZone: 0 };
    const touch = { ...noInput(), moveX: 0, moveY: 0, lookX: 0.6, lookY: 0 };
    const m = mergeInput(touch, pad);
    expect(m.moveZone).toBe(0);
    expect(m.lookZone).toBeUndefined();
    expect(mergeInput(noInput()).moveZone).toBeUndefined();
  });

  it('the camera takes the zone with the pair: feedCamera hands it on, groundWish reads the push through it', () => {
    const lanes: CameraLanes = { setStick: vi.fn(), setLift: vi.fn(), setStickBoost: vi.fn(), setLook: vi.fn() };
    feedCamera(lanes, { ...noInput(), moveX: 0.2, moveY: 0.1, moveZone: 0, lookX: -0.3, lookY: 0, lookZone: 0.3 }, () => false);
    expect(lanes.setStick).toHaveBeenCalledWith(0.2, 0.1, 0);
    expect(lanes.setLook).toHaveBeenCalledWith(-0.3, 0, 0.3);

    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const g = fly.lookOptions().stick.deadZone;
    fly.setStick(0.5, 0, 0);
    expect(fly.groundWish().right).toBeCloseTo(moveStick(0.5, 0, g)[0], 12);
    fly.setStick(0.5, 0);                                   // no zone: the default adapter's inverse, as before
    expect(fly.groundWish().right).toBeCloseTo(moveStick(...padRaw(0.5, 0), g)[0], 12);
  });
});

describe('PZG: the zone says what it does', () => {
  it('the help: it ignores stick drift and does not change the game\u2019s response', async () => {
    const { PAD_DEAD_ZONE_ABOUT, PAD_DEAD_ZONE_LABEL } = await import('../src/console/render/remap');
    expect(PAD_DEAD_ZONE_LABEL).toBe('Pad dead zone (this browser)');
    expect(PAD_DEAD_ZONE_ABOUT.startsWith('Ignores stick drift; does not change the game\u2019s response.')).toBe(true);
  });
});

describe('PZG review: every config, the camera\'s look, the Cross seam', () => {
  /** S0 -> S3 under a named config: the four raw axes through the reader at `zone`, then the config's move and look pairs. */
  async function configStages(name: string, axes: number[], zone: number) {
    const { controllerConfigs } = await import('../src/controllerConfigs');
    const { padMapInput, padMapOf } = await import('../src/gamepad');
    expect(controllerConfigs.select(name)).toBe(true);
    try {
      const a = device(), input = new ControllerInput();
      input.poll({ getGamepads: () => [a] });
      input.config.deadZone = zone;
      a.axes = axes;
      const s2 = padMapInput(input.poll({ getGamepads: () => [a] })!, padMapOf(controllerConfigs.record()));
      return { move: padRaw(s2.moveX, s2.moveY, s2.moveZone), look: padRaw(s2.lookX, s2.lookY, s2.lookZone) };
    } finally { controllerConfigs.select('Default'); }
  }

  it('F1: Config4 mixes the sticks in its pairs; a stick past the zone reaches the game as itself, at zone 0.3 and 0', async () => {
    // Config4: move = (right x, left y), look = (left x, right y). The left stick at (0.25, 0.25), 0.354 long, passes 0.3.
    const at3 = await configStages('Config4', [0.25, 0.25, 0, 0], 0.3);
    close(at3.move, [0, -0.25]);
    close(at3.look, [0.25, 0]);
    const at0 = await configStages('Config4', [0.05, 0.02, 0.01, 0], 0);
    close(at0.move, [0.01, -0.02]);
    close(at0.look, [0.05, 0]);
    // A stick inside the zone gives nothing on either pair.
    const inside = await configStages('Config4', [0.2, 0.2, 0, 0], 0.3);
    close(inside.move, [0, 0]);
    close(inside.look, [0, 0]);
  });

  it('F1: Reverse (each pair one stick) is shaped at the zone as Default is, and its push is the stick\'s own', async () => {
    const r = await configStages('Reverse', [0.25, 0.25, 0.1, 0], 0.08);
    close(r.move, [0.1, 0]);
    close(r.look, [0.25, -0.25]);
  });

  it('F3: the walk\'s look reads the right stick\'s push through its zone (camera.ts walkLook)', () => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const turn = (zone?: number): number => {
      const fly = new FlyCamera(c);
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      fly.setWalking(true);
      fly.setLookOptions({ stick: { ...fly.lookOptions().stick, deadZone: SEAL_ZONE } });
      if (zone === undefined) fly.setLook(0.05, 0); else fly.setLook(0.05, 0, zone);
      for (let k = 0; k < 30; k++) fly.update(1 / 60);
      return fly.pose().yaw;
    };
    expect(turn(0)).toBe(0);                 // shaped at zone 0: a push of 0.05, under SEAL's 0.16
    expect(turn()).not.toBe(0);              // the default's inverse: 0.15 + 0.85 x 0.05 = 0.19, past it
  });

  it('F2: a Cross held through a toast keeps the pad zone (setupPad crossThroughSeam)', async () => {
    const { GamePad, takeCrossPress } = await import('../src/setupPad');
    const g = new GamePad(), a = device(), src = { getGamepads: () => [a] };
    g.poll(src);
    g.input.config.deadZone = 0.05;
    const release = takeCrossPress(() => undefined);
    try {
      g.poll(src);                                          // Cross up: the take is armed
      a.buttons[0] = { pressed: true, value: 1 };
      const read = g.poll(src) as { buttons: { pressed: boolean }[]; stickZone?: number } | null;
      expect(read?.buttons[0]?.pressed).toBe(false);        // the taken Cross is masked from the game
      expect(read?.stickZone).toBe(0.05);
    } finally {
      release();
      a.buttons[0] = { pressed: false, value: 0 };
      g.poll(src);
    }
  });
});
