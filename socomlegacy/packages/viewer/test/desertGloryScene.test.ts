// @vitest-environment node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectOp, NODE_CALLER, NODE_LIGHT, parseAnimSets, parseSceneGraph, type EffectOp, type EffectProgram, type SceneNode } from '@s2u/scene';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture } from '../../archive/test/fixtures';
import { roomOn } from '../../match/test/sceneRoundsDisc';
import { under } from '../src/mapMeta';
import { groundGrid } from '../src/mover';
import { loadSimMap } from '../src/simMap';
import { INVALIDATE_ANIMATION_READING, SCENE_NODE_MOTION_PLACEHOLDER, SCENE_NODE_TRANSFORM_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * DF-6 (the Desert Glory / Fish Hook plan; research 175 §5.1.1, reading, pending review): Desert Glory's scene readings
 * on its committed fixture (`test-fixtures/RUN/MP6.ZDB`, the kit table `RUN/ZWEAPON.ZAR`; skipped without them).
 *
 * 1. The 22 hp-1 / shield-0 props -- `tincup1..6`, `plate1..4`, `lights_outdoor1..9`, `ashtray`, `ashtray2`, `ashtray3` --
 *    each die on the kit table's weakest round, their death one `OBJECT_MOTION` of node -7 (a flight: `FIXED_LAUNCH`
 *    with `CALLER_VELOCITY`), and nothing else touches their nodes. The room tells the death to every page
 *    (`sceneDeath`); a page fades the root over the motion's lifetime (`SCENE_NODE_MOTION_PLACEHOLDER`); the room's hull
 *    keeps the prop's collision owners active where they stood. In the original the polygons ride the node's flight
 *    (the collider is the node's: research 281 §4.3's `FUN_002d2890` transform, research 92 §2's leaf), so they leave
 *    their place with it -- the placeholder's, said in research 175 §5.1.1.
 * 2. No light is bound to a lamp: no node under `lights_outdoorN` is a light node (`NODE_LIGHT`) and the death program
 *    holds no `LIGHT` command; the map's one light node sits in `lightbulb3`, which no health record names.
 * 3. `INVALIDATE_ANIMATION` (command 49, `FUN_0025d2b0` D:L107355-107373): the animation the name byte +4 names -- its
 *    own on all ten of MP6's -- refuses every later start (`FUN_00270ef0` D:L119142) until the set starts again at the
 *    round's reset (`FUN_0026c600` D:L116340-116344; `AUTOSTART_RESET_READING`).
 * 4. A placed node's `OBJECT_TRANSLATE_STATE` / `OBJECT_ROTATE_STATE` / `OBJECT_MOTION_FROM_TO` -- the sky's camera
 *    follow, the bugs' and bees' flights, the camera jiggle -- draws nothing (`SCENE_NODE_TRANSFORM_PLACEHOLDER`).
 * 5. The door's `ai::EVENT` (an AI noise) and `ai::SIGNAL` (signal 1 to the context's `ai::SELECT` entry, which a door
 *    press never carries) reach no AI in a round: the door runs them as nothing.
 */
const MP6 = fixture('RUN/MP6.ZDB');
const PRESENT = MP6 !== null && fixture('RUN/ZWEAPON.ZAR') !== null && fixture('RUN/MPZANIM.ZAR') !== null;
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const SKIP = PRESENT ? '' : ' (skipped: test-fixtures absent)';

const PROPS = /^(tincup[1-6]|plate[1-4]|lights_outdoor[1-9]|ashtray[23]?)$/;
const ops = (p: EffectProgram): EffectOp[] => p.sequences.flatMap((s) => s.ops);

describe('DF-6 (3): INVALIDATE_ANIMATION decoded (FUN_0025d2b0 D:L107355-107373)', () => {
  it("the name byte +4 names the animation (MP6's cig_fly1: `31 00 22 00 02 00 00 00`, name 2 its own); 0 is the running one", () => {
    const names = ['NA', 'cig1', 'cig_fly1'];
    expect(decodeEffectOp({ set: 0, cmd: 49, bytes: Uint8Array.from([0x31, 0, 0x22, 0, 2, 0, 0, 0]) }, names)).toEqual({ op: 'invalidate', anim: 'cig_fly1' });
    expect(decodeEffectOp({ set: 0, cmd: 49, bytes: Uint8Array.from([0x31, 0, 0x22, 0, 0, 0, 0, 0]) }, names)).toEqual({ op: 'invalidate', anim: null });
    expect(INVALIDATE_ANIMATION_READING).toEqual({ refusesLaterStarts: true, untilSetRestart: true });
  });
});

describe(`DF-6: Desert Glory's scene, on its fixture${SKIP}`, () => {
  /** The kit table's weakest round: the least positive `ImpactDamage` over `zweapon.rdr`'s ammunition. */
  async function weakest(): Promise<number> {
    const { parseRdr, rdrGet } = await import('@s2u/archive');
    const zar = Zar.parse(fixture('RUN/ZWEAPON.ZAR')!);
    const script = parseRdr(zar.data(zar.root.children[0]!));
    const ammo = (rdrGet(script, 'ZAMMO') as unknown[]).filter(Array.isArray) as Parameters<typeof rdrGet>[0][];
    return Math.min(...ammo.map((r) => Number(rdrGet(r, 'ImpactDamage') ?? 0)).filter((v) => v > 0));
  }

  it.skipIf(!PRESENT)("(1) each hp-1 prop dies on the weakest round, is told to a second page and fades there over its motion's lifetime; the room keeps its collision", async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const scene = s.map.meta!.scene!;
    const props = scene.destructibles.filter((d) => PROPS.test(d.anim));
    expect(props.map((d) => d.anim).sort()).toHaveLength(22);
    for (const d of props) {
      expect([d.anim, d.health, d.shield]).toEqual([d.anim, 1, 0]);
      const motions = ops(d.program).filter((o) => o.op === 'motion');
      expect(motions, d.anim).toHaveLength(1);
      expect(motions[0]).toMatchObject({ motion: { node: -7 } });
      // Nothing of the death turns a node off or on: the prop's collision owners keep their flags in the original too.
      expect(ops(d.program).filter((o) => o.op === 'active'), d.anim).toEqual([]);
    }
    const rating = await weakest();
    const page = new WorldState(s.map.meta!, s.map.ground!, groundGrid(s.map.ground!), {});
    const faded = new Set<string>();
    page.on({ opacity: (path, f) => { if (f < 1) faded.add(path); } });
    for (const name of ['tincup1', 'plate1', 'lights_outdoor1', 'ashtray']) {
      const d = props.find((p) => p.anim === name)!;
      const owners = s.map.ground!.owners.filter((o) => under(o.path, d.root) && o.count > 0);
      expect(owners.length, name).toBeGreaterThan(0);
      expect(s.room.world.health.hitAt(d.targetPath, { kind: 'impact', rating, modifier: 0, point: [0, 0, 0] }), name).toEqual({ applied: true, died: true });
      s.step(); s.step();
      expect(s.client(2).of('sceneDeath').map((e) => e.id), name).toContain(d.id);
      // The room: silent, no fade, the collision owners still active -- the flight's polygons left where they stood.
      for (const o of owners) expect(s.room.world.isActive(o.path), o.path).toBe(true);
      expect(s.room.world.drawn(d.root), name).toBe(true);
      // The page: the told death's presentation run fades the root over the motion's lifetime, then takes it away.
      const lifetime = (ops(d.program).find((o) => o.op === 'motion') as Extract<EffectOp, { op: 'motion' }>).motion.lifetime;
      expect(page.takeDeath(d.id, false), name).toBe(true);
      page.step(0.1);
      expect(faded.has(d.root), name).toBe(true);
      expect(page.drawn(d.root), name).toBe(true);
      page.step(lifetime);
      expect(page.drawn(d.root), name).toBe(false);
      for (const o of owners) expect(page.isActive(o.path), o.path).toBe(true);
    }
    expect(SCENE_NODE_MOTION_PLACEHOLDER).toBe('fadeOverLifetime');
  }, 120_000);

  it.skipIf(!PRESENT)('(2) no light is bound to a lamp: no light node under lights_outdoorN, no LIGHT command in its death', async () => {
    const models = parseSceneGraph(Zar.parse(zdbMember(MP6!, parseZdb(MP6!), 'MP6_GEO.ZED')));
    const byName = new Map(models.map((m) => [m.name, m]));
    const lights = (n: SceneNode, path: string, out: string[]): string[] => {
      const p = `${path}/${n.name}`;
      if (n.type === NODE_LIGHT) out.push(p);
      for (const c of n.children) lights(c, p, out);
      const proto = n.modelName ? byName.get(n.modelName) : undefined;
      if (proto && proto !== n) for (const c of proto.children) lights(c, `${p}=${proto.name}`, out);
      return out;
    };
    const world = byName.get('worldmodel')!;
    const lamps = world.children.filter((c) => /^lights_outdoor[1-9]$/.test(c.name));
    expect(lamps).toHaveLength(9);
    for (const l of lamps) expect(lights(l, 'worldmodel', []), l.name).toEqual([]);
    // The map's one placed light node is the bar's bulb, which no health record names.
    expect(world.children.flatMap((c) => lights(c, 'worldmodel', []))).toEqual(['worldmodel/lightbulb3/lightbulb=lightbulb/lightsource']);
    const s = await roomOn(FIXTURES, 'MP6');
    const scene = s.map.meta!.scene!;
    for (const d of scene.destructibles.filter((x) => /^lights_outdoor/.test(x.anim))) {
      expect(ops(d.program).map((o) => o.op), d.anim).toEqual(['sound', 'motion']);
    }
    expect(scene.destructibles.filter((d) => /lightbulb/.test(d.root))).toEqual([]);
  }, 120_000);

  it.skipIf(!PRESENT)("(3) INVALIDATE_ANIMATION: tire_pile_hit, barrel_dest, truck_stop_hitme and cig_fly1..7 each invalidate themselves; once run, a start is refused until the round's reset", async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const scene = s.map.meta!.scene!;
    const all = [...scene.destructibles.map((d) => d.program), ...scene.programs.map((p) => p.program)];
    const invalidating = [...new Set(all.filter((p) => ops(p).some((o) => o.op === 'invalidate')).map((p) => p.name))].sort();
    expect(invalidating).toEqual(['barrel_dest', 'cig_fly1', 'cig_fly2', 'cig_fly3', 'cig_fly4', 'cig_fly5', 'cig_fly6', 'cig_fly7', 'tire_pile_hit', 'truck_stop_hitme']);
    for (const name of invalidating) {
      const p = all.find((q) => q.name === name)!;
      expect(ops(p).filter((o) => o.op === 'invalidate'), name).toEqual([{ op: 'invalidate', anim: name }]);
      expect(ops(p).filter((o) => o.op === 'other' && o.cmd === 49), name).toEqual([]);
    }
    const world = s.room.world;
    const ctx = { root: null, nodes: [], caller: null, valve: null, silent: true };
    // The tire pile's death runs and invalidates itself: a second start of it is refused in the round.
    const tire = scene.destructibles.find((d) => d.anim === 'tire_pile_hit')!;
    expect(world.health.hitAt(tire.targetPath, { kind: 'impact', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(world.runProgram(tire.program, ctx)).toBeNull();
    // The ashtray's death calls cig_fly1..3, each of which invalidates itself: a later start of cig_fly1 is refused.
    const cig = scene.programs.find((p) => p.program.name === 'cig_fly1')!.program;
    const cig4 = scene.programs.find((p) => p.program.name === 'cig_fly4')!.program;
    const ash = scene.destructibles.find((d) => d.anim === 'ashtray')!;
    expect(world.runProgram(cig4, ctx)).not.toBeNull();                 // never run this round: it starts
    expect(world.health.hitAt(ash.targetPath, { kind: 'impact', rating: 1, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(world.runProgram(cig, ctx)).toBeNull();
    expect(world.runProgram(cig4, ctx)).toBeNull();                     // its own run invalidated it
    // The round's reset starts the set again (FUN_0026c600 clears +0x34 bit 0): each starts once more.
    world.reset();
    expect(world.runProgram(cig, ctx)).not.toBeNull();
    expect(world.runProgram(tire.program, ctx)).not.toBeNull();
  }, 120_000);

  it.skipIf(!PRESENT)("(4) a placed node's translate / rotate / fromTo draws nothing (SCENE_NODE_TRANSFORM_PLACEHOLDER): the sky, the bugs, the bees, the camera jiggle", async () => {
    expect(SCENE_NODE_TRANSFORM_PLACEHOLDER).toBe('drawsNothing');
    const s = await roomOn(FIXTURES, 'MP6');
    const scene = s.map.meta!.scene!;
    const moving = [...new Set(scene.programs.map((p) => p.program)
      .filter((p) => ops(p).some((o) => (o.op === 'translate' || o.op === 'rotate' || o.op === 'fromTo') && o.node !== NODE_CALLER))
      .map((p) => p.name))].sort();
    expect(moving).toEqual(['bee1', 'bee2', 'bee3', 'bee4', 'bee5', 'bug1', 'bug2', 'bug3', 'bug4', 'bug5', 'bug6', 'bug7', 'bug8', 'camera_jiggle', 'testexplode', 'translate_sky']);
    // The page's world runs the autostarts (the sky, the bugs, the bees, the jiggle): none of the moved nodes is drawn
    // anywhere else or hidden, nothing reaches a hook for them -- the world has no per-node transform to give.
    const touched: string[] = [];
    const page = new WorldState(s.map.meta!, s.map.ground!, groundGrid(s.map.ground!), {
      visible: (p) => touched.push(p), opacity: (p) => touched.push(p),
    });
    page.runAutostartPrograms = true;
    page.applyInitial();
    for (let i = 0; i < 60; i++) page.step(1 / 30);
    const moved = /\/(mp6_skydome|bug[1-8]|bee[1-5]|camera_effects)$/;
    expect(touched.filter((p) => moved.test(p))).toEqual([]);
    // The sky and the bees stand drawn where placed; the bugs' and the jiggle's nodes are placed nowhere on MP6.
    for (const path of ['worldmodel/mp6_skydome', 'worldmodel/bees/bee1']) expect(page.drawn(path), path).toBe(true);
    expect(s.map.meta!.instances.filter((i) => /^(bug[1-8]|camera_effects)$/.test(i.node))).toEqual([]);
  }, 120_000);

  it.skipIf(!PRESENT)("(5) the door's ai::EVENT and ai::SIGNAL: signal 1 to the context's first ai::SELECT entry (+4 0, +8 1); the door runs them as nothing", () => {
    const archive = parseAnimSets(Zar.parse(zdbMember(MP6!, parseZdb(MP6!), 'MZANIM.ZAR')));
    const door = archive.sets.flatMap((x) => x.anims).find((a) => a.name === 'singleDoor_right')!;
    const set2 = door.sequences.flatMap((q) => q.commands.filter((c) => c.set === 2).map((c) => [q.name, c.cmd, c] as const));
    expect(set2.map(([q, cmd]) => `${q}:${cmd}`)).toEqual(['open:16', 'open:20', 'open:5', 'open:26', 'close:16', 'close:20', 'close:26']);
    for (const [, cmd, c] of set2.filter(([, k]) => k === 26)) {
      const v = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
      expect([cmd, v.getUint32(4, true), c.bytes[8], v.getInt16(0xc, true)]).toEqual([26, 0, 1, 0]);
    }
    const decoded = door.sequences.flatMap((q) => q.commands.filter((c) => c.set === 2).map((c) => decodeEffectOp(c, door.names)));
    expect(decoded.filter((o) => o.op === 'other').map((o) => (o as Extract<EffectOp, { op: 'other' }>).name)).toEqual(['ai::MOVE', 'ai::EVENT', 'ai::SIGNAL', 'ai::MOVE', 'ai::SIGNAL']);
  });
});

describe(`DF-6 review F2: a start the invalidation refuses is no start${SKIP}`, () => {
  it.skipIf(!PRESENT)('executeAction and runDisplay answer false for an animation invalidated this round, true again after the reset', async () => {
    const s = await roomOn(FIXTURES, 'MP6');
    const world = new WorldState(s.map.meta!, s.map.ground!, groundGrid(s.map.ground!), {});
    world.applyInitial();
    const invalidate = (anim: string): EffectProgram => ({ name: 'zz_invalidate', root: 0, flags: 0, nodes: [], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'invalidate', anim }] }] });
    const ctx = { root: null, nodes: [], caller: null, valve: null, silent: false };
    world.runProgram(invalidate('destroy_access1'), ctx);
    world.runProgram(invalidate('cig_fly1'), ctx);
    expect(world.executeAction('set_access1')).toBe(false);      // access_action1's animation: refused, not started
    expect(world.running('destroy_access1')).toBe(false);
    expect(world.runDisplay('cig_fly1')).toBe(false);
    world.reset();
    expect(world.runDisplay('cig_fly1')).toBe(true);
    expect(world.executeAction('set_access1')).toBe(true);
  }, 120_000);
});

/** Night Stalker (MP7) off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`): offered, so the change is seen there. */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const MP7 = DISC !== '' && existsSync(join(DISC, 'RUN', 'MP7.ZDB'));

describe(`DF-6 review F1: MP7's second spinner_hit and destroy_lamp in a round start nothing${MP7 ? '' : ' (skipped: MP7 on the disc absent)'}`, () => {
  it.skipIf(!MP7)("ant_base1 then ant_base2: spinner_hit starts once; sealtable1 then sealtable2: destroy_lamp starts once; again after the reset", async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/MP7.ZDB');
    const scene = map.meta!.scene!;
    const world = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!), {});
    world.applyInitial();
    const all = [...scene.destructibles.map((d) => d.program), ...scene.programs.map((p) => p.program)];
    for (const name of ['spinner_hit', 'destroy_lamp']) {
      expect(ops(all.find((p) => p.name === name)!).filter((o) => o.op === 'invalidate'), name).toEqual([{ op: 'invalidate', anim: name }]);
    }
    // Every start the world makes, by name (a refused one answers null and is not counted).
    const started: string[] = [];
    const run = world.runProgram.bind(world);
    world.runProgram = (program, ctx, action) => { const r = run(program, ctx, action); if (r) started.push(program.name); return r; };
    const kill = (anim: string): void => {
      const d = scene.destructibles.find((x) => x.anim === anim && ops(x.program).length > 0)!;
      expect(world.health.hitAt(d.targetPath, { kind: 'impact', rating: 50, modifier: 0, point: [0, 0, 0] }), anim).toEqual({ applied: true, died: true });
      world.step(0.05);
    };
    const count = (name: string): number => started.filter((n) => n === name).length;
    const round = (): void => {
      started.length = 0;
      kill('ant_base1'); kill('ant_base2');
      expect([count('ant_base1'), count('ant_base2'), count('spinner_hit')]).toEqual([1, 1, 1]);
      kill('sealtable1'); kill('sealtable2');
      expect([count('sealtable1'), count('sealtable2'), count('destroy_lamp')]).toEqual([1, 1, 1]);
    };
    round();
    world.reset();
    round();                                                         // the reset starts the set again: each runs once more
  }, 120_000);
});
