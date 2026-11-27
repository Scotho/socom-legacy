import { afterEach, describe, expect, it, vi } from 'vitest';
import { Matrix4, MeshBasicMaterial, PerspectiveCamera, Texture, type Mesh } from 'three';
import type { ParticleSource } from '@s2u/scene';
import { ParticleGeometry } from '../src/particleGeometry';
import { setLensRows, setNightVision } from '../src/nightVision';
import { setTrueColourScale } from '../src/trueColourScale';
import { lensRow } from '../src/lensFx';
import { particleTint, PARTICLE_LENS_ROW_READING } from '../src/particleTint';

vi.mock('../src/effectMaterials', () => { throw new Error('Particle geometry must not load production materials'); });

/**
 * R4P-245 PARTICLE-LENS-TINT (research 89 §24): every particle's colour passes `FUN_003b59a0` (r0004 `0x003d7af0`):
 * with the lens flag `0x4b4a68` up (D:L307592), `c.xyz = row.xyz x (c.x + c.y + c.z + row.z)` (D:L307604-307607:
 * VMULAbc.x / VMADDAbc.y / VMADDAbc.z of the colour into ACC, then VMADDbc.z of the row's own z, all .xyz -- the
 * broadcast fields and masks read off the instruction words at 0x003b59c0-0x003b59d4, which the decompilation drops),
 * then always `c.xyz = c.xyz x wash.xyz + wash.w` (VMUL, VADDbc.w; D:L307595-307596 and D:L307608-307609), alpha
 * untouched. The colour is the key times 128 (D:L225585), so in the page's units (1 = 128) the constants are / 128.
 */

/** `LensFX_NVG` on every night map. */
const LENS: [number, number, number, number] = [0.2, 0.898, 0.2, 0.24];
/** A flashbang's wash row as captured (Q245-PC2): (0.75, 0.75, 0.75, 60.5). */
const WASH = [0.75, 0.75, 0.75, 60.5];
/** A keyed colour (the page's 1 = the GS's 128). */
const KEY: [number, number, number, number] = [0.5, 0.25, 0.125, 0.8];

function lensFold(c: readonly number[], lens: readonly number[]): number[] {
  const r = lensRow(lens);
  const sum = c[0]! + c[1]! + c[2]! + r[2] / 128;
  return [r[0] * sum, r[1] * sum, r[2] * sum, c[3]!];
}
function wash(c: readonly number[], w: readonly number[]): number[] {
  return [c[0]! * w[0]! + w[3]! / 128, c[1]! * w[1]! + w[3]! / 128, c[2]! * w[2]! + w[3]! / 128, c[3]!];
}
function close(got: ArrayLike<number>, want: readonly number[]): void {
  for (let i = 0; i < want.length; i++) expect(got[i]!).toBeCloseTo(want[i]!, 6);
}

afterEach(() => { setNightVision(null); setTrueColourScale(null); });

describe('particleTint: FUN_003b59a0, the one colour step of every particle draw', () => {
  it('leaves the colour as keyed with no lens and no wash', () => {
    expect(particleTint(KEY)).toEqual(KEY);
  });

  it('folds the colour into the lens monochrome while the goggles are on, alpha kept', () => {
    setNightVision(LENS);
    const got = particleTint(KEY);
    close(got, lensFold(KEY, LENS));
    expect(got[3]).toBe(KEY[3]);
    // Monochrome: two colours of one sum fold alike.
    close(particleTint([0.9, 0.05, 0.05, 1]), particleTint([0.05, 0.05, 0.9, 1]));
  });

  it('scales by the wash row, lens off', () => {
    setTrueColourScale(WASH);
    close(particleTint(KEY), wash(KEY, WASH));
  });

  it('scales by the wash row after the lens fold, lens on', () => {
    setNightVision(LENS);
    setTrueColourScale(WASH);
    close(particleTint(KEY), wash(lensFold(KEY, LENS), WASH));
  });

  it('takes the particle draw\'s lens row (PARTICLE_LENS_ROW_READING) when a lens sets its rows apart', () => {
    const rows = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [1, 1, 0, 0]];
    setLensRows(rows);
    close(particleTint(KEY), lensFold(KEY, rows[PARTICLE_LENS_ROW_READING]!));
  });
});

/** A synthetic constant-rate source with one fixed colour key (the disc's sources are held by the other particle tests). */
const source: ParticleSource = {
  flagsA: 0x3, flagsB: 0, name: 'tint', setActive: true, node: -6, follow: false, perEvent: 1, events: -1, interval: 0.01,
  perDistance: false, type: 0, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
  baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
  atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
  friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null, textures: [], textureMode: 'first',
  texture: null, colours: [[0, ...KEY], [1, ...KEY]], scales: [],
};

/** The colour buffer the shared particle core fills: three's `ParticleSystem` draws it, the raw path's `RawParticles` stages it. */
function drawnColour(): Float32Array {
  const material = new MeshBasicMaterial({ map: new Texture() });
  const particles = new ParticleGeometry(() => 0.5, () => material);
  const node = new Matrix4(), camera = new PerspectiveCamera();
  camera.position.set(0, 10, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  particles.emit(source, node, {}, 'fixture', () => true, null, () => node);
  particles.update(1 / 60, camera);
  particles.update(1 / 60, camera);
  expect(particles.count()).toBeGreaterThan(0);
  const mesh = particles.object.children.find((m) => m.visible) as Mesh;
  return (mesh.geometry.attributes.color!.array as Float32Array).slice(0, 4);
}

describe('the shared particle core writes the stepped colour (both render paths read its buffer)', () => {
  it('unchanged with no lens and no wash', () => {
    const c = drawnColour();
    close(c.subarray(0, 3), KEY.slice(0, 3));
  });

  it('the lens fold of the keyed colour with the goggles on', () => {
    setNightVision(LENS);
    close(drawnColour().subarray(0, 3), lensFold(KEY, LENS).slice(0, 3));
  });

  it('scaled by the wash, lens off and on', () => {
    setTrueColourScale(WASH);
    close(drawnColour().subarray(0, 3), wash(KEY, WASH).slice(0, 3));
    setNightVision(LENS);
    close(drawnColour().subarray(0, 3), wash(lensFold(KEY, LENS), WASH).slice(0, 3));
  });
});
