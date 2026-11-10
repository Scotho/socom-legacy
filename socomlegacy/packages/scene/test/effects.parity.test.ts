// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, parseZdb, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  calledPrograms, decodeEffectOp, decodeEffectProgram, launchMotion, NODE_CALLER, lightRange, materialTable, MOTION, parseAnimSets, soilsTable,
  stepMotion, type EffectOp, type EffectProgram, type MotionWorld, type ObjectMotion, type SurfaceMaterial, type ZAnimLight,
} from '../src/index';

/**
 * TA-COMBATFX: the gunplay's and the explosions' effect pins (socomlegacy/docs/research/89-effects.md), registered in
 * docs/parity/registry/combatfx.json. `test/golden/effectsFrostfire.json` pins the programs Frostfire's `CZANIM.ZAR` and
 * `MZANIM.ZAR` decode to (the casing, the muzzles, the explosions, their lights) and, per material, the bullet impact
 * the archive holds; the unit tests drive the casing's flight and the lights' keys from those decoded commands with no
 * game data. The last block re-derives the pin from the archive (it skips without the fixtures).
 */

interface Impact { anim: string; sounds: string[]; calls: string[]; sources: number }
interface FxPin { programs: Record<string, EffectProgram>; bulletImpacts: Record<string, Impact | null>; grenadeHits: string[]; fragMaterials: string[] }
const PIN = JSON.parse(readFileSync(new URL('./golden/effectsFrostfire.json', import.meta.url), 'utf8')) as FxPin;
const SOILS_PIN = (JSON.parse(readFileSync(new URL('./golden/soils.json', import.meta.url), 'utf8')) as { soils: SurfaceMaterial[] }).soils;

const programs = new Map(Object.entries(PIN.programs));
const ops = (name: string): EffectOp[] => PIN.programs[name]!.sequences.flatMap((s) => s.ops);
const motions = (name: string): ObjectMotion[] => ops(name).filter((o) => o.op === 'motion').map((o) => (o as { motion: ObjectMotion }).motion);
const light = (name: string): ZAnimLight => (ops(name).find((o) => o.op === 'light') as { light: ZAnimLight }).light;
/** A polygon's material byte: SOILS entry `i` is byte `i + 2` (the table's two built-ins first; research 89 §5). */
const byte = (name: string): number => materialTable(SOILS_PIN).findIndex((m) => m.name === name);

/** A synthetic floor at y 0 of material byte `material`, its normal up: the casing's floor probe's answer. */
const floor = (material: number): MotionWorld => ({
  segment: () => null,
  floor: (from) => ({ point: [from[0], 0, from[2]], normal: [0, 1, 0], material }),
});

describe('the round\'s muzzle effects (FUN_005c5340, research 89 section 4)', () => {
  it('muzzle_m4SD runs shell_eject and shell_smoke_med and no flash; muzzle_m4 adds flash_fire_hider; the _zoom variants show a light or nothing', () => {
    expect(ops('muzzle_m4SD')).toEqual([{ op: 'call', anim: 'shell_eject' }, { op: 'call', anim: 'shell_smoke_med' }]);
    expect(calledPrograms(programs, 'muzzle_m4SD')).toEqual(new Set(['muzzle_m4SD', 'shell_eject', 'shell_smoke_med']));
    expect([...calledPrograms(programs, 'muzzle_m4')].sort()).toEqual(['flash_fire_hider', 'muzzle_m4', 'shell_eject', 'shell_smoke_med']);
    expect(ops('muzzle_m4SD_zoom').map((o) => (o as { anim: string }).anim)).toEqual(['zoom_fire_silent', 'shell_smoke_med']);
    expect(ops('muzzle_m4_zoom').map((o) => (o as { anim: string }).anim)).toEqual(['zoom_flash_fire', 'shell_smoke_med']);
  });

  it('the muzzle smoke is switched off in the data: shell_smoke_med\'s source sets itself inactive (flags A bit 1 set, bit 2 clear); shell_smoke_big\'s is on', () => {
    const med = (ops('shell_smoke_med').find((o) => o.op === 'particles') as { source: { flagsA: number; setActive: boolean | null; name: string } }).source;
    expect(med.flagsA).toBe(0x37ffbfd1);
    expect([med.flagsA & 1, med.flagsA & 2]).toEqual([1, 0]);
    expect(med.setActive).toBe(false);
    expect(med.name).toBe('blue_smoke01');
    const big = (ops('shell_smoke_big').find((o) => o.op === 'particles') as { source: { setActive: boolean | null } }).source;
    expect(big.setActive).toBe(true);
  });

  it('zoom_flash_fire is a light at the caller, (204, 173, 120) lerped (0x44), 5/12 -> 15/60 -> 0 in 0.1 s', () => {
    const l = light('zoom_flash_fire');
    expect(l.node).toBe(-6);
    expect(l.blend).toBe(0x44);
    expect(l.rgb.map(Math.round)).toEqual([204, 173, 120]);
    expect(lightRange(l, 0)).toEqual([5, 12]);
    expect(lightRange(l, 0.025).map((v) => +v.toFixed(3))).toEqual([10, 36]);
    expect(lightRange(l, 0.2)).toEqual([0, 0]);
  });
});

describe('the casing (shell_eject: OBJECT_MOTION, FUN_00262690 / FUN_00261370)', () => {
  const [full, cheap] = motions('shell_eject') as [ObjectMotion, ObjectMotion];

  it('the full flight under the bullet_ejecting valve below 5, the cheap one past it: at most four casings bounce at once', () => {
    const seq = ops('shell_eject');
    expect(seq[0]).toEqual({ op: 'valve', valve: 'bullet_ejecting', operation: 0x0c, operand: 1 });
    const at = seq.findIndex((o) => o.op === 'if');
    expect(seq[at]).toEqual({ op: 'if', conditions: [{ kind: 'valve', valve: 'bullet_ejecting', operation: 4, operand: 5 }] });
    expect((seq[at + 1] as { motion: ObjectMotion }).motion).toBe(full);
    expect([full.flags, cheap.flags]).toEqual([0x0cf3, 0x0c13]);
    expect(full.flags & (MOTION.FLOOR_PROBE | MOTION.LINE_PROBE)).not.toBe(0);
    expect(cheap.flags & (MOTION.FLOOR_PROBE | MOTION.LINE_PROBE)).toBe(0);
  });

  it('flies out at 18.6-26.1 units a second (25-35 along an unnormalised 30-degree zenith), up, under -98', () => {
    const slow = launchMotion(full, [0, 0, 0], null, () => 0, -98, 0.14);
    const fast = launchMotion(full, [0, 0, 0], null, () => 1 - 1e-12, -98, 0.14);
    expect(Math.hypot(...slow.velocity)).toBeCloseTo(18.63, 2);
    expect(Math.hypot(...fast.velocity)).toBeCloseTo(26.09, 2);
    expect(slow.velocity[1]).toBeCloseTo(25 / 3, 9);
    expect(slow.accel).toEqual([0, -98, 0]);
  });

  it('bounces by its material\'s coefficient with its material\'s sound: metal 0.35, stone and asphalt 0.25, wood 0.27, dirt and sand 0.15, grass 0.10, else 0.30 and no sound', () => {
    const table: [string, string | null, number][] = [
      ['METAL_THICK', '.BUL_CASE_METAL', 0.35], ['METAL_THIN', '.BUL_CASE_METAL', 0.35], ['STONE', '.BUL_CAS_STONE', 0.25],
      ['ASPHALT', '.BUL_CAS_STONE', 0.25], ['GRASS', '.BUL_CAS_DIRT', 0.1], ['DIRT', '.BUL_CAS_DIRT', 0.15],
      ['SAND', '.BUL_CAS_SAND', 0.15], ['WOOD_THICK', '.BUL_CAS_WOOD', 0.27], ['WOOD_THIN', '.BUL_CAS_WOOD', 0.27],
      ['SNOW', null, 0.3], ['PERSON', null, 0.3],
    ];
    for (const [name, sound, e] of table) {
      const s = launchMotion(full, [0, 1, 0], null, () => 0, -98, 0.14);
      s.velocity = [0, -100, 0];
      let hit = null;
      for (let k = 0; k < 10 && !hit; k++) hit = stepMotion(full, s, 1 / 60, floor(byte(name)))[0] ?? null;
      expect(hit, name).not.toBeNull();
      expect(hit!.entry?.sound ?? null, name).toBe(sound);
      // Straight down onto a level floor: `1 - (1 - e)|r.n|` is e; the rest of the tick's gravity follows it.
      expect(s.velocity[1], name).toBeLessThanOrEqual(100 * e + 1e-6);
      expect(s.velocity[1], name).toBeGreaterThan(100 * e - 98 / 60 - 1e-6);
    }
  });

  it('is gone at rest or at 1.2 s, the cheap flight at 0.7 s through everything', () => {
    for (const [m, life] of [[full, 1.2], [cheap, 0.7]] as const) {
      const s = launchMotion(m, [0, 10, 0], null, () => 0.5, -98, 0.14);
      let t = 0;
      while (!s.done && t < 3) { stepMotion(m, s, 1 / 60, null); t += 1 / 60; }
      expect(t).toBeCloseTo(life, 1);
      expect(s.position[1]).toBeLessThan(0);
    }
  });
});

describe('the explosions (research 85 section 7.2, research 89 sections 9-10)', () => {
  it('frag_grenade fires FRAG_sparks, dust_explode_long, light_flash_large, bsmoke_explode_large, dust_ground_roll and plays .GREN_MED; frag_grenade_stone runs its puff then frag_grenade', () => {
    const calls = ops('frag_grenade').filter((o) => o.op === 'call').map((o) => (o as { anim: string }).anim);
    expect(calls).toEqual(['FRAG_sparks', 'dust_explode_long', 'light_flash_large', 'bsmoke_explode_large', 'dust_ground_roll']);
    expect(ops('frag_grenade').filter((o) => o.op === 'sound').map((o) => (o as { sound: string }).sound)).toEqual(['.GREN_MED']);
    expect(calledPrograms(programs, 'frag_grenade_stone').has('frag_grenade')).toBe(true);
    expect(ops('frag_grenade_stone').map((o) => o.op)).toEqual(['particles', 'wait', 'call']);
  });

  it('the HE\'s he_grenade: its sparks, dust, plume, smoke, its own light and fire, .GREN_MED', () => {
    expect(ops('he_grenade').filter((o) => o.op === 'call').map((o) => (o as { anim: string }).anim)).toEqual([
      'he_sparks_quick', 'he_sparks_quick', 'dust_explode_long', 'dust_explode_plume', 'bsmoke_explode_large', 'HE_light_flash_large', 'fire_explode_small',
    ]);
    expect(ops('he_grenade').filter((o) => o.op === 'sound').map((o) => (o as { sound: string }).sound)).toEqual(['.GREN_MED']);
  });

  it('the frag\'s light: (214, 242, 217) added (0x48) at the blast, a 100/190 spot shrinking to nothing by 0.5 s; the HE\'s (230, 217, 166) by 0.7 s', () => {
    const frag = light('light_flash_large');
    expect([frag.blend, frag.atContext, frag.opacity]).toEqual([0x48, true, 64]);
    expect(frag.rgb.map(Math.round)).toEqual([214, 242, 217]);
    expect(lightRange(frag, 0)).toEqual([100, 190]);
    expect(lightRange(frag, 0.25)).toEqual([50, 95]);
    expect(lightRange(frag, 0.5)).toEqual([0, 0]);
    const he = light('HE_light_flash_large');
    expect(he.blend).toBe(0x48);
    expect(he.rgb.map(Math.round)).toEqual([230, 217, 166]);
    expect(lightRange(he, 0.35).map((v) => +v.toFixed(3))).toEqual([50, 95]);
    expect(lightRange(he, 0.7)).toEqual([0, 0]);
  });

  it('FRAG_sparks throws its spark node by a fixed launch: still at first, pulled at -200 along (0, 0.556, -0.444) and by gravity', () => {
    const m = motions('FRAG_sparks')[0]!;
    expect(m.flags & MOTION.FIXED_LAUNCH).toBe(MOTION.FIXED_LAUNCH);
    expect(m.direction.map((v) => +v.toFixed(3))).toEqual([0, 0.556, -0.444]);
    const s = launchMotion(m, [0, 0, 0], null, () => 0, -98, 0);
    expect(s.velocity).toEqual([0, 0, 0]);
    expect(s.accel[1]).toBeCloseTo(m.direction[1] * -200 - 98, 6);
    expect(s.accel[2]).toBeCloseTo(m.direction[2] * -200, 6);
  });
});

describe('the bullet impacts per material (FUN_003c4700: "%s_%s" of HitAnimName and the material)', () => {
  it('Frostfire holds bullet_hit_<material> for every material research 89 section 5 lists, and none where it says nothing plays (nor the PENETRATION-1 ones)', () => {
    const none = ['UNKNOWN', 'PARTICLE_SYSTEM', 'ACTION', 'INVISIBLE_DI', 'UNDERWATER', 'BROKEN GLASS', 'SNOWY_TREE', 'METAL_RAILING', 'METAL_GRATE',
      'METAL_GRATE_THIN', 'ITEM', 'CAMO_NET', 'CHAINLINK_FENCE', 'GRASS_VOL', 'BUSH_VOL', 'SNOWY_GRASS_VOL'];
    expect(Object.entries(PIN.bulletImpacts).filter(([, v]) => v === null).map(([k]) => k)).toEqual(none);
    for (const [m, v] of Object.entries(PIN.bulletImpacts)) if (v) expect(v.anim.toLowerCase(), m).toBe(`bullet_hit_${m.toLowerCase()}`);
    expect(Object.keys(PIN.bulletImpacts)).toEqual(materialTable(SOILS_PIN).map((m) => m.name));
  });
});

// ---- the data-backed half -------------------------------------------------------------------------------------------

// Both archives or neither: with READERC.ZAR absent the materials would be the pin's own soils.json, and a stale one
// would go unseen; the test skips rather than key bulletImpacts by the pin it is checking.
const MP2 = fixture('RUN/MP2.ZDB'), READERC = fixture('RUN/READERC.ZAR');
describe(`the effects' pin against Frostfire's archives${MP2 && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2 || !READERC)("effectsFrostfire.json is MP2's CZANIM.ZAR and MZANIM.ZAR, re-decoded", () => {
    const toc = parseZdb(MP2!);
    const all = new Map<string, EffectProgram>();
    for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
      for (const set of parseAnimSets(Zar.parse(zdbMember(MP2!, toc, member))).sets) for (const a of set.anims) if (!all.has(a.name)) all.set(a.name, decodeEffectProgram(a));
    }
    const names = [...all.keys()];
    const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
    const summary = (n: string): Impact => {
      const o = all.get(n)!.sequences.flatMap((s) => s.ops);
      return {
        anim: n, sounds: o.filter((x) => x.op === 'sound').map((x) => (x as { sound: string }).sound),
        calls: o.filter((x) => x.op === 'call').map((x) => (x as { anim: string }).anim), sources: o.filter((x) => x.op === 'particles').length,
      };
    };
    const table = materialTable(soilsTable(parseRdrOf(Zar.parse(READERC!), 'materials.rdr')));
    // Through JSON, as the pin was written (a decoded -0 is the pin's 0).
    expect(JSON.parse(JSON.stringify({
      programs: Object.fromEntries(Object.keys(PIN.programs).map((n) => [n, all.get(n)])),
      bulletImpacts: Object.fromEntries(table.map((m) => {
        const n = lower.get(`bullet_hit_${m.name}`.toLowerCase());
        return [m.name, n === undefined ? null : summary(n)];
      })),
      grenadeHits: names.filter((n) => n.toLowerCase().startsWith('grenade_hit_')).sort(),
      fragMaterials: names.filter((n) => n.toLowerCase().startsWith('frag_grenade_')).sort(),
    }))).toEqual({ programs: PIN.programs, bulletImpacts: PIN.bulletImpacts, grenadeHits: PIN.grenadeHits, fragMaterials: PIN.fragMaterials });
  });
});

const MP6 = fixture('RUN/MP6.ZDB');
const MP2Z = fixture('RUN/MP2.ZDB');

describe(`the damage chain's commands, on the disc's bytes (MAP-06; research 174 s3)${MP6 && MP2Z ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const mission = (bytes: Uint8Array) => parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
  it.skipIf(!MP6 || !MP2Z)("Desert Glory's access1 runs EXECUTE_ACTION set_access1 as set 0 command 87; Frostfire's door_slab calls breakapane, whose DESTRUCTION_SOURCE is at its root", () => {
    const access = mission(MP6!).find((a) => a.name === 'access1')!;
    const c = access.sequences[0]!.commands[0]!;
    expect([c.set, c.cmd, c.size]).toEqual([0, 87, 8]);                 // the pre-dispatch read: the base set, not a registered one
    expect(decodeEffectProgram(access).sequences[0]!.ops).toEqual([{ op: 'executeAction', anim: 'set_access1' }]);
    const ff = mission(MP2Z!);
    expect(decodeEffectProgram(ff.find((a) => a.name === 'door_slab')!).sequences[0]!.ops).toEqual([{ op: 'call', anim: 'breakapane' }]);
    const pane = decodeEffectProgram(ff.find((a) => a.name === 'breakapane')!).sequences[0]!.ops;
    expect(pane.map((o) => o.op)).toEqual(['sound', 'destruction', 'active']);
    expect(pane[1]).toEqual({ op: 'destruction', node: -7 });
    expect(pane[2]).toEqual({ op: 'active', node: -7, on: false });
  });
});

const MP72 = fixture('RUN/MP72.ZDB');

/**
 * XR-01 (web sprint 27; research 213 s2, 171 s4): Crossroads' bridge programs on the fixture's bytes. Offsets are the
 * program's `Seq_Data` offsets research 171 s4 cites (a command's `offset`), so the decode keeps them beside each op.
 */
describe(`Crossroads' bridge programs, on the disc's bytes (XR-01; research 213 s2)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const anims = MP72 ? parseAnimSets(Zar.parse(zdbMember(MP72, parseZdb(MP72), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims) : [];
  const anim = (name: string) => anims.find((a) => a.name === name)!;
  /** Every command of `name` with its offset, decoded. */
  const at = (name: string) => anim(name).sequences.flatMap((s) => s.commands.map((c) => ({ offset: c.offset, set: c.set, cmd: c.cmd, size: c.size, op: decodeEffectOp(c, anim(name).names) })));
  const SITES = ['seal_demo_site1', 'terrorist_demo_site1'];

  it.skipIf(!MP72)('FIRE_WEAPON (57) names MPBOMB / MPBOMB Ammo with its two float overrides 0.001 and 0.01 on both *_demo_site1 and base_explosion1; nothing is read as damage', () => {
    for (const site of SITES) {
      const fires = at(site).filter((c) => c.set === 0 && c.cmd === 57);
      expect(fires.map((c) => [c.offset, c.size])).toEqual([[28, 44], [84, 44]]);
      // The node byte (+8) is an index into the animation's references: damage_point2, then damage_point 0.1 s later.
      expect(fires.map((c) => anim(site).nodeRefs[(c.op as { node: number }).node]!.name)).toEqual(['damage_point2', 'damage_point']);
      expect(fires.map((c) => c.op)).toEqual([
        { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 2, f1: 0.001, f2: 0.01 },
        { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 3, f1: 0.001, f2: 0.01 },
      ]);
    }
    // The base's one command fires at the caller's node: FUN_002c1c30 hands in the planted bomb's (research 171 s8).
    const base = at('base_explosion1');
    expect(base.map((c) => [c.offset, c.set, c.cmd, c.size])).toEqual([[28, 0, 57, 44]]);
    expect(base[0]!.op).toEqual({ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: NODE_CALLER, f1: 0.001, f2: 0.01 });
  });

  it.skipIf(!MP72)('seal_demo_site1 / terrorist_demo_site1: destroyed on, parts on, healthy off at 240/248/256; the two .EXP_1 and three .EXP_DISTANT follow waits 0.15/0.5/0.7/0.9', () => {
    for (const site of SITES) {
      const cmds = at(site), refs = anim(site).nodeRefs;
      const swap = cmds.filter((c) => [240, 248, 256].includes(c.offset)).map((c) => {
        const o = c.op as { op: string; node: number; on: boolean };
        return [c.offset, o.op, refs[o.node]!.name, o.on];
      });
      expect(swap).toEqual([[240, 'active', 'destroyed', true], [248, 'active', 'parts', true], [256, 'active', 'healthy', false]]);
      const tail = cmds.filter((c) => c.offset >= 340).map((c) => c.op.op === 'sound' ? (c.op as { sound: string }).sound : (c.op as { seconds: number }).seconds);
      expect(tail).toEqual(['.EXP_1', Math.fround(0.15), '.EXP_1', Math.fround(0.5), '.EXP_DISTANT', Math.fround(0.7), '.EXP_DISTANT', Math.fround(0.9), '.EXP_DISTANT']);
    }
  });

  it.skipIf(!MP72)("the parts' activation and flyparts do not sit under IF skip_effects == 0: neither *_demo_site1 holds an IF, and no MP72 mission program names skip_effects", () => {
    const FLOW = new Set(['if', 'elseif', 'else', 'endif', 'while', 'endWhile']);
    for (const site of SITES) {
      const cmds = at(site);
      expect(cmds.filter((c) => FLOW.has(c.op.op))).toEqual([]);
      // 248 parts on, then 284-332: FOR_CHILDREN (12 B) over parts, OBJECT_MAKE_WORLDCHILD (8 B), the part on, flyparts, END (8 B).
      const loop = cmds.filter((c) => c.offset >= 248 && c.offset <= 332 && c.offset !== 256 && c.offset !== 264);
      expect(loop.map((c) => [c.offset, c.cmd, c.size])).toEqual([[248, 17, 8], [284, 41, 12], [296, 6, 8], [304, 17, 8], [312, 45, 20], [332, 42, 8]]);
      expect(loop[4]!.op).toEqual({ op: 'call', anim: 'flyparts', caller: 7 });   // research 386 §3.3: the loop's part (FOR_CHILDREN's variable 7) is the callee's NODE_CALLER
    }
    expect(anims.filter((a) => a.names.includes('skip_effects')).map((a) => a.name)).toEqual([]);
  });
});

function parseRdrOf(zar: Zar, name: string): RdrNode {
  return parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === name)!));
}
