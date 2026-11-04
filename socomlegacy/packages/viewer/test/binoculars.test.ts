import { describe, expect, it } from 'vitest';
import { fixture } from '../../archive/test/fixtures';
import { BINOCULAR_ANIMS, BINOCULAR_CLIPS, binocularClip, BinocularPose } from '../src/binocularPose';
import { decodeCommands, decodeSnapshot, encodeCommands, encodeSnapshot } from '../src/net/codec';
import { bodyOf, snapshotOf } from '../src/net/body';
import { BodyFlag, Button, HOLD_SHIFT } from '../src/net/protocol';
import { moverSnapshot, Walker } from '../src/mover';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { buildGrid, type GridParams } from '@s2u/scene';

/**
 * The binoculars as the others see them (the owner's yes of 2026-10-01; research 84 §7): the body's `*2binocular`
 * clips (READERC `animset.rdr` "Stand -> Binocular" .. "Pistol prone -> Binocular", `MOTION_P.ZAR`) driven by the
 * replicated view state -- `Button.Binoculars` up, `BodyFlag.Binoculars` down, both additive (no version bump).
 */

describe('the binocular clips (READERC animset.rdr, MOTION_P.ZAR)', () => {
  it('six: stand, crouch and prone, the rifle\'s set and the sidearm\'s seal_p_ set', () => {
    expect(BINOCULAR_CLIPS).toEqual([
      'seal_stand2binocular', 'seal_crouch2binocular', 'seal_prone2binocular',
      'seal_p_stand2binocular', 'seal_p_crouch2binocular', 'seal_p_prone2binocular',
    ]);
    expect(binocularClip('crouch', 'rifle')).toBe('seal_crouch2binocular');
    expect(binocularClip('prone', 'pistol')).toBe('seal_p_prone2binocular');
    expect(BINOCULAR_ANIMS.pistol.stand).toBe('seal_p_stand2binocular');
  });

  const pack = fixture('RUN/MOTION_P.ZAR'), readerc = fixture('RUN/READERC.ZAR');
  it.skipIf(!pack || !readerc)('all six are in the pack and the table holds each a one-shot; the raise plays, holds, and lowers backwards', () => {
    const clips = new Map(clipsFromPack(pack!, BINOCULAR_CLIPS).map((c) => [c.name, c]));
    const table = motionTableFromArchive(readerc!);
    expect([...clips.keys()].sort()).toEqual([...BINOCULAR_CLIPS].sort());
    for (const name of BINOCULAR_CLIPS) expect([name, table?.get(name)?.looped ?? null]).toEqual([name, false]);
    const pose = new BinocularPose(() => ({ clips, table }));
    pose.update(1 / 60, true, 'stand', 'rifle');
    expect(pose.stats()).toMatchObject({ clip: 'seal_stand2binocular', up: true });
    for (let i = 0; i < 600; i++) pose.update(1 / 60, true, 'stand', 'rifle');
    const held = pose.stats();
    const n = clips.get('seal_stand2binocular')!.frameCount;
    expect(held.phase).toBeCloseTo((n - 1) / n, 9);                 // the one-shot's stop: its last key, held
    expect(held.weight).toBe(1);
    expect(pose.layer.sample({ clip: clips.get('seal_stand2binocular')!, frame: 0, phase: 0 })?.weight).toBe(1);
    pose.update(1 / 60, true, 'crouch', 'rifle');                    // a stance change while up: the crouch's clip
    expect(pose.stats()).toMatchObject({ clip: 'seal_crouch2binocular' });
    for (let i = 0; i < 600; i++) pose.update(1 / 60, true, 'crouch', 'rifle');
    const crouched = pose.stats().phase;
    pose.update(1 / 60, false, 'crouch', 'rifle');                   // down: the raise backwards (BINOCULAR_LOWER_READING)
    const lowering = pose.stats();
    expect(lowering.up).toBe(false);
    expect(lowering.phase).toBeLessThan(crouched);
    expect(lowering.weight).toBe(1);
    for (let i = 0; i < 600; i++) pose.update(1 / 60, false, 'crouch', 'rifle');
    expect(pose.stats()).toMatchObject({ clip: null, weight: 0 });   // back to the play, faded out
    expect(pose.layer.sample({ clip: clips.get('seal_stand2binocular')!, frame: 0, phase: 0 })).toBeNull();
    pose.update(1 / 60, true, 'prone', 'pistol');
    expect(pose.stats().clip).toBe('seal_p_prone2binocular');        // the pistol in the hand: the sidearm's set
  });

  it('without the clips nothing is laid over the body', () => {
    const pose = new BinocularPose(() => null);
    pose.update(0.1, true, 'stand', 'rifle');
    expect(pose.stats()).toMatchObject({ clip: null, weight: 0 });
  });
});

describe('the binoculars on the wire (additive: Button.Binoculars, BodyFlag.Binoculars)', () => {
  it('bits of their own: the command\'s beside Scope and below the hold\'s, the body\'s above Boost', () => {
    expect(Button.Binoculars).toBe(1 << 11);
    expect(Button.Binoculars & Button.Scope).toBe(0);
    expect(Button.Binoculars < 1 << HOLD_SHIFT).toBe(true);
    expect(BodyFlag.Binoculars).toBe(1 << 10);
    for (const f of Object.values(BodyFlag)) if (f !== BodyFlag.Binoculars) expect(f & BodyFlag.Binoculars).toBe(0);
  });

  it('a command carries it up and a body carries it down to the others\' animator', () => {
    const cmd = { seq: 9, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: Button.Binoculars | Button.Scope | Button.Aim, stance: 0, weapon: 1 };
    const back = decodeCommands(encodeCommands({ viewTick: 1, commands: [cmd] })).commands[0]!;
    expect(back.buttons & Button.Binoculars).not.toBe(0);
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const w = new Walker(buildGrid(params, [], [], [], []));
    const s = moverSnapshot(w, null, 0, 0.25);
    for (const binoculars of [true, false]) {
      const extras = { alive: true, weapon: 1 as const, aiming: true, trigger: false, boost: false, binoculars };
      const body = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [bodyOf(3, s, extras)] })).bodies[0]!;
      expect([binoculars, snapshotOf(body).binoculars]).toEqual([binoculars, binoculars]);
    }
    // An older room never sets it: the body reads as down.
    const old = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [bodyOf(3, s, { alive: true, weapon: 0, aiming: false, trigger: false, boost: false })] })).bodies[0]!;
    expect(snapshotOf(old).binoculars).toBe(false);
  });
});
