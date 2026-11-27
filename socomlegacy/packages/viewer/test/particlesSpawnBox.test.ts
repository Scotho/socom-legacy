import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import type { ParticleSource } from '@s2u/scene';
import { ParticleSystem } from '../src/particles';

/**
 * LATER 1172 (X5, the owner's "sparse rain on Ruins, snow on Blizzard"): a source's spawn box is added in WORLD axes.
 *
 * `FUN_00329b40` carries only the source's offset (+0x54) through its node's world matrix (`FUN_003109f0`,
 * `FUN_003085c0`; D:L226869-226877) and keeps the result as the place (+4..+0xc, D:L227152-227156); each particle then
 * spawns at the place plus a uniform draw in [+0x60,+0x64] / [+0x68,+0x6c] / [+0x70,+0x74] on the world's x / y / z
 * (D:L227084-227100) -- no matrix touches the box. The camera node's 3x3 is the view's whole turn (`FUN_00294070`, run
 * every frame from D:L50817, builds the view matrix from it), so the offset pitches with the view while the box does not.
 * The port rotated the whole box with the camera, tilting the rain's thin +-10 vertical extent with the view's pitch.
 * Reading, pending review (research 436).
 */

/** MP12's `rain_falling1`: offset (0,25,-40), box +-70 / +-10 / +-70; still, so a particle stays where it spawned. */
function rain(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x15dfb8d7, flagsB: 0x1000, name: 'rain_falling1', setActive: true, node: -6, follow: true, perEvent: 1, events: -1,
    interval: 0.001, perDistance: false, type: 3, streak: [1, 0.15], spin: null, offset: [0, 25, -40], baseVelocity: [0, 0, 0],
    worldVelocity: [0, 0, 0], baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false,
    atContext: false, atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]],
    box: [[-70, 70], [-10, 10], [-70, 70]],
    accel: [0, 0, 0], friction: 0, size: [0.5, 0.5], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null,
    textures: [], textureMode: 'first', texture: null, colours: [], scales: [], ...over,
  };
}

/** MP1's `snow_flakes`: offset (0,20,-50), box +-50 / -15..5 / -25..15. */
const snow = (): ParticleSource => rain({ name: 'snow_flakes', offset: [0, 20, -50], box: [[-50, 50], [-15, 5], [-25, 15]] });

/** A camera at (100, 30, -200) turned 35 degrees and pitched `pitchDeg` (negative: down). */
function cameraMatrix(pitchDeg: number): Matrix4 {
  const cam = new PerspectiveCamera(60, 1, 0.1, 5000);
  cam.position.set(100, 30, -200);
  cam.rotation.order = 'YXZ';
  cam.rotation.set((pitchDeg * Math.PI) / 180, (35 * Math.PI) / 180, 0);
  cam.updateMatrixWorld();
  return cam.matrixWorld.clone();
}

interface Inside { particles: { position: number[] }[] }

/** Each spawned particle's place less the source's place (the node's matrix times the offset). */
function spawnedRelative(config: ParticleSource, m: Matrix4, seed = 1): number[][] {
  let s = seed;
  const random = (): number => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const ps = new ParticleSystem(random);
  ps.emit(config, m, {}, 'r', () => true, null, () => m);
  ps.update(1 / 30, null);                                    // records the place
  for (let i = 0; i < 4; i++) ps.update(1 / 30, null);        // spawns
  const [ox, oy, oz] = config.offset;
  const e = m.elements;
  const place = [
    e[0]! * ox + e[4]! * oy + e[8]! * oz + e[12]!,
    e[1]! * ox + e[5]! * oy + e[9]! * oz + e[13]!,
    e[2]! * ox + e[6]! * oy + e[10]! * oz + e[14]!,
  ];
  return (ps as unknown as Inside).particles.map((p) => [p.position[0]! - place[0]!, p.position[1]! - place[1]!, p.position[2]! - place[2]!]);
}

describe('LATER 1172: the spawn box is in world axes, the offset in the camera node frame (FUN_00329b40 D:L227084-227100)', () => {
  for (const [name, make] of [['rain_falling1 (MP12)', rain], ['snow_flakes (MP1)', snow]] as const) {
    for (const pitch of [0, -15, -45, -80, 30]) {
      it(`${name}: pitched ${pitch} deg, every particle is inside the box on the WORLD axes about the turned offset`, () => {
        const config = make();
        const rel = spawnedRelative(config, cameraMatrix(pitch));
        expect(rel.length).toBeGreaterThan(50);
        const eps = 1e-3;
        for (const r of rel) {
          for (let k = 0; k < 3; k++) {
            expect(r[k]!, `axis ${k}`).toBeGreaterThanOrEqual(config.box[k]![0] - eps);
            expect(r[k]!, `axis ${k}`).toBeLessThanOrEqual(config.box[k]![1] + eps);
          }
        }
        // And the box is filled, not squeezed: the vertical draws span most of the box's height at every pitch.
        const ys = rel.map((r) => r[1]!);
        const span = Math.max(...ys) - Math.min(...ys), height = config.box[1]![1] - config.box[1]![0];
        expect(span).toBeGreaterThan(0.8 * height);
      });
    }
  }

  it("the place (the offset) still turns with the camera's turn (D:L226869-226877): with no box, every drop spawns at it", () => {
    // Looking 45 deg down, turned 35 deg: the rain's place is 40 ahead and 25 up along the VIEW -- 10.6 below the eye.
    const config = rain({ box: [[0, 0], [0, 0], [0, 0]] });
    const ps = new ParticleSystem(() => 0.5);
    const m = cameraMatrix(-45);
    ps.emit(config, m, {}, 'r', () => true, null, () => m);
    for (let i = 0; i < 3; i++) ps.update(1 / 30, null);
    const ps0 = (ps as unknown as Inside).particles;
    expect(ps0.length).toBeGreaterThan(10);
    const c = Math.cos(Math.PI / 4), sn = Math.sin(Math.PI / 4), yaw = (35 * Math.PI) / 180;
    const ahead = 40 * c + 25 * sn;                                 // the horizontal reach of (0,25,-40) pitched down 45
    const want = [100 - ahead * Math.sin(yaw), 30 + 25 * c - 40 * sn, -200 - ahead * Math.cos(yaw)];
    for (const p of ps0) for (let k = 0; k < 3; k++) expect(p.position[k]!).toBeCloseTo(want[k]!, 3);
  });
});
