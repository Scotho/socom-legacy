import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PerspectiveCamera } from 'three';
import {
  GAME_FRAME_DT, TRACER_POOL, UNITS_PER_METRE, type EffectLine, type EffectOp, type EffectProgram, type WeaponRecord,
} from '@s2u/scene';
import { Effects, TRACER_OBJECT_SCALE } from '../src/effects';
import type { EffectData } from '../src/effectData';
import type { FireEvent, FireWeapon } from '../src/fire';
import { fireWeaponOf } from '../src/netPage';

/**
 * A tracer in the viewer (research 89 §19; #425's takeover): the kind's zAnim on an object the flight carries, a game
 * frame at a time (`FUN_003d5030`, `FUN_003d4bf0`). The map's line-strip model is loaded but never drawn for it: the
 * original clears the object's model (`DAT_003e1568`). Synthetic effect data, no disc; the effects' generator 0.5 puts
 * the start `(495 + 1) / 10` = 49.6 units down the shot. Was (#425 as filed): the model flown at `½·a·t²` per page frame.
 */

const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
const prog = (name: string, ops: EffectOp[]): EffectProgram => ({
  name, root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops }],
});
const strip = (): EffectLine => ({
  positions: Float32Array.from([0, 0, 0, 1, 0, 0]), uvs: new Float32Array(4), colors: Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
  normals: new Float32Array(6), textureName: null, fog: false, cull: false,
});
const data = (programs: EffectProgram[]): EffectData => ({
  archive: 'T', textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [], sceneNodes: [], hitAnims: [], missing: [],
  programs,
  models: [{ name: 'tracer_ally', parts: [{ node: 'g0', path: 'tracer_ally/g0', world: new Float32Array(16), meshes: [], lines: [strip()] }] }],
});
const weapon: FireWeapon = { name: 'M4A1', id: 54, range: 10000, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } };
const round = (over: Partial<Extract<FireEvent, { type: 'round' }>> = {}): Extract<FireEvent, { type: 'round' }> => ({
  type: 'round', weapon, from: [0, 20, 0], to: [0, 20, -800], hit: true, rounds: 20, tracer: true, tracerKind: 'ally', ...over,
});
const rig = (programs: EffectProgram[] = [prog('tracer_ally_anim', [wait(60)]), prog('tracer_enemy_anim', [wait(60)])]) => {
  const fx = new Effects(() => 0.5, () => {});
  fx.setData(data(programs));
  const camera = new PerspectiveCamera();
  return { fx, tick: (dt: number) => fx.update(dt, camera), live: () => fx.stats().tracers };
};

describe('a tracer: the zAnim on a flying object (research 89 §19)', () => {
  it("launches only where the map holds the kind's zAnim -- the model alone draws nothing; the turret's round plays the enemy's", () => {
    const none = rig([]);
    expect(none.fx.willDrawTracer('ally')).toBe(false);
    expect(none.fx.launchTracer([0, 0, 0], [0, 0, -500], 'ally')).toBe(false);
    const ally = rig([prog('tracer_ally_anim', [wait(60)])]);
    expect([ally.fx.willDrawTracer('ally'), ally.fx.willDrawTracer('enemy'), ally.fx.willDrawTracer('turret')]).toEqual([true, false, false]);
    const both = rig();
    expect(both.fx.willDrawTracer('turret')).toBe(true);
    expect(both.fx.launchTracer([0, 20, 0], [0, 20, -500], 'turret')).toBe(true);
    expect(both.fx.stats().shown).not.toContain('tracer_ally');
  });

  it('starts (rand() % 990 + 1) / 10 down the shot and moves only at whole game frames, speed + 1 units a frame', () => {
    const { fx, tick, live } = rig();
    expect(fx.launchTracer([0, 20, 0], [0, 20, -800], 'ally', 10000)).toBe(true);
    expect(live()[0]!.head).toEqual([0, 20, expect.closeTo(-49.6, 6)]);
    tick(GAME_FRAME_DT * 0.5);                                     // half a game frame: not stepped
    expect(live()[0]!.head[2]).toBeCloseTo(-49.6, 6);
    tick(GAME_FRAME_DT * 0.5);                                     // the frame completes
    const v1 = 400 * GAME_FRAME_DT;
    expect(live()[0]!.speed).toBeCloseTo(v1, 6);
    expect(live()[0]!.head[2]).toBeCloseTo(-(49.6 + v1 + 1), 5);
  });

  it('reaches its end, is drawn there for one frame, and is freed on the next', () => {
    const { fx, tick, live } = rig();
    fx.launchTracer([0, 20, 0], [0, 20, -120], 'ally', 10000);
    let n = 0;
    while (live()[0] && live()[0]!.head[2] > -120 + 1e-6 && n++ < 100) tick(GAME_FRAME_DT);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.head[2]).toBeCloseTo(-120, 6);
    tick(GAME_FRAME_DT);
    expect(live()).toHaveLength(0);
  });

  it('a round event launches one, with the weapon range; a through-hit copy launches none; a short shot none', () => {
    const { fx, live } = rig();
    fx.onRound(round(), null, false);
    expect(live()).toHaveLength(1);
    fx.onRound(round({ tracer: undefined, tracerKind: undefined }), null, false);
    expect(live()).toHaveLength(1);
    fx.onRound(round({ to: [0, 20, -69] }), null, false);         // under TRACER_MIN_SHOT
    expect(live()).toHaveLength(1);
  });

  it("LATER 366 (OT.R80): a walled round's tracer launches from `tracerFrom` (the muzzle), not the round's start (the head)", () => {
    const { fx, live } = rig();
    fx.onRound(round({ from: [0, 15, 3], tracerFrom: [3, 14, -8], to: [3, 14, -808] }), null, false);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.head).toEqual([expect.closeTo(3, 6), expect.closeTo(14, 6), expect.closeTo(-8 - 49.6, 6)]);
    const plain = rig();
    plain.fx.onRound(round({ from: [3, 14, -8], to: [3, 14, -808] }), null, false);   // no `tracerFrom`: from `from`
    expect(plain.live()[0]!.head).toEqual(live()[0]!.head);
  });

  it("without a weapon range it is the original's 300: a long shot retires where its speed passes it", () => {
    const { fx, tick, live } = rig();
    fx.launchTracer([0, 20, 0], [0, 20, -1e6], 'ally');
    let n = 0;
    while (live().length > 0 && n++ < 200) tick(GAME_FRAME_DT);
    expect(n).toBeLessThan(200);
    expect(n).toBe(Math.floor(300 / (400 * GAME_FRAME_DT)) + 2);   // the frame past 300 retires it, the next frees it
  });

  it(`keeps ${TRACER_POOL}; a full pool launches none (FUN_003d5030 with no free slot)`, () => {
    const { fx, live } = rig();
    for (let i = 0; i < TRACER_POOL; i++) expect(fx.launchTracer([0, 20, 0], [0, 20, -800], 'ally', 10000)).toBe(true);
    const first = live()[0]!.head;
    expect(fx.launchTracer([5, 20, 0], [5, 20, -800], 'ally', 10000)).toBe(false);
    expect(live()).toHaveLength(TRACER_POOL);
    expect(live()[0]!.head).toEqual(first);
  });

  it('reset drops them with the map; the dev hold puts one at its end and keeps it', () => {
    const { fx, tick, live } = rig();
    fx.launchTracer([0, 20, 0], [0, 20, -800], 'ally', 10000);
    fx.reset();
    expect(live()).toHaveLength(0);
    const held = rig();
    held.fx.holdTracers(true);
    held.fx.launchTracer([0, 20, 0], [0, 20, -300], 'ally', 10000);
    for (let i = 0; i < 30; i++) held.tick(GAME_FRAME_DT);
    expect(held.live()).toHaveLength(1);
    expect(held.live()[0]!.head[2]).toBeCloseTo(-300, 6);
  });

  it("a freed tracer's zAnim is not stopped: it runs out (TRACER_RETIRED_ANIM_READING); the object is scaled 7.5", () => {
    expect(TRACER_OBJECT_SCALE).toBe(7.5);
    const { fx, tick, live } = rig();
    const runs = (): number => (fx as unknown as { runs: { finished: boolean }[] }).runs.filter((r) => !r.finished).length;
    fx.launchTracer([0, 20, 0], [0, 20, -120], 'ally', 10000);
    expect(runs()).toBe(1);
    for (let i = 0; i < 20 && live().length > 0; i++) tick(GAME_FRAME_DT);
    expect(live()).toHaveLength(0);
    expect(runs(), 'freed from the pool, its anim still running').toBe(1);
    tick(61);                                                       // the program's wait (60 s here) runs out
    expect(runs()).toBe(0);
  });

  it("the round's weapon range is world units: the disc's M4A1 record's Maximum_Range x UNITS_PER_METRE", () => {
    // The pinned record table (`scene/test/golden/weapon-records.json`, the disc's ZWEAPON read through the repository's reader).
    const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
    const m4 = Object.values(PIN.records).find((w) => w.name === 'M4A1')!;
    expect(UNITS_PER_METRE).toBe(10);
    expect(fireWeaponOf(m4).range).toBe(m4.maximumRange * 10);
    expect(fireWeaponOf(m4).range).toBeGreaterThan(300);
  });
});
