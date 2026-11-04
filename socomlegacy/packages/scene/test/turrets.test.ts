import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZdb, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readArsenal } from '../src/arsenal';
import { flattenScene, type SceneInstance } from '../src/buildScene';
import { parseSceneGraph, transformPoint } from '../src/sceneGraph';
import { matchTurretDef, parseTurretDefs, readTurrets, teamMask, turretDefsOf, turretSceneModels, turretScopeHidden, type TurretPlacement } from '../src/turrets';

/**
 * MAP-10a (web sprint 27; research 177 s2-s4, 173 s2, 215): the manual turrets' data layer -- `ai_turrets.rdr`'s
 * definitions, the first case-sensitive prefix match, the three parts beneath the placed root, the authored limits and
 * the ammunition `Ammo_Capacity x NumMags`. The synthetic half holds the match rule; the fixture half Crossroads' two and
 * Frostfire's excluded `tank1`s; the disc half Vigilance's four.
 */

/** One `TURRET` definition as `parseRdr` spells it: the name, then its record (a bare flag has no value list). */
const def = (name: string, limits: [string, string, string, string] = ['-30', '30', '-20', '45']): RdrNode[] => [name, [
  'MANUAL', 'MOUNTABLE_ANGLE', ['35'], 'HEALTH', ['30'], 'PARTS', ['turret', 'gun', 'firepoint'],
  'LIMITS', ['YAW', [limits[0], limits[1]], 'PITCH', [limits[2], limits[3]]], 'RATES', ['YAW', ['1.5'], 'PITCH', ['1.5']],
  'WEAPON', ['NAME', ['PKM TURRET'], 'AMMO', ['7.62 x 54 R']], 'TEAM', ['30'],
]];
const script = (...defs: RdrNode[][]): RdrNode => [['TURRET', defs.flat()]];

const READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const MP72 = fixture('RUN/MP72.ZDB'), MP2 = fixture('RUN/MP2.ZDB');
const DEG = Math.PI / 180;
const byName = (list: TurretPlacement[], name: string): TurretPlacement => {
  const t = list.find((p) => p.name === name);
  if (!t) throw new Error(`no placement ${name} in ${list.map((p) => p.name).join(', ')}`);
  return t;
};

/**
 * PAR-44 (research 215 s7.5): the hold's place, `turret+0x1c` -- copied by the turret's vfunc `+0x10` (0x3a9320) from the
 * translation of `turret+0x300`, which `FUN_003a8f50` sets to the world matrix of the yaw part's parent node
 * (D:L300412-300413) -- against the placement's `origin` (the placed root's world origin, `placeTurrets`). The yaw part is
 * the first of `PARTS` (`FUN_003a76d0` yaws it, D:L299519-299528); its parent here is the node its path hangs under in the
 * realised scene (`flattenScene`), and the instance node above that.
 */
function yawParents(zdb: Uint8Array, stem: string, list: TurretPlacement[]): { name: string; origin: number[]; parent: number[]; instance: number[] }[] {
  const toc = parseZdb(zdb);
  const models = turretSceneModels(zdb, toc, stem, parseSceneGraph(Zar.parse(zdbMember(zdb, toc, `${stem}_GEO.ZED`))));
  const flat = flattenScene(models);
  const at = (path: string): SceneInstance => {
    const f = flat.find((x) => x.path === path);
    if (!f) throw new Error(`no node at ${path}`);
    return f;
  };
  return list.map((t) => {
    const parentPath = t.parts.turret.slice(0, t.parts.turret.lastIndexOf('/'));
    const instancePath = parentPath.slice(0, parentPath.lastIndexOf('='));
    return { name: t.name, origin: [...t.origin], parent: transformPoint(at(parentPath).world, 0, 0, 0), instance: transformPoint(at(instancePath).world, 0, 0, 0) };
  });
}
const round3 = (v: readonly number[]): number[] => v.map((x) => Number(x.toFixed(3)) + 0);

describe('ai_turrets.rdr over a hand-built script', () => {
  it('ai_turrets.rdr: a definition is matched by a case-sensitive prefix of the placed name, the first in file order (FUN_003aac40 D:L301416-301445; mp62turret2 would take mp62turret)', () => {
    const defs = turretDefsOf(script(def('mp62MGLturret '), def('mp62turret', ['-70', '70', '-50', '15']), def('mp62turret2'), def('mp9_turret')));
    expect(defs.map((d) => d.name)).toEqual(['mp62MGLturret ', 'mp62turret', 'mp62turret2', 'mp9_turret']);
    expect(matchTurretDef(defs, 'mp62turret2')?.name).toBe('mp62turret');      // the shorter, earlier template wins
    expect(matchTurretDef(defs, 'mp62turret')?.name).toBe('mp62turret');
    expect(matchTurretDef(defs, 'mp9_turret01')?.name).toBe('mp9_turret');     // a suffixed placement
    expect(matchTurretDef(defs, 'mp62MGLturret ')?.name).toBe('mp62MGLturret ');
    expect(matchTurretDef(defs, 'mp62MGLturret')).toBeNull();                  // the template's trailing space is a byte
    expect(matchTurretDef(defs, 'MP62turret2')).toBeNull();                    // never lower-cased
    expect(matchTurretDef(defs, 'mp62turre')).toBeNull();                      // the placed name shorter than the template
    expect(matchTurretDef(defs, 'xmp9_turret')).toBeNull();                    // a prefix, not a substring
    const reversed = turretDefsOf(script(def('mp62turret2'), def('mp62turret')));
    expect(matchTurretDef(reversed, 'mp62turret2')?.name).toBe('mp62turret2'); // file order decides, not the length
    const t = defs[1]!;
    expect(t).toMatchObject({ index: 1, manual: true, thermal: false, parts: ['turret', 'gun', 'firepoint'], health: 30, weapon: 'PKM TURRET', ammo: '7.62 x 54 R', team: { list: [30], mask: 0x40000000 } });
    expect(t.limitsDeg).toEqual({ yaw: [-70, 70], pitch: [-50, 15] });
    expect(t.rates).toEqual({ yaw: 1.5, pitch: 1.5 });
    expect(t.mountRange).toBe(22);                                             // absent: the loader's 22 (D:L301643-301648)
    expect(t.mountAngle).toBe(35);
  });
});

describe('TEAM as the game reads it', () => {
  it("TEAM's listed indices become a mask, 1 << n each (FUN_00533c10 D:L400719-400762): (30) is 1 << 30, (1 3) is 0b1010; the list is kept beside it", () => {
    const two = turretDefsOf(script(['t', ['MANUAL', 'PARTS', ['turret', 'gun', 'firepoint'], 'TEAM', ['1', '3']]]))[0]!;
    expect(two.team).toEqual({ list: [1, 3], mask: 0b1010 });
    expect(turretDefsOf(script(def('t')))[0]!.team).toEqual({ list: [30], mask: 0x40000000 });
    expect(turretDefsOf(script(['t', ['MANUAL']]))[0]!.team).toBeNull();          // no TEAM key: nothing written
    expect(teamMask([31])).toBe(0x80000000);                                        // unsigned
    expect(teamMask([2, 40, 1])).toBe(40);                                          // past 31 the walk returns the value itself
  });
});

describe.skipIf(!READERC || !ZWEAPON || !MP72 || !MP2)(`the turrets off the fixtures${READERC && ZWEAPON && MP72 && MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const defs = READERC ? parseTurretDefs(Zar.parse(READERC)) : [];
  const arsenal = ZWEAPON ? readArsenal(ZWEAPON) : null;

  it("MP72 places mp72_turret01 (PKM TURRET, yaw -10..110, pitch -45..35, at 600.394/56.188/1595.459) and mp72_turret02 (LMG TURRET, +-70/+-45, at 2129.683/112.5/1462.799), each with turret, gun and firepoint beneath it; range 22 default, authored angle 35 and health 30", () => {
    expect(defs).toHaveLength(45);
    const list = readTurrets(MP72!, 'MP72', defs, arsenal);
    expect(list.map((t) => t.name).sort()).toEqual(['mp72_turret01', 'mp72_turret02']);
    expect(list.map((t) => t.id)).toEqual([0, 1]);
    const want = {
      mp72_turret01: { weapon: 'PKM TURRET', model: 'RMG_turret', yaw: [-10, 110], pitch: [-45, 35], at: [600.394, 56.188, 1595.459] },
      mp72_turret02: { weapon: 'LMG TURRET', model: 'LMG_turret', yaw: [-70, 70], pitch: [-45, 45], at: [2129.683, 112.5, 1462.799] },
    } as const;
    for (const [name, w] of Object.entries(want)) {
      const t = byName(list, name);
      expect(t.root, name).toBe(`worldmodel/${name}`);
      expect(t.def.name, name).toBe(name);
      expect(t.weapon, name).toBe(w.weapon);
      const lib = `worldmodel/${name}/${w.model}=${w.model}`;
      expect(t.parts, name).toEqual({ turret: `${lib}/turret`, gun: `${lib}/turret/gun`, firepoint: `${lib}/turret/gun/firepoint` });
      t.origin.forEach((v, i) => expect(v, `${name} ${i}`).toBeCloseTo(w.at[i]!, 3));
      expect(t.def.limitsDeg, name).toEqual({ yaw: w.yaw, pitch: w.pitch });
      t.limits.yaw!.forEach((v, i) => expect(v).toBeCloseTo(w.yaw[i]! * DEG, 6));
      t.limits.pitch!.forEach((v, i) => expect(v).toBeCloseTo(w.pitch[i]! * DEG, 6));
      expect(t.mountRange, name).toBe(22);
      expect(t.mountAngleCos, name).toBeCloseTo(Math.cos(35 * DEG), 7);
      expect(t.def, name).toMatchObject({ manual: true, thermal: false, health: 30, mountAngle: 35, rates: { yaw: 1.5, pitch: 1.5 }, team: { list: [30], mask: 1 << 30 } });
    }
  });

  it("a name match without all three parts is no turret: Frostfire's tank1 x4 (177 s2)", () => {
    const tank = matchTurretDef(defs, 'tank1');
    expect(tank).toMatchObject({ name: 'tank1', manual: false, parts: ['t72_turret', 't72mgun', 'firepoint_mgun'] });
    const report: string[] = [];
    expect(readTurrets(MP2!, 'MP2', defs, arsenal, (line) => report.push(line))).toEqual([]);
    expect(report.filter((l) => /tank1/.test(l))).toHaveLength(4);             // each named, none placed
  });

  it('ammo is Ammo_Capacity x NumMags off ZWEAPON: PKM TURRET 250 x 3 = 750, LMG TURRET 75 x 3 = 225 (FUN_003a9a80 D:L300864-300866)', () => {
    expect(arsenal!.items.get(205)).toMatchObject({ name: 'PKM TURRET', cls: 'turret', magazine: 250, mags: 3 });
    expect(arsenal!.items.get(207)).toMatchObject({ name: 'LMG TURRET', cls: 'turret', magazine: 75, mags: 3 });
    const list = readTurrets(MP72!, 'MP72', defs, arsenal);
    expect(byName(list, 'mp72_turret01').ammoInit).toBe(750);
    expect(byName(list, 'mp72_turret02').ammoInit).toBe(225);
    expect(readTurrets(MP72!, 'MP72', defs, null).map((t) => t.ammoInit)).toEqual([null, null]);   // no ZWEAPON: unread
  });

  it("PAR-44: the hold's place -- the yaw part's parent's world origin (turret+0x1c, FUN_003a8f50 D:L300412-300413) -- is the placed root's origin on both of Crossroads' turrets", () => {
    const rows = yawParents(MP72!, 'MP72', readTurrets(MP72!, 'MP72', defs, arsenal));
    expect(Object.fromEntries(rows.map((r) => [r.name, round3(r.parent)]))).toEqual({ mp72_turret01: [600.394, 56.188, 1595.459], mp72_turret02: [2129.683, 112.5, 1462.799] });
    for (const r of rows) {
      expect(round3(r.parent), `${r.name} parent`).toEqual(round3(r.origin));
      expect(round3(r.instance), `${r.name} instance`).toEqual(round3(r.origin));
    }
  });
});

// The disc: the served copies (tools/extract-maps.ts), else SOCOM_DISC.
const web = resolve(import.meta.dirname, '../../..');
const onDisc = (name: string): string | undefined => [
  resolve(web, `public/maps/RUN/${name}`),
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, `RUN/${name}`)] : []),
].find((p) => existsSync(p));
const MP51 = onDisc('MP51.ZDB'), DISC_READERC = onDisc('READERC.ZAR'), DISC_ZWEAPON = onDisc('ZWEAPON.ZAR');

describe.skipIf(!MP51 || !DISC_READERC || !DISC_ZWEAPON)('Vigilance off the disc', () => {
  it('Vigilance places mp51_turret01..04, all PKM TURRET', () => {
    const defs = parseTurretDefs(Zar.parse(new Uint8Array(readFileSync(DISC_READERC!))));
    const list = readTurrets(new Uint8Array(readFileSync(MP51!)), 'MP51', defs, readArsenal(new Uint8Array(readFileSync(DISC_ZWEAPON!))));
    expect(list.map((t) => t.name).sort()).toEqual(['mp51_turret01', 'mp51_turret02', 'mp51_turret03', 'mp51_turret04']);
    for (const t of list) {
      expect(t.def.name, t.name).toBe('mp51_turret');
      expect(t.weapon, t.name).toBe('PKM TURRET');
      expect(t.ammoInit, t.name).toBe(750);
      expect(t.def.thermal, t.name).toBe(false);
      expect(Object.values(t.parts).every((p) => p.startsWith(`${t.root}/`)), t.name).toBe(true);
    }
  });

  it("PAR-44: the hold's place -- the yaw part's parent's world origin (turret+0x1c, FUN_003a8f50 D:L300412-300413) -- is the placed root's origin on Vigilance's four", () => {
    const defs = parseTurretDefs(Zar.parse(new Uint8Array(readFileSync(DISC_READERC!))));
    const zdb = new Uint8Array(readFileSync(MP51!));
    const rows = yawParents(zdb, 'MP51', readTurrets(zdb, 'MP51', defs, null));
    expect(rows).toHaveLength(4);
    expect(Object.fromEntries(rows.map((r) => [r.name, round3(r.parent)]))).toEqual({
      mp51_turret01: [1237.637, 89.061, 948.578], mp51_turret02: [478.582, 97.313, 792.475],
      mp51_turret03: [687.607, 148.035, 1201.95], mp51_turret04: [1355.478, -14.58, 459.676],
    });
    for (const r of rows) {
      expect(round3(r.parent), `${r.name} parent`).toEqual(round3(r.origin));
      expect(round3(r.instance), `${r.name} instance`).toEqual(round3(r.origin));
    }
  });
});

/**
 * LATER 166: a placed turret shows its model's `thermal_scope` node only on a THERMAL definition and its `scope` node only
 * on a plain one -- `FUN_003a9a80` at the turret's making (D:L300804-300828: the nodes by name, 0x3fbfd0 `scope`, 0x3fbfd8
 * `thermal_scope`, each shown by `+0x298`, D:L300794) and `FUN_003a9ea0` at the mount and the release (D:L300898-300928).
 * Synthetic: no THERMAL map is in the fixtures (MP5, MP61, MP62's PKMs, MP64, MP73's PKMs and MP83 carry it, research 177).
 */
describe('LATER 166: turretScopeHidden -- thermal_scope on a THERMAL turret only, scope on a plain one only', () => {
  const at = (root: string, thermal: boolean) => ({ root, def: { thermal } as TurretPlacement['def'] });
  const placed = [at('worldmodel/hot', true), at('worldmodel/cold', false), at('worldmodel/icy', false)];
  it('hides the other kind beneath each root, a segment `name` or `name=model`; leaves every other path', () => {
    const rows: [string, boolean][] = [
      ['worldmodel/hot/RMG_turret=RMG_turret/turret/gun/thermal_scope', false],
      ['worldmodel/hot/RMG_turret=RMG_turret/turret/gun/scope', true],
      ['worldmodel/hot/RMG_turret=RMG_turret/turret/gun/scope=scope_mdl/lens', true],
      ['worldmodel/hot/RMG_turret=RMG_turret/turret/gun', false],
      ['worldmodel/cold/LMG_turret=LMG_turret/turret/gun/thermal_scope', true],
      ['worldmodel/cold/LMG_turret=LMG_turret/turret/gun/thermal_scope=x/glass', true],
      ['worldmodel/cold/LMG_turret=LMG_turret/turret/gun/scope', false],
      ['worldmodel/cold/LMG_turret=LMG_turret/turret/gun/belt', false],
      ['worldmodel/coldframe/thermal_scope', false],                       // a root's name as a prefix only: not beneath it
      ['worldmodel/elsewhere/thermal_scope', false],                       // beneath no turret: not the rule's
      ['worldmodel/icy=LMG_turret/turret/gun/thermal_scope', true],         // the review's F1: an instance root (`root=model`), plain
      ['worldmodel/cold/thermal_scopes', false],                           // a longer name is another node
    ];
    for (const [path, hidden] of rows) expect([path, turretScopeHidden(placed, path)]).toEqual([path, hidden]);
  });
});
