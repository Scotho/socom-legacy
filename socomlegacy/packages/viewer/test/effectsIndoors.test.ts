import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { EffectCondition, EffectProgram, Grid, ParticleSource } from '@s2u/scene';
import type { EffectData } from '../src/effectData';

/**
 * INV-RAIN F3 (research 89 §21; research 81 §10): the effect runner's set 0 `CAMERA_INDOORS` (66) and `PLAYER_INDOORS`
 * (72) answered from the floor's `m_inside` -- 66 the floor under the camera's place (`FUN_00295b00` D:L140037-140055,
 * the byte `FUN_002dc180` reads), 72 the floor under the player's feet (`PLAYER_INDOORS_FEET_READING`), 0 with no
 * player. Was: both unread (`ZANIM_UNREAD_OPERAND_PLACEHOLDER`), false everywhere -- MP12's near rain under every roof,
 * its far curtain never.
 *
 * The ground probe is stubbed: the column under (x, z) is `column(x)` -- one floor at y 0, "inside" where x < 0, and two
 * hand-built columns for the camera's own pick (`ROOF_X`, `ABOVE_X`); `probeFloor` (the actor's pick, the feet's) runs
 * the real `selectFloor` over the same column (the dev-disc cases, `g372_1` on MP12 and a roof over an `m_inside` floor,
 * are `rainDisc.test.ts`'s).
 */
/** A roof's walkable top at y 12 (outdoors) over an `m_inside` floor at y 0: the camera (`camAt`, y 10) is under it. */
const ROOF_X = -50;
/** A floor only 0.5 over the camera's y 10 and none under it: the camera's pick finds nothing at or below. */
const ABOVE_X = -60;
function column(x: number): { y: number; poly: { inside: number } }[] {
  if (Number.isNaN(x)) return [];
  if (x === ROOF_X) return [{ y: 12, poly: { inside: 0 } }, { y: 0, poly: { inside: 1 } }];
  if (x === ABOVE_X) return [{ y: 10.5, poly: { inside: 0 } }];
  return [{ y: 0, poly: { inside: x < 0 ? 1 : 0 } }];
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

const { CAMERA_FLOOR_ABOVE, Effects, PLAYER_INDOORS_FEET_READING } = await import('../src/effects');
const { indoorsOperand, ZANIM_UNREAD_OPERAND_PLACEHOLDER } = await import('../src/effectRunner');

const GRID = {} as Grid;

function source(name: string, flagsA: number, setActive: boolean): ParticleSource {
  return {
    flagsA, flagsB: 0, name, setActive, node: -6, follow: false, perEvent: 1, events: -1, interval: flagsA > 3 ? 0.01 : null,
    perDistance: false, type: flagsA > 3 ? 3 : 4, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0],
    worldVelocity: [0, -45, 0], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]],
    accel: [0, 0, 0], friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [1, 1], nearFade: null, farFade: null, textures: [],
    textureMode: 'first', texture: null, colours: [], scales: [],
  };
}

/** MP12's `rain_falling` in shape: two sources made on, then a WHILE that tests one operand each frame. */
function rainFalling(test: EffectCondition): EffectProgram {
  const p = (name: string, on: boolean) => ({ op: 'particles' as const, source: source(name, on ? 0x3 : 0x1, on) });
  return {
    name: 'rain_falling', root: 0, flags: 0, nodes: ['NA'],
    sequences: [
      { name: 'NA', activation: 1, ops: [{ op: 'particles', source: source('rain_falling1', 0x158fb8d7 | 0x3, true) }] },
      { name: 'NA', activation: 1, ops: [{ op: 'particles', source: source('rain_falling2', 0x158fb8d7 | 0x3, true) }] },
      { name: 'NA', activation: 1, ops: [
        { op: 'while', forever: true },
        { op: 'if', conditions: [test] }, p('rain_falling1', false), p('rain_falling2', true),
        { op: 'else' }, p('rain_falling1', true), p('rain_falling2', false), { op: 'endif' },
        { op: 'wait', seconds: 0, range: 0, frames: 0 },
        { op: 'endWhile' },
      ] },
    ],
  };
}

const data = (program: EffectProgram): EffectData => ({
  archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [program.name], sceneNodes: [], hitAnims: [], missing: [], programs: [program],
});

/** The sources switched on, by name. */
function on(fx: InstanceType<typeof Effects>): string[] {
  const ps = (fx as unknown as { particles: { sources: Map<string, { config: ParticleSource; active: boolean }> } }).particles;
  return [...ps.sources.values()].filter((s) => s.active).map((s) => s.config.name).sort();
}

const camAt = (x: number): PerspectiveCamera => {
  const c = new PerspectiveCamera();
  c.position.set(x, 10, 0);
  c.updateMatrixWorld();
  return c;
};

describe('set 0 commands 66 and 72 answered from the floor (INV-RAIN F3)', () => {
  it('names the stand-in, and narrows the unread operands to the rest', () => {
    expect(PLAYER_INDOORS_FEET_READING).toBe('feetFloorInside');
    expect(ZANIM_UNREAD_OPERAND_PLACEHOLDER).toBe('decidedElseFalse');
    expect(indoorsOperand({ kind: 'other', set: 0, cmd: 66 })).toBe('camera');
    expect(indoorsOperand({ kind: 'other', set: 0, cmd: 72 })).toBe('player');
    expect(indoorsOperand({ kind: 'other', set: 0, cmd: 70 })).toBeNull();
    expect(indoorsOperand({ kind: 'other', set: 2, cmd: 72 })).toBeNull();
  });

  it('72 (PLAYER_INDOORS): the player indoors runs the far source and stops the near one; in the open, the reverse', () => {
    const fx = new Effects(() => 0.5);
    let feet: [number, number, number] | null = [-5, 0, 0];
    fx.setWorld(() => GRID);
    fx.setPlayer(() => feet);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 72 })));
    fx.update(1 / 30, camAt(5));                        // the camera outside: 72 is the player's floor, not the camera's
    expect(on(fx)).toEqual(['rain_falling2']);
    feet = [5, 0, 0];
    fx.update(1 / 30, camAt(-5));
    expect(on(fx)).toEqual(['rain_falling1']);
    // A living player whose feet the walk does not give (`Walk.feet` null: fly mode, a dead page watching): the bit
    // keeps its value while the player object lives (the review's F4) -- indoors kept here.
    feet = [-5, 0, 0];
    fx.update(1 / 30, camAt(5));
    expect(on(fx)).toEqual(['rain_falling2']);
    feet = null;
    fx.update(1 / 30, camAt(5));
    expect(on(fx)).toEqual(['rain_falling2']);
    // No player at all (`setPlayer(null)`: the free camera's page): the tick's 0, outdoors.
    fx.setPlayer(null);
    fx.update(1 / 30, camAt(-5));
    expect(on(fx)).toEqual(['rain_falling1']);
  });

  it('66 (CAMERA_INDOORS): the floor under the camera; the last answer kept where none is found', () => {
    const fx = new Effects(() => 0.5);
    fx.setWorld(() => GRID);
    fx.setPlayer(() => [5, 0, 0]);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 66 })));
    fx.update(1 / 30, camAt(-5));
    expect(on(fx)).toEqual(['rain_falling2']);
    fx.update(1 / 30, camAt(5));
    expect(on(fx)).toEqual(['rain_falling1']);
    fx.update(1 / 30, camAt(-5));
    fx.update(1 / 30, camAt(Number.NaN));               // no floor found: kept indoors
    expect(on(fx)).toEqual(['rain_falling2']);
  });

  it("66's pick is the camera's own (FUN_002d4c20): the highest floor at or below the camera, CAMERA_FLOOR_ABOVE over it", () => {
    const fx = new Effects(() => 0.5);
    fx.setWorld(() => GRID);
    fx.setPlayer(() => [5, 0, 0]);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 66 })));
    // Two units under a roof's walkable top over an inside floor: the floor below, indoors. The actor's pick (up to 6
    // over the point) took the roof and answered outdoors -- the rain under the roof.
    fx.update(1 / 30, camAt(ROOF_X));
    expect(on(fx)).toEqual(['rain_falling2']);
    expect(CAMERA_FLOOR_ABOVE).toBe(0);
  });

  it('66: a floor only over the camera is not taken, and with none at or below the last answer stands', () => {
    const fx = new Effects(() => 0.5);
    fx.setWorld(() => GRID);
    fx.setPlayer(() => [5, 0, 0]);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 66 })));
    fx.update(1 / 30, camAt(-5));                        // indoors
    expect(on(fx)).toEqual(['rain_falling2']);
    // A floor 0.5 over the camera (outdoors) and nothing under it: no hit (FUN_002d4c20 returns 0, D:L140039), the byte
    // kept -- indoors still. The actor's pick took the floor over the point (within 6) and answered outdoors.
    fx.update(1 / 30, camAt(ABOVE_X));
    expect(on(fx)).toEqual(['rain_falling2']);
    fx.update(1 / 30, camAt(5));                         // outdoors: the floor at y 0 under it
    fx.update(1 / 30, camAt(ABOVE_X));                   // kept outdoors
    expect(on(fx)).toEqual(['rain_falling1']);
  });

  it('set 0 command 70 stays unread: its IF reads false, the near source runs', () => {
    const fx = new Effects(() => 0.5);
    fx.setWorld(() => GRID);
    fx.setPlayer(() => [-5, 0, 0]);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 70 })));
    fx.update(1 / 30, camAt(-5));
    expect(on(fx)).toEqual(['rain_falling1']);
  });

  it('a page with no grid answers the last value: false from the start', () => {
    const fx = new Effects(() => 0.5);
    fx.setPlayer(() => [-5, 0, 0]);
    fx.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 66 })));
    fx.update(1 / 30, camAt(-5));
    expect(on(fx)).toEqual(['rain_falling1']);
  });

  it("a page off the walk (a spectator: no walk grid, no feet) probes the map's hull for 66; 72 answers no player", () => {
    const cam = new Effects(() => 0.5);
    cam.setWorld(() => null);
    cam.setHull(() => GRID);
    cam.setPlayer(() => null);
    cam.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 66 })));
    cam.update(1 / 30, camAt(-5));
    expect(on(cam)).toEqual(['rain_falling2']);
    const ply = new Effects(() => 0.5);
    ply.setWorld(() => null);
    ply.setHull(() => GRID);
    ply.setPlayer(() => null);
    ply.setData(data(rainFalling({ kind: 'other', set: 0, cmd: 72 })));
    ply.update(1 / 30, camAt(-5));
    expect(on(ply)).toEqual(['rain_falling1']);
  });
});
