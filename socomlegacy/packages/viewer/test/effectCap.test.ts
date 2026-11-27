import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { EffectOp, EffectProgram } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { Effects, EFFECT_PARTICLE_DRAIN_READING, effectInstanceLimit } from '../src/effects';

/**
 * R4P-255 EFFECT-CAP (reading, pending review): every start of a world effect asks `CZAnim::GetAvailable` (r0001
 * `FUN_00270ef0` D:L119142-119214; r0004's twin 0x00271e00 the same) for a free instance of its animation. An instance
 * is busy while it runs, or while a particle source it made still drains (D:L118555-118567). With every instance busy, a
 * copy is made only when `Anim_Params`' flags carry the copy bit 0x80 and the chain is under the head's limit
 * ((flags & 0x7ffff) >> 13; 0 none); else the start is refused and nothing draws.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');
const DT = 1 / 30;

const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
const prog = (name: string, flags: number, ops: EffectOp[]): EffectProgram => ({ name, root: 0, flags, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops }] });
const data = (programs: EffectProgram[]): EffectData => ({
  archive: 'T', models: [], textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [], sceneNodes: [], hitAnims: [], missing: [], programs,
});
const rig = (d: EffectData) => {
  const fx = new Effects(() => 0.5, () => {});
  fx.setData(d);
  const camera = new PerspectiveCamera();
  return { fx, tick: (n = 1) => { for (let i = 0; i < n; i++) fx.update(DT, camera); } };
};
const at = { position: [0, 0, 0] as [number, number, number] };

describe('R4P-255: the head\'s limit read from Anim_Params\' flags', () => {
  it('(flags & 0x7ffff) >> 13 with the copy bit; one instance without it; null for no limit', () => {
    expect(effectInstanceLimit(0xa0a2)).toBe(5);      // bullet_hit_person
    expect(effectInstanceLimit(0x20a2)).toBe(1);      // c4: the copy bit, a limit of 1 -- never a second
    expect(effectInstanceLimit(0x50a2)).toBe(2);      // 50gallon_fuel_explosion
    expect(effectInstanceLimit(0xa2)).toBeNull();     // a copy whenever all are busy
    expect(effectInstanceLimit(0x22)).toBe(1);        // no copy bit: the head alone (camera_shake)
    expect(effectInstanceLimit(0x2022)).toBe(1);      // a limit without the copy bit copies nothing either
  });
});

describe('R4P-255: a start the original refuses draws nothing', () => {
  const programs = [
    prog('blood', 0xa0a2, [wait(1)]),
    prog('bomb', 0x20a2, [wait(1)]),
    prog('shake', 0x22, [wait(1)]),
    prog('puff', 0xa2, [wait(1)]),
    prog('caller', 0xa2, [{ op: 'call', anim: 'bomb' }, { op: 'call', anim: 'bomb' }, wait(1)]),
  ];

  it('six starts of a limit-5 animation inside one run give five runs; the sixth is refused', () => {
    const { fx, tick } = rig(data(programs));
    const handles = Array.from({ length: 6 }, () => fx.run('blood', at)!);
    tick();
    expect(fx.stats().runs).toBe(5);
    expect(handles.map((h) => h.alive())).toEqual([true, true, true, true, true, false]);
    expect(fx.stats().refused).toEqual({ blood: 1 });
  });

  it('two starts of c4 (limit 1) give one run', () => {
    const { fx, tick } = rig(data(programs));
    fx.run('bomb', at);
    fx.run('bomb', at);
    tick();
    expect(fx.stats().runs).toBe(1);
  });

  it('no copy bit: a second start while the head runs is refused', () => {
    const { fx, tick } = rig(data(programs));
    fx.run('shake', at);
    expect(fx.run('shake', at)!.alive()).toBe(false);
    tick();
    expect(fx.stats().runs).toBe(1);
  });

  it('the copy bit with no limit: every start runs', () => {
    const { fx, tick } = rig(data(programs));
    for (let i = 0; i < 10; i++) fx.run('puff', at);
    tick();
    expect(fx.stats().runs).toBe(10);
  });

  it('a finished instance is free again: the start after it ends runs', () => {
    const { fx, tick } = rig(data(programs));
    fx.run('shake', at);
    tick(32);                                          // past its 1 s wait
    expect(fx.stats().runs).toBe(0);
    expect(fx.run('shake', at)!.alive()).toBe(true);
  });

  it('a stopped instance is free again once it has no particles (none here)', () => {
    const { fx } = rig(data(programs));
    fx.run('shake', at)!.stop();
    expect(fx.run('shake', at)!.alive()).toBe(true);
  });

  it('a CALL_ANIMATION asks too: two calls of c4 from one run start one c4', () => {
    const { fx, tick } = rig(data(programs));
    fx.run('caller', at);
    tick();
    expect(fx.stats().runs).toBe(2);                  // the caller and one bomb
  });

  // The review's F1 (D:L120741, 120754, 118636-118637): a started instance is busy until the frame's update, even
  // when its sequences would end at once -- `muzzle_mp5` (0x22) is three CALLs with no wait.
  it('no copy bit, a run that ends at once: a second start in the same frame is refused, one in the next frame plays', () => {
    const { fx, tick } = rig(data([...programs, prog('flash', 0x22, [{ op: 'call', anim: 'puff' }])]));
    fx.run('flash', at);
    expect(fx.run('flash', at)!.alive()).toBe(false);
    expect(fx.stats().refused).toEqual({ flash: 1 });
    tick();
    fx.run('flash', at);
    expect(fx.stats().refused).toEqual({ flash: 1 });
  });

  // The review's F3: the map's own start of an ambient animation is its head (`FUN_00270ef0` via Activate, D:L119328-
  // 119330): busy while it runs, so a later start of a no-copy ambient program is refused.
  it('a running ambient head is a busy instance: a no-copy start of it is refused', () => {
    const { fx } = rig({ ...data([...programs, prog('fan', 0x21, [wait(100)])]), ambient: ['fan'] });
    expect(fx.stats().ambient).toEqual(['fan']);
    expect(fx.run('fan', at)!.alive()).toBe(false);
    expect(fx.stats().refused).toEqual({ fan: 1 });
  });

  it('a new map forgets the instances', () => {
    const { fx } = rig(data(programs));
    fx.run('shake', at);
    fx.setData(data(programs));
    expect(fx.run('shake', at)!.alive()).toBe(true);
  });
});

describe('EFFECT_PARTICLE_DRAIN_READING', () => {
  it('names the drain\'s end: the instance is held until the last particle its sources emitted has died', () => {
    expect(EFFECT_PARTICLE_DRAIN_READING).toBe('lastParticle');
  });
});

describe.skipIf(!MP2)(`R4P-255 on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let d: EffectData | undefined;
  const load = async (): Promise<EffectData> => (d ??= await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));

  it('MP2\'s flags: bullet_hit_person 0xa0a2 (limit 5), c4 0x20a2 (limit 1)', async () => {
    const programs = (await load()).programs;
    const flags = (n: string) => programs.find((p) => p.name === n)!.flags;
    expect(flags('bullet_hit_person')).toBe(0xa0a2);
    expect(flags('c4')).toBe(0x20a2);
    expect(effectInstanceLimit(flags('bullet_hit_person'))).toBe(5);
    expect(effectInstanceLimit(flags('c4'))).toBe(1);
  });

  it('six bullet_hit_person in one window: five run, the sixth draws nothing', async () => {
    const { fx, tick } = rig(await load());
    const hs = Array.from({ length: 6 }, () => fx.run('bullet_hit_person', at)!);
    tick();
    expect(hs.filter((h) => h.alive()).length).toBe(5);
    expect(fx.stats().refused).toEqual({ bullet_hit_person: 1 });
  });

  // `c4` (limit 1): its activation-1 sequences are only its CALL of `he_grenade` and its sound; its particle sequences
  // are activation-2 and nothing in it starts them (research 448's start rule, `FUN_0026ae20` D:L115457-115509), so a
  // `c4` run ends in the update after its start and holds no particle. The review's F1: Activate sets the instance's
  // state 2 (D:L120741) and only queues its update (D:L120754; `FUN_0034e6b0` D:L248823-248846), its sequences starting
  // in that update (D:L118636-118637) -- so the instance is busy until the frame's update: a second `c4` in the SAME
  // frame is refused, one a frame later finds it free. The blast drawn is `he_grenade`'s runs (0x10a2, free copies).
  it('c4 (limit 1): a second c4 in the same frame is refused, one in the next frame plays', async () => {
    const { fx, tick } = rig(await load());
    fx.run('c4', at);
    expect(fx.run('c4', at)!.alive()).toBe(false);
    expect(fx.stats().refused).toEqual({ c4: 1 });
    tick();
    fx.run('c4', at);
    expect(fx.stats().refused).toEqual({ c4: 1 });
    expect(fx.stats().played.c4).toBe(2);
  });

  // The drain, on a disc source: `bullet_hit_person`'s own sources fire one event at its start and live 0.4-1.1 s while
  // its run waits past 1.1 s, so its particles are gone before it ends (the drain adds nothing to the blood at the
  // disc's lifetimes). A run that ends first: `red_streak01` (life 0.9-1.0 s) and a 0.1 s wait, one instance (0x22).
  it('the drain: an ended run whose particles live holds its instance, and frees it when they die', async () => {
    const disc = await load();
    const op = disc.programs.find((p) => p.name === 'bullet_hit_person')!.sequences
      .flatMap((q) => q.ops).find((o) => o.op === 'particles' && o.source.name === 'red_streak01')!;
    const { fx, tick } = rig({ ...disc, ambient: [], programs: [prog('drainer', 0x22, [op, wait(0.1)])] });
    const first = fx.run('drainer', at)!;
    let frames = 0;
    while (!first.finished && frames < 30) { tick(); frames++; }
    expect(first.finished).toBe(true);
    expect(fx.stats().particles).toBeGreaterThan(0);                       // its streak still in the air
    expect(fx.run('drainer', at)!.alive()).toBe(false);                    // held by the drain
    expect(fx.stats().refused).toEqual({ drainer: 1 });
    const ended = frames;
    while (fx.stats().particles > 0 && frames < ended + 60) { tick(); frames++; }
    expect(fx.stats().particles).toBe(0);
    expect(frames - ended).toBeLessThanOrEqual(31);                        // the streak's 1.0 s at most
    expect(fx.run('drainer', at)!.alive()).toBe(true);                     // free once the last one died
  });

  // The review's F2: only a source still active at the end is drained (D:L118559-118566); one the run switched off
  // first leaves its particles to fly but holds nothing.
  it('the drain: a source switched off before its run ended holds nothing, its particles still flying', async () => {
    const disc = await load();
    const op = disc.programs.find((p) => p.name === 'bullet_hit_person')!.sequences
      .flatMap((q) => q.ops).find((o) => o.op === 'particles' && o.source.name === 'red_streak01')!;
    if (op.op !== 'particles') throw new Error('not a particles op');
    const off: EffectOp = { ...op, source: { ...op.source, setActive: false } };
    const { fx, tick } = rig({ ...disc, ambient: [], programs: [prog('drainer', 0x22, [op, wait(0.1), off, wait(0.05)])] });
    const first = fx.run('drainer', at)!;
    let frames = 0;
    while (!first.finished && frames < 30) { tick(); frames++; }
    expect(first.finished).toBe(true);
    expect(fx.stats().particles).toBeGreaterThan(0);                       // its streak still in the air
    expect(fx.run('drainer', at)!.alive()).toBe(true);                     // but nothing drains: free
  });
});
