import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import type { ParticleSource } from '@s2u/scene';
import { PER_DISTANCE_MOVE_LIMIT, PARTICLE_RATE_SCALE, ParticleSystem } from '../src/particles';

/**
 * The per-distance emitter (socomlegacy/docs/research/89 §3, "Running"; research 86 §5.4): a source whose flags A carry
 * 0x4000 and not 0x8000 (`FUN_00266830` D:L113156-113167 sets the manager's `+0x1b` from them, the later one winning)
 * counts the distance its place moved since the last tick, not the time -- `FUN_00329b40` D:L226896-226904: the place
 * now (its node's matrix times `+0x54`, D:L226869-226878) against the one the last tick recorded (`+4`, written at
 * D:L227152-227156), added only for a move under 200 (squared under 40000), times `DAT_004884c8` (1.0,
 * `FUN_00324b20` D:L223720). The wading ripples' `rain_ripple2` (every 3.5 units) and `rain_ripple3` (every 0.4) are
 * such sources on every map's `CZANIM.ZAR` (the dev-disc case in `traversalPage.test.ts`).
 */

/** One per-distance source following its node: one particle every unit moved, living long enough to count. */
function source(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x4013, flagsB: 0, name: 'trail', setActive: true, node: -6, follow: true, perEvent: 1, events: -1, interval: 1,
    perDistance: true, type: 2, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
    baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
    atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
    friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null, textures: [], textureMode: 'first',
    texture: null, colours: [], scales: [], ...over,
  };
}

const positions = (ps: ParticleSystem): [number, number, number][] =>
  (ps as unknown as { particles: { position: [number, number, number] }[] }).particles.map((p) => [...p.position]);

/** A source on a node the test moves in place (the ripples' `actor+0x1380`), its first tick taken. */
function rig(over: Partial<ParticleSource> = {}) {
  const ps = new ParticleSystem(() => 0.5);
  const node = new Matrix4().makeTranslation(10, 2, -4);
  ps.emit(source(over), node, {}, 'run', () => true, null, () => node);
  ps.update(1 / 60, null);                            // the first tick records the place and emits nothing
  return { ps, node };
}

describe('a per-distance source emits by the distance its place moved (FUN_00329b40 D:L226896-226904)', () => {
  it('the factor both counters take is DAT_004884c8, 1.0 (FUN_00324b20 D:L223720); a move of 200 or more counts nothing', () => {
    expect(PARTICLE_RATE_SCALE).toBe(1);
    expect(PER_DISTANCE_MOVE_LIMIT).toBe(200);
  });

  it('standing still emits nothing, however long', () => {
    const { ps } = rig();
    for (let i = 0; i < 600; i++) ps.update(1 / 60, null);
    expect(ps.emitted).toBe(0);
  });

  it('one particle per unit moved, each at the node the source follows', () => {
    const { ps, node } = rig();
    for (let i = 1; i <= 8; i++) { node.setPosition(10 + i, 2, -4); ps.update(1 / 60, null); }
    expect(ps.emitted).toBe(8);
    // Left where each was emitted: a trail from x 11 to x 18 behind the node, at its height and depth.
    const xs = positions(ps).map((p) => p[0]).sort((a, b) => a - b);
    expect(xs).toEqual([11, 12, 13, 14, 15, 16, 17, 18]);
    for (const p of positions(ps)) { expect(p[1]).toBeCloseTo(2, 6); expect(p[2]).toBeCloseTo(-4, 6); }
  });

  it('half units add up: 0.25 a tick is one particle every fourth tick, not one a tick', () => {
    const { ps, node } = rig();
    for (let i = 1; i <= 16; i++) { node.setPosition(10 + i * 0.25, 2, -4); ps.update(1 / 60, null); }
    expect(ps.emitted).toBe(4);
  });

  it('a jump of 200 or more (a respawn, a teleport) adds nothing; the next small move counts again from the new place', () => {
    const { ps, node } = rig();
    node.setPosition(10 + 250, 2, -4);
    ps.update(1 / 60, null);
    expect(ps.emitted).toBe(0);
    node.setPosition(10 + 253, 2, -4);
    ps.update(1 / 60, null);
    expect(ps.emitted).toBe(3);
  });

  it('a time source (flag A 0x8000) still emits by the time, standing still', () => {
    const { ps } = rig({ flagsA: 0x8013, perDistance: false, interval: 0.5 });
    for (let i = 0; i < 60; i++) ps.update(1 / 60, null);
    expect(ps.emitted).toBe(2);
  });
});
